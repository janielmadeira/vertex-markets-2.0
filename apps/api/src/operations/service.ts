import { createHash } from 'node:crypto'
import { prisma } from '../prisma.js'
import { redis, KEYS } from '../redis.js'
import { PriceSource } from '@prisma/client'
import type { CreateOperationInput } from './schema.js'

// Tolerancia maxima entre entryPrice enviado pelo cliente e preco atual do servidor.
const ENTRY_PRICE_TOLERANCE = 0.002

// Set de simbolos OTC server-authoritative, alimentado dinamicamente do banco.
// Refresh a cada 30s pega ativos adicionados/desativados via admin sem precisar deploy.
// Se o banco estiver indisponivel no startup, fica vazio ate o proximo refresh dar certo.
let serverAuthSymbols = new Set<string>()
let lastRefreshAt = 0
const REFRESH_INTERVAL_MS = 30_000

async function refreshServerAuthSymbols() {
  try {
    const rows = await prisma.otcAsset.findMany({
      where:  { status: 'ACTIVE' },
      select: { symbol: true },
    })
    serverAuthSymbols = new Set(rows.map(r => r.symbol))
    lastRefreshAt = Date.now()
  } catch (err: any) {
    console.error('[operations] refreshServerAuthSymbols failed:', err.message)
  }
}

// Refresh lazy: se passou o intervalo, recarrega antes de validar.
// Evita setInterval orfao em testes/scripts que importam o modulo sem subir o app.
async function ensureFreshSymbols() {
  if (Date.now() - lastRefreshAt > REFRESH_INTERVAL_MS) await refreshServerAuthSymbols()
}

function isServerAuthoritative(assetSymbol: string): boolean {
  if (serverAuthSymbols.has(assetSymbol)) return true
  const canonical = assetSymbol.replace(/[\/\-\s]/g, '').toUpperCase() + '-OTC'
  return serverAuthSymbols.has(canonical)
}

function canonicalSymbol(assetSymbol: string): string {
  if (serverAuthSymbols.has(assetSymbol)) return assetSymbol
  return assetSymbol.replace(/[\/\-\s]/g, '').toUpperCase() + '-OTC'
}

async function readServerPrice(assetSymbol: string): Promise<number | null> {
  const symbol = canonicalSymbol(assetSymbol)
  const cached = await redis.get(KEYS.price(symbol))
  return cached ? Number(cached) : null
}

function computeAuditHash(parts: {
  operationId: string
  entryPrice:  number
  exitPrice:   number
  openedAt:    Date
  closedAt:    Date
  direction:   string
  amount:      number
  payout:      number
}): string {
  const payload = [
    parts.operationId,
    parts.entryPrice.toFixed(8),
    parts.exitPrice.toFixed(8),
    parts.openedAt.toISOString(),
    parts.closedAt.toISOString(),
    parts.direction,
    parts.amount.toFixed(2),
    String(parts.payout),
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

export async function createOperation(userId: string, input: CreateOperationInput) {
  await ensureFreshSymbols()

  const account = await prisma.account.findUnique({ where: { id: input.accountId } })
  if (!account || account.userId !== userId) throw new Error('ACCOUNT_NOT_FOUND')

  const balance = Number(account.balance)
  if (balance < input.amount) throw new Error('INSUFFICIENT_BALANCE')

  let entryPrice       = input.entryPrice
  let entryPriceSource: PriceSource = PriceSource.CLIENT

  if (isServerAuthoritative(input.assetSymbol)) {
    const serverPrice = await readServerPrice(input.assetSymbol)
    if (serverPrice == null) throw new Error('PRICE_UNAVAILABLE')
    const drift = Math.abs(input.entryPrice - serverPrice) / serverPrice
    if (drift > ENTRY_PRICE_TOLERANCE) throw new Error('PRICE_DIVERGED')
    entryPrice       = serverPrice
    entryPriceSource = PriceSource.SERVER
  }

  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000)

  const [operation] = await prisma.$transaction([
    prisma.operation.create({
      data: {
        accountId:   input.accountId,
        assetId:     input.assetId,
        assetSymbol: input.assetSymbol,
        direction:   input.direction,
        amount:      input.amount,
        payoutPct:   input.payout,
        entryPrice,
        entryPriceSource,
        expiresAt,
      },
    }),
    prisma.account.update({
      where: { id: input.accountId },
      data:  { balance: { decrement: input.amount } },
    }),
    prisma.transaction.create({
      data: {
        accountId:   input.accountId,
        type:        'TRADE_LOSS',
        amount:      -input.amount,
        description: `Operacao aberta: ${input.assetSymbol} ${input.direction}`,
      },
    }),
  ])

  scheduleExpiry(operation.id, input.expiresInSeconds)

  return operation
}

// Liquida uma operacao OPEN: calcula exitPrice, atualiza status, credita conta se ganhou.
// Idempotente: se nao for OPEN (ja liquidada ou inexistente), retorna sem fazer nada.
//
// APENAS PARA PARES OTC (server-authoritative). Pares LIVE (forex/cripto com feed
// real via Twelve Data/Binance) sao liquidados pelo CLIENTE via supabase.rpc
// 'settle_trade' com o preco exato visto no chart. Backend nao tem fonte autoritativa
// de exit price pra esses (so o cliente vê o feed real em tempo real). O sweeper
// trata o caso edge em que o cliente nao liquida (timeout > grace period).
//
// Eh chamada tanto pelo setTimeout (caminho feliz) quanto pelo sweeper (caminho de
// recuperacao apos restart do container, que perde os setTimeout em memoria).
export async function settleOperation(operationId: string): Promise<void> {
  await ensureFreshSymbols()

  const op = await prisma.operation.findUnique({ where: { id: operationId } })
  if (!op || op.status !== 'OPEN') return

  const assetSymbol = op.assetSymbol

  // Non-OTC: nao auto-liquida. Cliente eh responsavel via supabase.rpc('settle_trade').
  // Se cliente nao liquidar, sweeper trata depois do grace period (DRAW = refund).
  if (!isServerAuthoritative(assetSymbol)) return

  const entryPrice = Number(op.entryPrice)
  const amount     = Number(op.amount)
  const payout     = Number(op.payoutPct)
  const direction  = op.direction

  // OTC: pega preco autoritativo do Redis. Se Redis estiver fora, faz fallback
  // pequeno (random walk pequeno em torno do entry) — eh raro e auditavel.
  const serverPrice = await readServerPrice(assetSymbol)
  let exitPrice: number
  let exitPriceSource: PriceSource

  if (serverPrice == null) {
    const change = (Math.random() * 0.01) - 0.005
    exitPrice       = parseFloat((entryPrice * (1 + change)).toFixed(5))
    exitPriceSource = PriceSource.FALLBACK
  } else {
    exitPrice       = serverPrice
    exitPriceSource = PriceSource.SERVER
  }

  const won =
    (direction === 'CALL' && exitPrice > entryPrice) ||
    (direction === 'PUT'  && exitPrice < entryPrice)

  const profit   = won ? parseFloat((amount * (payout / 100)).toFixed(2)) : 0
  const closedAt = new Date()

  const auditHash = computeAuditHash({
    operationId, entryPrice, exitPrice, direction, amount, payout,
    openedAt: op.createdAt, closedAt,
  })

  await prisma.$transaction([
    prisma.operation.update({
      where: { id: operationId },
      data: {
        status:    won ? 'WON' : 'LOST',
        exitPrice,
        exitPriceSource,
        auditHash,
        profit,
        closedAt,
      },
    }),
    ...(won
      ? [
          prisma.account.update({
            where: { id: op.accountId },
            data:  { balance: { increment: amount + profit } },
          }),
          prisma.transaction.create({
            data: {
              accountId:   op.accountId,
              type:        'TRADE_WIN',
              amount:      amount + profit,
              description: `Operacao encerrada: ganho de R$${profit.toFixed(2)}`,
              operationId,
            },
          }),
        ]
      : []),
  ])
}

// Liquida uma operacao non-OTC orfa como DRAW (devolve o valor da entrada).
// Usado pelo sweeper quando o cliente nao liquidou apos grace period (provavelmente
// fechou o navegador). DRAW eh mais justo que LOSS pra essa situacao: o sistema
// nao tem como saber qual era o preco no momento exato da expiracao.
async function settleOrphanAsDraw(operationId: string): Promise<void> {
  const op = await prisma.operation.findUnique({ where: { id: operationId } })
  if (!op || op.status !== 'OPEN') return

  const amount     = Number(op.amount)
  const entryPrice = Number(op.entryPrice)
  const closedAt   = new Date()

  // Audit hash mesmo pra DRAW: documenta que a settlement foi automatica/expirada.
  const auditHash = computeAuditHash({
    operationId, entryPrice, exitPrice: entryPrice, direction: op.direction,
    amount, payout: Number(op.payoutPct),
    openedAt: op.createdAt, closedAt,
  })

  await prisma.$transaction([
    prisma.operation.update({
      where: { id: operationId },
      data: {
        status:          'DRAW',
        exitPrice:       entryPrice,  // sem info, marca = entry (movimento zero)
        exitPriceSource: PriceSource.FALLBACK,
        auditHash,
        profit:          0,
        closedAt,
      },
    }),
    prisma.account.update({
      where: { id: op.accountId },
      data:  { balance: { increment: amount } },  // refund integral
    }),
    prisma.transaction.create({
      data: {
        accountId:   op.accountId,
        type:        'TRADE_DRAW',
        amount,
        description: `Operacao expirada sem liquidacao (cliente offline) - valor devolvido`,
        operationId,
      },
    }),
  ])
}

function scheduleExpiry(operationId: string, expiresInSeconds: number) {
  setTimeout(() => {
    settleOperation(operationId).catch(err =>
      console.error('[expiry] erro ao resolver operacao:', operationId, err)
    )
  }, expiresInSeconds * 1000)
}

// Sweeper: roda periodicamente buscando operacoes OPEN cuja expires_at ja passou.
// Garante que operacoes nao ficam orfas se o container reiniciar (perdendo
// os setTimeout em memoria). Tambem cobre janela em que o setTimeout falha
// silenciosamente por qualquer motivo. Idempotente — settleOperation eh no-op
// se a operacao ja nao estiver OPEN.
let sweeperTimer: NodeJS.Timeout | null = null

// Grace period antes do sweeper liquidar uma operacao non-OTC orfa como DRAW.
// Da tempo do cliente liquidar via supabase.rpc apos um F5 / reconexao.
const NON_OTC_ORPHAN_GRACE_MS = 2 * 60 * 1000  // 2 minutos

export function startOrphanSweeper(intervalMs = 30_000): void {
  if (sweeperTimer) return
  console.log(`[operations] orphan sweeper started (every ${intervalMs}ms)`)

  const tick = async () => {
    try {
      await ensureFreshSymbols()  // precisa pra classificar OTC vs non-OTC corretamente

      const now = new Date()
      const orphans = await prisma.operation.findMany({
        where:  { status: 'OPEN', expiresAt: { lte: now } },
        select: { id: true, assetSymbol: true, expiresAt: true },
        take:   100,  // limite de seguranca por iteracao
      })
      if (orphans.length === 0) return

      let otcSettled = 0
      let drawRefunded = 0
      let waitingGrace = 0

      for (const op of orphans) {
        if (isServerAuthoritative(op.assetSymbol)) {
          // OTC: liquida normalmente com serverPrice do Redis
          await settleOperation(op.id).catch(err =>
            console.error('[operations] sweep OTC settle failed:', op.id, err?.message ?? err)
          )
          otcSettled++
        } else {
          // Non-OTC: cliente eh quem liquida. Da grace period antes de refund.
          const expiredForMs = now.getTime() - op.expiresAt.getTime()
          if (expiredForMs >= NON_OTC_ORPHAN_GRACE_MS) {
            await settleOrphanAsDraw(op.id).catch(err =>
              console.error('[operations] sweep DRAW failed:', op.id, err?.message ?? err)
            )
            drawRefunded++
          } else {
            waitingGrace++
          }
        }
      }

      const parts: string[] = []
      if (otcSettled)    parts.push(`${otcSettled} OTC settled`)
      if (drawRefunded)  parts.push(`${drawRefunded} non-OTC refunded as DRAW`)
      if (waitingGrace)  parts.push(`${waitingGrace} non-OTC waiting grace`)
      if (parts.length)  console.log(`[operations] sweep: ${parts.join(', ')}`)
    } catch (err: any) {
      console.error('[operations] sweep error:', err?.message ?? err)
    }
  }

  sweeperTimer = setInterval(tick, intervalMs)
  // Roda uma vez no startup pra limpar backlog acumulado.
  tick()

  const stop = () => { if (sweeperTimer) clearInterval(sweeperTimer); sweeperTimer = null }
  process.once('SIGTERM', stop)
  process.once('SIGINT',  stop)
}

export async function listOperations(userId: string, accountId?: string) {
  const accounts = await prisma.account.findMany({
    where:  { userId },
    select: { id: true },
  })
  const accountIds = accounts.map(a => a.id)

  if (accountId && !accountIds.includes(accountId)) throw new Error('ACCOUNT_NOT_FOUND')

  return prisma.operation.findMany({
    where:   { accountId: accountId ? accountId : { in: accountIds } },
    orderBy: { createdAt: 'desc' },
    take:    50,
  })
}

export async function getOperation(userId: string, operationId: string) {
  const op = await prisma.operation.findUnique({
    where:   { id: operationId },
    include: { account: { select: { userId: true } } },
  })
  if (!op || op.account.userId !== userId) throw new Error('NOT_FOUND')
  return op
}
