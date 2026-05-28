import type { FastifyInstance } from 'fastify'
import { createDepositSchema, createWithdrawalSchema } from './schema.js'
import {
  createDeposit, listDeposits,
  requestWithdrawal, listWithdrawals,
  approveWithdrawal, rejectWithdrawal,
} from './service.js'

export async function walletRoutes(app: FastifyInstance) {
  // POST /wallet/deposit — gera cobranca Pix (credito vem depois, via webhook)
  app.post('/deposit', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createDepositSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }
    const { sub } = req.user as { sub: string }
    try {
      const deposit = await createDeposit(sub, parsed.data)
      return reply.status(201).send({ deposit })
    } catch (err: any) {
      if (err.message === 'REAL_ACCOUNT_NOT_FOUND') return reply.status(404).send({ error: 'REAL_ACCOUNT_NOT_FOUND' })
      if (err.message === 'BSPAY_NOT_CONFIGURED')    return reply.status(503).send({ error: 'GATEWAY_UNAVAILABLE', message: 'Gateway de pagamento ainda nao configurado.' })
      if (err.message?.startsWith('BSPAY_'))         return reply.status(502).send({ error: 'GATEWAY_ERROR', message: 'Falha ao gerar cobranca. Tente novamente.' })
      throw err
    }
  })

  // GET /wallet/deposits — historico de depositos do usuario
  app.get('/deposits', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    return reply.send({ deposits: await listDeposits(sub) })
  })

  // POST /wallet/withdraw — solicita saque (trava saldo, fica pending p/ aprovacao admin)
  app.post('/withdraw', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createWithdrawalSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }
    const { sub } = req.user as { sub: string }
    try {
      const withdrawal = await requestWithdrawal(sub, parsed.data)
      return reply.status(201).send({ withdrawal })
    } catch (err: any) {
      if (err.message === 'PROFILE_NOT_FOUND')       return reply.status(404).send({ error: 'PROFILE_NOT_FOUND' })
      if (err.message === 'REAL_ACCOUNT_NOT_FOUND')  return reply.status(404).send({ error: 'REAL_ACCOUNT_NOT_FOUND' })
      if (err.message === 'ACCOUNT_BLOCKED')         return reply.status(403).send({ error: 'ACCOUNT_BLOCKED' })
      if (err.message === 'KYC_REQUIRED')            return reply.status(403).send({ error: 'KYC_REQUIRED', message: 'Saque liberado apenas apos aprovacao do KYC.' })
      if (err.message === 'INSUFFICIENT_BALANCE')    return reply.status(422).send({ error: 'INSUFFICIENT_BALANCE' })
      throw err
    }
  })

  // GET /wallet/withdrawals — historico de saques do usuario
  app.get('/withdrawals', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    return reply.send({ withdrawals: await listWithdrawals(sub) })
  })
}

// Rotas admin de saque (montadas com prefixo /admin/wallet, guard requireAdmin).
export async function walletAdminRoutes(app: FastifyInstance) {
  // POST /admin/wallet/withdrawals/:id/approve — aprova e dispara payout no BSPay
  app.post('/withdrawals/:id/approve', { preHandler: [app.authenticate, app.requireAdmin] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    try {
      const result = await approveWithdrawal(id, sub)
      return reply.send(result)
    } catch (err: any) {
      if (err.message === 'WITHDRAWAL_NOT_FOUND')   return reply.status(404).send({ error: 'WITHDRAWAL_NOT_FOUND' })
      if (err.message === 'WITHDRAWAL_NOT_PENDING') return reply.status(409).send({ error: 'WITHDRAWAL_NOT_PENDING' })
      if (err.message === 'PAYOUT_FAILED')          return reply.status(502).send({ error: 'PAYOUT_FAILED', message: 'BSPay recusou o payout; saque marcado como payout_failed.' })
      throw err
    }
  })

  // POST /admin/wallet/withdrawals/:id/reject — rejeita e devolve o saldo
  app.post('/withdrawals/:id/reject', { preHandler: [app.authenticate, app.requireAdmin] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const { reason } = (req.body ?? {}) as { reason?: string }
    try {
      await rejectWithdrawal(id, sub, reason ?? 'Sem motivo informado')
      return reply.send({ ok: true })
    } catch (err: any) {
      if (err.message === 'WITHDRAWAL_NOT_FOUND')   return reply.status(404).send({ error: 'WITHDRAWAL_NOT_FOUND' })
      if (err.message === 'WITHDRAWAL_NOT_PENDING') return reply.status(409).send({ error: 'WITHDRAWAL_NOT_PENDING' })
      throw err
    }
  })
}
