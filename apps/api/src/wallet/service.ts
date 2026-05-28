import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma.js'
import { createPixCharge, createPixPayout } from './bspay-client.js'
import type { CreateDepositInput, CreateWithdrawalInput } from './schema.js'

// Saldo real vive sempre na conta type='REAL'. Deposito/saque nunca tocam a DEMO.
async function getRealAccount(userId: string) {
  const account = await prisma.account.findUnique({
    where: { userId_type: { userId, type: 'REAL' } },
  })
  if (!account) throw new Error('REAL_ACCOUNT_NOT_FOUND')
  return account
}

// ── Deposito (cash-in) ────────────────────────────────────────────────────────
// Cria a cobranca no BSPay e registra deposits=pending. O credito do saldo NAO
// acontece aqui — so quando o webhook confirmar o pagamento (confirmDepositPaid).
export async function createDeposit(userId: string, input: CreateDepositInput) {
  const account    = await getRealAccount(userId)
  const externalId = randomUUID()

  const charge = await createPixCharge({ externalId, amount: input.amount })

  const deposit = await prisma.deposit.create({
    data: {
      userId,
      accountId:  account.id,
      externalId,
      bspayId:    charge.bspayId || null,
      amount:     input.amount,
      status:     'pending',
      qrcode:     charge.qrcode || null,
    },
    select: { id: true, amount: true, qrcode: true, status: true, createdAt: true },
  })

  return deposit
}

// Confirma um deposito a partir do webhook do BSPay. IDEMPOTENTE:
// - localiza por external_id (preferencial) ou bspay_id
// - se ja estiver 'confirmed', e no-op (webhook reentregue)
// - credita o saldo da conta REAL pelo valor REGISTRADO no deposito (nunca pelo
//   valor que veio no webhook — nao confiamos no payload pra decidir quanto creditar)
export async function confirmDepositPaid(ref: { externalId?: string; bspayId?: string }) {
  const deposit = await prisma.deposit.findFirst({
    where: ref.externalId ? { externalId: ref.externalId } : { bspayId: ref.bspayId },
  })
  if (!deposit) throw new Error('DEPOSIT_NOT_FOUND')
  if (deposit.status === 'confirmed') return { alreadyConfirmed: true, depositId: deposit.id }

  const amount = Number(deposit.amount)

  await prisma.$transaction([
    prisma.deposit.update({
      where: { id: deposit.id },
      data:  { status: 'confirmed', confirmedAt: new Date() },
    }),
    prisma.account.update({
      where: { id: deposit.accountId },
      data:  { balance: { increment: amount } },
    }),
    prisma.transaction.create({
      data: {
        accountId:   deposit.accountId,
        type:        'DEPOSIT',
        amount,
        description: `Deposito Pix confirmado (R$${amount.toFixed(2)})`,
      },
    }),
  ])

  return { alreadyConfirmed: false, depositId: deposit.id }
}

// Marca deposito como falho (webhook de expiracao/falha). So afeta pending.
export async function markDepositFailed(ref: { externalId?: string; bspayId?: string }) {
  const deposit = await prisma.deposit.findFirst({
    where: ref.externalId ? { externalId: ref.externalId } : { bspayId: ref.bspayId },
  })
  if (!deposit || deposit.status !== 'pending') return
  await prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'failed' } })
}

export async function listDeposits(userId: string) {
  return prisma.deposit.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    take:    50,
    select:  { id: true, amount: true, status: true, qrcode: true, createdAt: true, confirmedAt: true },
  })
}

// ── Saque (cash-out) ──────────────────────────────────────────────────────────
// MAXIMO CUIDADO: exige KYC aprovado, trava o saldo na hora do pedido (debita +
// cria transacao WITHDRAWAL), e fica 'pending' ate um ADMIN aprovar manualmente.
// O payout no BSPay so dispara em approveWithdrawal (fluxo admin).
export async function requestWithdrawal(userId: string, input: CreateWithdrawalInput) {
  const profile = await prisma.profile.findUnique({
    where:  { id: userId },
    select: { kycStatus: true, blockedAt: true },
  })
  if (!profile) throw new Error('PROFILE_NOT_FOUND')
  if (profile.blockedAt) throw new Error('ACCOUNT_BLOCKED')
  if (profile.kycStatus !== 'approved') throw new Error('KYC_REQUIRED')

  const account = await getRealAccount(userId)
  const balance = Number(account.balance)
  if (balance < input.amount) throw new Error('INSUFFICIENT_BALANCE')

  // Debita imediatamente (trava o valor). Se rejeitado/cancelado, devolve em refundWithdrawal.
  const [, withdrawal] = await prisma.$transaction([
    prisma.account.update({
      where: { id: account.id },
      data:  { balance: { decrement: input.amount } },
    }),
    prisma.withdrawal.create({
      data: {
        userId,
        accountId:  account.id,
        amount:     input.amount,
        pixKeyType: input.pixKeyType,
        pixKey:     input.pixKey,
        status:     'pending',
      },
      select: { id: true, amount: true, status: true, pixKey: true, pixKeyType: true, createdAt: true },
    }),
    prisma.transaction.create({
      data: {
        accountId:   account.id,
        type:        'WITHDRAWAL',
        amount:      -input.amount,
        description: `Saque solicitado (R$${input.amount.toFixed(2)}) — aguardando aprovacao`,
      },
    }),
  ])

  return withdrawal
}

export async function listWithdrawals(userId: string) {
  return prisma.withdrawal.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    take:    50,
    select:  { id: true, amount: true, status: true, pixKey: true, pixKeyType: true, createdAt: true, paidAt: true },
  })
}

// ── Fluxo admin do saque ──────────────────────────────────────────────────────
// Aprova e dispara o payout no BSPay. Saldo ja foi debitado no pedido, entao aqui
// so muda status e chama o BSPay. Em caso de falha, marca payout_failed (sem
// re-creditar automaticamente — admin decide reprocessar ou cancelar+refund).
export async function approveWithdrawal(withdrawalId: string, adminId: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } })
  if (!w) throw new Error('WITHDRAWAL_NOT_FOUND')
  if (w.status !== 'pending') throw new Error('WITHDRAWAL_NOT_PENDING')

  await prisma.withdrawal.update({
    where: { id: w.id },
    data:  { status: 'payout_processing', processedAt: new Date(), paidByAdmin: adminId },
  })

  try {
    const payout = await createPixPayout({
      externalId: w.id,
      amount:     Number(w.amount),
      pixKeyType: w.pixKeyType,
      pixKey:     w.pixKey,
    })
    await prisma.withdrawal.update({
      where: { id: w.id },
      data:  { bspayPayoutId: payout.payoutId || null },
    })
    // status final 'paid' vem pelo webhook de confirmacao do payout.
    return { ok: true, payoutId: payout.payoutId }
  } catch (err: any) {
    // Falha sincrona: o payout nao deu certo -> devolve o saldo travado.
    await failWithdrawalAndRefund(w.id, `Falha no payout: ${err.message}`)
    throw new Error('PAYOUT_FAILED')
  }
}

// Marca um saque como payout_failed e DEVOLVE o saldo travado. Caminho unico
// (usado pela falha sincrona e pelo webhook cashout.failed). IDEMPOTENTE: se ja
// estiver em estado terminal (paid/rejected/cancelled/payout_failed), e no-op,
// evitando devolver o saldo duas vezes.
const TERMINAL_STATUSES = new Set(['paid', 'rejected', 'cancelled', 'payout_failed'])

async function failWithdrawalAndRefund(withdrawalId: string, note: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } })
  if (!w || TERMINAL_STATUSES.has(w.status)) return

  const amount = Number(w.amount)
  await prisma.$transaction([
    prisma.withdrawal.update({
      where: { id: w.id },
      data:  { status: 'payout_failed', paymentNotes: note },
    }),
    prisma.account.update({
      where: { id: w.accountId },
      data:  { balance: { increment: amount } },
    }),
    prisma.transaction.create({
      data: {
        accountId:   w.accountId,
        type:        'WITHDRAWAL',
        amount,
        description: `Saque falhou — valor devolvido (${note})`,
      },
    }),
  ])
}

// Chamado pelo webhook cashout.failed.
export async function markWithdrawalPayoutFailed(withdrawalId: string, reason: string) {
  await failWithdrawalAndRefund(withdrawalId, reason)
}

// Rejeita/cancela um saque pending e DEVOLVE o saldo travado.
export async function rejectWithdrawal(withdrawalId: string, adminId: string, reason: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } })
  if (!w) throw new Error('WITHDRAWAL_NOT_FOUND')
  if (w.status !== 'pending') throw new Error('WITHDRAWAL_NOT_PENDING')

  const amount = Number(w.amount)
  await prisma.$transaction([
    prisma.withdrawal.update({
      where: { id: w.id },
      data:  { status: 'rejected', processedAt: new Date(), paidByAdmin: adminId, adminNotes: reason },
    }),
    prisma.account.update({
      where: { id: w.accountId },
      data:  { balance: { increment: amount } },
    }),
    prisma.transaction.create({
      data: {
        accountId:   w.accountId,
        type:        'WITHDRAWAL',
        amount,
        description: `Saque rejeitado — valor devolvido (${reason})`,
      },
    }),
  ])
}

// Confirma o payout via webhook (status -> paid). Idempotente.
export async function confirmWithdrawalPaid(withdrawalId: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } })
  if (!w || w.status === 'paid') return
  await prisma.withdrawal.update({
    where: { id: w.id },
    data:  { status: 'paid', paidAt: new Date() },
  })
}
