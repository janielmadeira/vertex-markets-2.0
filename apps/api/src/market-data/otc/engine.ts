import { prisma } from '../../prisma.js'
import { redis, redisPub, KEYS } from '../../redis.js'
import { nextPrice } from './rng.js'

const TIMEFRAMES = [5, 15, 60, 300] // segundos
const CANDLE_BUFFER_SIZE = 500

type AssetState = {
  id:         string
  symbol:     string
  basePrice:  number
  volatility: number
  trend:      number
  decimals:   number
  price:      number
  candles:    Map<number, CandleState>
}

type CandleState = {
  openTime: number  // epoch sec, alinhado
  open:     number
  high:     number
  low:      number
  close:    number
}

const state = new Map<string, AssetState>()
let running = false
let timer: NodeJS.Timeout | null = null

function alignWindow(epochSec: number, tf: number): number {
  return Math.floor(epochSec / tf) * tf
}

function round(value: number, decimals: number): number {
  const m = Math.pow(10, decimals)
  return Math.round(value * m) / m
}

async function loadAssets() {
  const assets = await prisma.otcAsset.findMany({ where: { status: 'ACTIVE' } })
  const ids = new Set<string>()

  for (const a of assets) {
    ids.add(a.id)
    const existing = state.get(a.id)
    const basePrice  = Number(a.basePrice)
    const volatility = Number(a.volatility)
    const trend      = Number(a.trend)

    if (existing) {
      existing.basePrice  = basePrice
      existing.volatility = volatility
      existing.trend      = trend
      existing.decimals   = a.decimals
    } else {
      // tenta recuperar último preço do Redis (sobrevive a restart)
      const cached = await redis.get(KEYS.price(a.symbol))
      const price  = cached ? Number(cached) : basePrice
      state.set(a.id, {
        id: a.id, symbol: a.symbol, basePrice, volatility, trend,
        decimals: a.decimals, price, candles: new Map(),
      })
    }
  }

  // remove ativos inativados/removidos
  for (const id of state.keys()) if (!ids.has(id)) state.delete(id)
}

// Re-entry guard: setInterval pode disparar antes do tick anterior terminar.
// Sem isso, ticks rodam concorrente e o state compartilhado corrompe (assets sao
// pulados, candles sao gravados com OHLC errado, etc).
let tickInFlight = false

async function tickOnce() {
  if (tickInFlight) return
  tickInFlight = true

  try {
    const now = Math.floor(Date.now() / 1000)

    for (const asset of state.values()) {
      // ── Atualizacao SINCRONA do state ─────────────────────────────────
      // Tudo aqui e sync (sem await) — garante que o state se mantem coerente
      // entre ticks. Custo: ~microssegundos por asset.
      const seed = `${asset.id}:${now}`
      const raw  = nextPrice({
        currentPrice: asset.price,
        basePrice:    asset.basePrice,
        volatility:   asset.volatility,
        trend:        asset.trend,
        seed,
      })
      asset.price = round(raw, asset.decimals)

      // ── I/O FIRE-AND-FORGET ───────────────────────────────────────────
      // Redis SET/PUBLISH nao precisam de retorno — dispara sem aguardar.
      // Se Redis tiver latencia, nao afeta a sincronia dos ticks.
      const payload = JSON.stringify({ symbol: asset.symbol, price: asset.price, t: now })
      redis.set(KEYS.price(asset.symbol), String(asset.price)).catch(e => console.error('[otc-engine] redis.set:', e.message))
      redisPub.publish(KEYS.tickChannel(asset.symbol), payload).catch(e => console.error('[otc-engine] redis.publish:', e.message))

      // ── Agrega cada timeframe (sync) ──────────────────────────────────
      for (const tf of TIMEFRAMES) {
        const openTime = alignWindow(now, tf)
        const candle = asset.candles.get(tf)

        if (!candle || candle.openTime !== openTime) {
          // Candle anterior fechou: dispara persist sem aguardar.
          // O candle antigo nao sera mais mutado (substituido por novo no Map),
          // entao persistCandle ve valores estaveis mesmo sem await.
          if (candle) {
            persistCandle(asset, tf, candle).catch(e => console.error('[otc-engine] persistCandle bg:', e.message))
          }
          asset.candles.set(tf, {
            openTime,
            open:  asset.price,
            high:  asset.price,
            low:   asset.price,
            close: asset.price,
          })
        } else {
          candle.high  = Math.max(candle.high, asset.price)
          candle.low   = Math.min(candle.low,  asset.price)
          candle.close = asset.price
        }
      }
    }
  } finally {
    tickInFlight = false
  }
}

async function persistCandle(asset: AssetState, tf: number, candle: CandleState) {
  try {
    await prisma.otcCandle.upsert({
      where: { assetId_timeframe_openTime: { assetId: asset.id, timeframe: tf, openTime: new Date(candle.openTime * 1000) } },
      create: {
        assetId: asset.id, timeframe: tf,
        openTime: new Date(candle.openTime * 1000),
        open: candle.open, high: candle.high, low: candle.low, close: candle.close,
      },
      update: { high: candle.high, low: candle.low, close: candle.close },
    })

    // mantém buffer recente no Redis
    const key = KEYS.candleBuffer(asset.symbol, tf)
    const serialized = JSON.stringify({
      t: candle.openTime, o: candle.open, h: candle.high, l: candle.low, c: candle.close,
    })
    await redis.zadd(key, candle.openTime, serialized)
    await redis.zremrangebyrank(key, 0, -(CANDLE_BUFFER_SIZE + 1))
  } catch (err: any) {
    console.error(`[otc-engine] persistCandle ${asset.symbol} tf=${tf}:`, err.message)
  }
}

export async function startOtcEngine() {
  if (running) return
  running = true

  await loadAssets()
  console.log(`[otc-engine] starting with ${state.size} active asset(s)`)

  // recarrega ativos a cada 30s (pega edições do admin)
  const reloadEvery = setInterval(() => { loadAssets().catch(e => console.error('[otc-engine] reload:', e.message)) }, 30_000)

  // tick a cada 1s
  timer = setInterval(() => {
    tickOnce().catch(e => console.error('[otc-engine] tick:', e.message))
  }, 1000)

  // garante cleanup em SIGTERM
  const stop = () => { if (timer) clearInterval(timer); clearInterval(reloadEvery); running = false }
  process.once('SIGTERM', stop)
  process.once('SIGINT',  stop)
}

export function getCurrentPriceMemory(symbol: string): number | null {
  for (const a of state.values()) if (a.symbol === symbol) return a.price
  return null
}
