import { createHash } from 'node:crypto'
import { prisma } from '../prisma.js'
import { redis, KEYS } from '../redis.js'
import { PriceSource } from '@prisma/client'
import type { CreateOperationInput } from './schema.js'

// Tolerancia maxima entre entryPrice enviado pelo cliente e preco atual do servidor.
const ENTRY_PRICE_TOLERANCE = 0.002

const SERVER_AUTH_SYMBOLS = new Set([
  'USDBRL-OTC', 'USDCHF-OTC', 'EURAUD-OTC', 'AAPL-OTC', 'TSLA-OTC',
])

function isServerAuthoritative(assetSymbol: string): boolean {
  if (SERVER_AUTH_SYMBOLS.has(assetSymbol)) return true
  const canonical = assetSymbol.replace(/[\/\-\s]/g, '').toUpperCase() + '-OTC'
  return SERVER_AUTH_SYMBOLS.has(canonical)
}

function canonicalSymbol(assetSymbol: string): string {
  if (SERVER_AUTH_SYMBOLS.has(assetSymbol)) return assetSymbol
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

  scheduleExpiry(
    operation.id, input.accountId, input.amount, input.payout,
    entryPrice, input.direction, input.assetSymbol, input.expiresInSeconds,
  )

  return operation
}

function scheduleExpiry(
  operationId: string,
  accountId: string,
  amount: number,
  payout: number,
  entryPrice: number,
  direction: string,
  assetSymbol: string,
  expiresInSeconds: number,
) {
  setTimeout(async () => {
    try {
      const op = await prisma.operation.findUnique({ where: { id: operationId } })
      if (!op || op.status !== 'OPEN') return

      let exitPrice: number
      let exitPriceSource: PriceSource

      if (isServerAuthoritative(assetSymbol)) {
        const serverPrice = await readServerPrice(assetSymbol)
        if (serverPrice == null) {
          const change = (Math.random() * 0.01) - 0.005
          exitPrice       = parseFloat((entryPrice * (1 + change)).toFixed(5))
          exitPriceSource = PriceSource.FALLBACK
        } else {
          exitPrice       = serverPrice
          exitPriceSource = PriceSource.SERVER
        }
      } else {
        const change = (Math.random() * 0.01) - 0.005
        exitPrice       = parseFloat((entryPrice * (1 + change)).toFixed(5))
        exitPriceSource = PriceSource.FALLBACK
      }

      const won =
        (direction === 'CALL' && exitPrice > entryPrice) ||
        (direction === 'PUT'  && exitPrice < entryPrice)

      const profit = won ? parseFloat((amount * (payout / 100)).toFixed(2)) : 0
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
                where: { id: accountId },
                data:  { balance: { increment: amount + profit } },
              }),
              prisma.transaction.create({
                data: {
                  accountId,
                  type:        'TRADE_WIN',
                  amount:      amount + profit,
                  description: `Operacao encerrada: ganho de R$${profit.toFixed(2)}`,
                  operationId,
                },
              }),
            ]
          : []),
      ])
    } catch (err) {
      console.error('[expiry] erro ao resolver operacao:', operationId, err)
    }
  }, expiresInSeconds * 1000)
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
