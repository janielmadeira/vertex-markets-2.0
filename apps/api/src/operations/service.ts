import { createHash } from 'node:crypto'
import { prisma } from '../prisma.js'
import { redis, KEYS } from '../redis.js'
import { Prisma, PriceSource } from '@prisma/client'
import { getLiveAsset } from '../market-data/catalog.js'
import type { CreateOperationInput } from './schema.js'

// Tolerancia maxima entre entryPrice enviado pelo cliente e preco atual do servidor.
// Por tipo de ativo: cripto se move mais rapido, tolera drift um pouco maior.
const ENTRY_PRICE_TOLERANCE: Record<'OTC' | 'CRYPTO' | 'FOREX', number> = {
  OTC:    0.002,
  CRYPTO: 0.005,
  FOREX:  0.002,
}

// Cache dos ativos OTC server-authoritative (symbol -> payout/decimals), alimentado
// do banco. Refresh a cada 30s pega ativos adicionados/desativados via admin sem deploy.
// Se o banco estiver indisponivel no startup, fica vazio ate o proximo refresh dar certo.
let otcAssets = new Map<string, { payout: number; decimals: number }>()
let lastRefreshAt = 0
const REFRESH_INTERVAL_MS = 30_000

async function refreshOtcAssets() {
  try {
    const rows = await prisma.otcAsset.findMany({
      where:  { status: 'ACTIVE' },
      select: { symbol: true, payout: true, decimals: true },
    })
    otcAssets = new Map(rows.map(r => [r.symbol, { payout: r.payout, decimals: r.decimals }]))
    lastRefreshAt = Date.now()
  } catch (err: any) {
    console.error('[operations] refreshOtcAssets failed:', err.message)
  }
}

async function ensureFreshSymbols() {
  if (Date.now() - lastRefreshAt > REFRESH_INTERVAL_MS) await refreshOtcAssets()
}

// Deriva o symbol OTC canonico a partir do assetId do front (ex: 'eur-usd-otc' -> 'EURUSD-OTC').
function otcSymbolFromAssetId(assetId: string): string | null {
  const id = assetId.toLowerCase()
  if (!id.endsWith('-otc')) return null
  return id.slice(0, -4).replace(/[-\s]/g, '').toUpperCase() + '-OTC'
}

// Fallback legado: deriva symbol OTC a partir do assetSymbol (ex: 'EUR/USD' -> 'EURUSD-OTC').
function otcSymbolFromAssetSymbol(assetSymbol: string): string {
  if (otcAssets.has(assetSymbol)) return assetSymbol
  return assetSymbol.replace(/[\/\-\s]/g, '').toUpperCase() + '-OTC'
}

type Authority =
  | { kind: 'OTC' | 'CRYPTO' | 'FOREX'; priceKey: string; payout: number; tolerance: number }
  | { kind: 'NONE' }

// Resolve a autoridade de preco de um ativo: OTC (engine proprio), CRYPTO/FOREX
// (feed live), ou NONE (nao server-authoritative — nao deve operar). O preco vem
// SEMPRE do servidor (Redis), nunca do cliente.
function resolveAuthority(assetId: string, assetSymbol: string): Authority {
  // 1) Ativos LIVE (cripto/forex) por assetId
  const live = getLiveAsset(assetId)
  if (live) {
    const key = live.feedSymbol.replace(/[\/\-\s]/g, '').toUpperCase()
    return { kind: live.kind, priceKey: KEYS.livePrice(key), payout: live.payout, tolerance: ENTRY_PRICE_TOLERANCE[live.kind] }
  }
  // 2) OTC por assetId, com fallback pelo assetSymbol
  const otcSym = otcSymbolFromAssetId(assetId) ?? otcSymbolFromAssetSymbol(assetSymbol)
  const otc = otcAssets.get(otcSym)
  if (otc) {
    return { kind: 'OTC', priceKey: KEYS.price(otcSym), payout: otc.payout, tolerance: ENTRY_PRICE_TOLERANCE.OTC }
  }
  return { kind: 'NONE' }
}

async function readPrice(priceKey: string): Promise<number | null> {
  const cached = await redis.get(priceKey)
  return cached != null ? Number(cached) : null
}

function computeAuditHash(parts: {
  operationId: string
  entryPrice:  number
  exitPrice:   number
  openedAt:    Date
  closedAt:    Date
  direction:   string
  amount:      string
  payout:      number
}): string {
  const payload = [
    parts.operationId,
    parts.entryPrice.toFixed(8),
    parts.exitPrice.toFixed(8),
    parts.openedAt.toISOString(),
    parts.closedAt.toISOString(),
    parts.direction,
    parts.amount,
    String(parts.payout),
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

export async function createOperation(userId: string, input: CreateOperationInput) {
  await ensureFreshSymbols()

  const authority = resolveAuthority(input.assetId, input.assetSymbol)
  if (authority.kind === 'NONE') throw new Error('ASSET_NOT_TRADEABLE')

  // Forex (live) bloqueado no lancamento: so disponivel em DEMO e com feed ligado.
  // Mercado real de forex entra depois com feed/quota adequados.
  const forexEnabled = process.env.FOREX_FEED_ENABLED === 'true'

  // Preco de ENTRADA vem do servidor. Valida o que o cliente viu contra o preco
  // autoritativo; se divergiu demais, rejeita (cotacao velha). Sempre grava o do servidor.
  const serverPrice = await readPrice(authority.priceKey)
  if (serverPrice == null) throw new Error('PRICE_UNAVAILABLE')
  const drift = Math.abs(input.entryPrice - serverPrice) / serverPrice
  if (drift > authority.tolerance) throw new Error('PRICE_DIVERGED')

  const entryPrice = serverPrice
  // Payout vem do SERVIDOR (catalogo/OTC), nunca do cliente.
  const payout = authority.payout
  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000)

  // Transacao interativa com lock de linha (SELECT ... FOR UPDATE) para evitar
  // corrida de saldo: duas aberturas concorrentes nao podem ambas passar a checagem
  // e deixar o saldo negativo.
  const operation = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ user_id: string; type: string; balance: string }>>(Prisma.sql`
      SELECT user_id, type, balance::text AS balance
      FROM accounts WHERE id = ${input.accountId}::uuid
      FOR UPDATE
    `)
    const acc = rows[0]
    if (!acc || acc.user_id !== userId) throw new Error('ACCOUNT_NOT_FOUND')

    if (authority.kind === 'FOREX' && (!forexEnabled || acc.type === 'REAL')) {
      throw new Error('FOREX_NOT_AVAILABLE')
    }

    const amount  = new Prisma.Decimal(input.amount)
    const balance = new Prisma.Decimal(acc.balance)
    if (balance.lessThan(amount)) throw new Error('INSUFFICIENT_BALANCE')

    const op = await tx.operation.create({
      data: {
        accountId:        input.accountId,
        assetId:          input.assetId,
        assetSymbol:      input.assetSymbol,
        direction:        input.direction,
        amount,
        payoutPct:        new Prisma.Decimal(payout),
        entryPrice:       new Prisma.Decimal(entryPrice),
        entryPriceSource: PriceSource.SERVER,
        expiresAt,
      },
    })

    await tx.account.update({
      where: { id: input.accountId },
      data:  { balance: { decrement: amount } },
    })

    await tx.transaction.create({
      data: {
        accountId:   input.accountId,
        type:        'TRADE_LOSS',
        amount:      amount.negated(),
        description: `Operacao aberta: ${input.assetSymbol} ${input.direction}`,
        operationId: op.id,
      },
    })

    return op
  })

  scheduleExpiry(operation.id, input.expiresInSeconds)
  return operation
}

// Liquida uma operacao OPEN: le exitPrice autoritativo do servidor, calcula
// resultado, credita conta. Idempotente (no-op se nao for OPEN).
//
// SERVER-AUTHORITATIVE PARA TODOS OS TIPOS (OTC + CRYPTO + FOREX). O preco de
// saida vem SEMPRE do Redis (feed do servidor), nunca do cliente.
//
// Se nao houver preco no Redis (feed fora do ar): NAO liquida como WIN/LOSS
// (seria injusto). Por padrao deixa OPEN para o sweeper tentar de novo. O sweeper
// chama com drawIfNoPrice=true apos um grace, ai liquida como DRAW (refund).
export async function settleOperation(
  operationId: string,
  opts: { drawIfNoPrice?: boolean } = {},
): Promise<void> {
  await ensureFreshSymbols()

  const op = await prisma.operation.findUnique({ where: { id: operationId } })
  if (!op || op.status !== 'OPEN') return

  const authority = resolveAuthority(op.assetId, op.assetSymbol)
  if (authority.kind === 'NONE') {
    // Ativo desconhecido/desativado: nao ha como liquidar com justica. Refund.
    await settleAsDraw(operationId, 'Ativo indisponivel para liquidacao - valor devolvido')
    return
  }

  const entryPrice = Number(op.entryPrice)
  const exitFromServer = await readPrice(authority.priceKey)

  if (exitFromServer == null) {
    if (opts.drawIfNoPrice) {
      await settleAsDraw(operationId, 'Preco indisponivel na expiracao - valor devolvido')
    }
    // senao: deixa OPEN; sweeper tenta de novo no proximo tick.
    return
  }

  const exitPrice = exitFromServer
  const direction = op.direction
  const amount    = new Prisma.Decimal(op.amount)
  const payout    = new Prisma.Decimal(op.payoutPct)

  let status: 'WON' | 'LOST' | 'DRAW'
  if (exitPrice === entryPrice) {
    status = 'DRAW'
  } else if (
    (direction === 'CALL' && exitPrice > entryPrice) ||
    (direction === 'PUT'  && exitPrice < entryPrice)
  ) {
    status = 'WON'
  } else {
    status = 'LOST'
  }

  const profit = status === 'WON'
    ? amount.mul(payout).div(100).toDecimalPlaces(2)
    : new Prisma.Decimal(0)
  const closedAt = new Date()

  const auditHash = computeAuditHash({
    operationId, entryPrice, exitPrice, direction,
    amount:  amount.toFixed(2),
    payout:  payout.toNumber(),
    openedAt: op.createdAt, closedAt,
  })

  await prisma.$transaction([
    prisma.operation.update({
      where: { id: operationId },
      data: {
        status,
        exitPrice:       new Prisma.Decimal(exitPrice),
        exitPriceSource: PriceSource.SERVER,
        auditHash,
        profit:          status === 'WON' ? profit : new Prisma.Decimal(0),
        closedAt,
      },
    }),
    ...(status === 'WON'
      ? [
          prisma.account.update({
            where: { id: op.accountId },
            data:  { balance: { increment: amount.plus(profit) } },
          }),
          prisma.transaction.create({
            data: {
              accountId:   op.accountId,
              type:        'TRADE_WIN',
              amount:      amount.plus(profit),
              description: `Operacao encerrada: ganho de R$${profit.toFixed(2)}`,
              operationId,
            },
          }),
        ]
      : status === 'DRAW'
        ? [
            prisma.account.update({
              where: { id: op.accountId },
              data:  { balance: { increment: amount } },
            }),
            prisma.transaction.create({
              data: {
                accountId:   op.accountId,
                type:        'TRADE_DRAW',
                amount,
                description: `Operacao empatada: valor devolvido`,
                operationId,
              },
            }),
          ]
        : [
            prisma.transaction.create({
              data: {
                accountId:   op.accountId,
                type:        'TRADE_LOSS',
                amount:      new Prisma.Decimal(0),
                description: `Operacao perdida`,
                operationId,
              },
            }),
          ]),
  ])
}

// Liquida como DRAW (devolve a entrada integral). Usado quando nao ha preco
// autoritativo para decidir o resultado com justica.
async function settleAsDraw(operationId: string, reason: string): Promise<void> {
  const op = await prisma.operation.findUnique({ where: { id: operationId } })
  if (!op || op.status !== 'OPEN') return

  const amount     = new Prisma.Decimal(op.amount)
  const entryPrice = Number(op.entryPrice)
  const closedAt   = new Date()

  const auditHash = computeAuditHash({
    operationId, entryPrice, exitPrice: entryPrice, direction: op.direction,
    amount: amount.toFixed(2), payout: Number(op.payoutPct),
    openedAt: op.createdAt, closedAt,
  })

  await prisma.$transaction([
    prisma.operation.update({
      where: { id: operationId },
      data: {
        status:          'DRAW',
        exitPrice:       new Prisma.Decimal(entryPrice),
        exitPriceSource: PriceSource.FALLBACK,
        auditHash,
        profit:          new Prisma.Decimal(0),
        closedAt,
      },
    }),
    prisma.account.update({
      where: { id: op.accountId },
      data:  { balance: { increment: amount } },
    }),
    prisma.transaction.create({
      data: {
        accountId:   op.accountId,
        type:        'TRADE_DRAW',
        amount,
        description: reason,
        operationId,
      },
    }),
  ])
}

// Fecha uma operacao antecipadamente. O reembolso e calculado pelo SERVIDOR
// (proporcional ao tempo decorrido), nunca enviado pelo cliente. Quanto mais
// cedo fecha, mais devolve; perto da expiracao, devolve menos.
export async function earlyClose(userId: string, operationId: string) {
  const op = await prisma.operation.findUnique({
    where:   { id: operationId },
    include: { account: { select: { userId: true } } },
  })
  if (!op || op.account.userId !== userId) throw new Error('NOT_FOUND')
  if (op.status !== 'OPEN') throw new Error('NOT_OPEN')

  const amount   = new Prisma.Decimal(op.amount)
  const now      = Date.now()
  const openedMs = op.createdAt.getTime()
  const expireMs = op.expiresAt.getTime()
  const total    = Math.max(1, expireMs - openedMs)
  const elapsed  = Math.min(Math.max(0, now - openedMs), total)

  // Reembolso linear: 90% no inicio decaindo ate 10% perto da expiracao.
  const factor   = 0.9 - 0.8 * (elapsed / total)
  const refund   = amount.mul(new Prisma.Decimal(factor)).toDecimalPlaces(2)
  const loss     = amount.minus(refund)
  const closedAt = new Date()

  await prisma.$transaction([
    prisma.operation.update({
      where: { id: operationId },
      data: {
        status:    'LOST',
        exitPrice: op.entryPrice,
        profit:    loss.negated(),
        closedAt,
      },
    }),
    prisma.account.update({
      where: { id: op.accountId },
      data:  { balance: { increment: refund } },
    }),
    prisma.transaction.create({
      data: {
        accountId:   op.accountId,
        type:        'EARLY_CLOSE',
        amount:      refund,
        description: `Saida antecipada: devolvido R$${refund.toFixed(2)}`,
        operationId,
      },
    }),
  ])

  return { refund: refund.toNumber() }
}

function scheduleExpiry(operationId: string, expiresInSeconds: number) {
  setTimeout(() => {
    settleOperation(operationId).catch(err =>
      console.error('[expiry] erro ao resolver operacao:', operationId, err)
    )
  }, expiresInSeconds * 1000)
}

// Sweeper: roda periodicamente buscando operacoes OPEN cuja expires_at ja passou.
// Garante que operacoes nao ficam orfas se o container reiniciar (perdendo os
// setTimeout em memoria) ou se o feed estava fora no instante da expiracao.
// Idempotente — settleOperation eh no-op se a operacao ja nao estiver OPEN.
let sweeperTimer: NodeJS.Timeout | null = null

// Apos esse tempo sem conseguir preco autoritativo, o sweeper liquida como DRAW
// (refund) em vez de deixar a operacao presa OPEN para sempre.
const NO_PRICE_GRACE_MS = 60 * 1000

export function startOrphanSweeper(intervalMs = 30_000): void {
  if (sweeperTimer) return
  console.log(`[operations] orphan sweeper started (every ${intervalMs}ms)`)

  const tick = async () => {
    try {
      await ensureFreshSymbols()

      const now = new Date()
      const orphans = await prisma.operation.findMany({
        where:  { status: 'OPEN', expiresAt: { lte: now } },
        select: { id: true, expiresAt: true },
        take:   100,
      })
      if (orphans.length === 0) return

      let settled = 0
      let drawn   = 0
      for (const op of orphans) {
        const expiredForMs = now.getTime() - op.expiresAt.getTime()
        const drawIfNoPrice = expiredForMs >= NO_PRICE_GRACE_MS
        const before = drawIfNoPrice
        await settleOperation(op.id, { drawIfNoPrice }).catch(err =>
          console.error('[operations] sweep settle failed:', op.id, err?.message ?? err)
        )
        if (before) drawn++; else settled++
      }

      const parts: string[] = []
      if (settled) parts.push(`${settled} tentadas`)
      if (drawn)   parts.push(`${drawn} com grace (draw se sem preco)`)
      if (parts.length) console.log(`[operations] sweep: ${parts.join(', ')}`)
    } catch (err: any) {
      console.error('[operations] sweep error:', err?.message ?? err)
    }
  }

  sweeperTimer = setInterval(tick, intervalMs)
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
