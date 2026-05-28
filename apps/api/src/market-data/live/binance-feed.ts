import { redis, redisPub, KEYS } from '../../redis.js'
import { cryptoFeedSymbols } from '../catalog.js'

// Feed de preco ao vivo para cripto via REST da Binance (polling a cada 1s).
// Grava o ultimo preco de cada par em Redis (live:price:SYMBOL) e publica tick,
// no mesmo padrao do OTC engine. A liquidacao (operations/service.ts) le esse
// preco do Redis no momento da expiracao — server-authoritative, sem confiar
// no cliente. Binance REST e gratuito, sem API key para dados publicos.
//
// Usa polling REST (em vez de WebSocket) porque o runtime e Node 20, que nao
// tem WebSocket global. /api/v3/ticker/price aceita varios simbolos numa
// chamada so; a 1 req/s o peso fica muito abaixo do limite da Binance.

const POLL_INTERVAL_MS = 1_000
let pollTimer: NodeJS.Timeout | null = null
let stopped = false
let inFlight = false

async function pollOnce(symbols: string[]) {
  if (inFlight) return  // evita acumular requests se a rede estiver lenta
  inFlight = true
  try {
    const symbolsParam = encodeURIComponent(JSON.stringify(symbols))
    const url = `https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`
    const res = await fetch(url)
    if (!res.ok) {
      console.error('[binance-feed] http', res.status)
      return
    }
    const rows: Array<{ symbol: string; price: string }> = await res.json()
    const now = Math.floor(Date.now() / 1000)

    for (const row of rows) {
      const symbol = String(row.symbol)
      const price  = Number(row.price)
      if (!Number.isFinite(price)) continue
      redis.set(KEYS.livePrice(symbol), String(price)).catch(e => console.error('[binance-feed] redis.set:', e.message))
      redisPub.publish(KEYS.liveTickChannel(symbol), JSON.stringify({ symbol, price, t: now }))
        .catch(e => console.error('[binance-feed] redis.publish:', e.message))
    }
  } catch (err: any) {
    console.error('[binance-feed] poll error:', err?.message ?? err)
  } finally {
    inFlight = false
  }
}

export function startBinanceFeed(): void {
  const symbols = cryptoFeedSymbols()
  if (symbols.length === 0) {
    console.log('[binance-feed] no crypto symbols in catalog; skipping')
    return
  }
  stopped = false
  console.log(`[binance-feed] starting for: ${symbols.join(', ')} (every ${POLL_INTERVAL_MS}ms)`)

  const tick = () => { if (!stopped) pollOnce(symbols) }
  tick()
  pollTimer = setInterval(tick, POLL_INTERVAL_MS)

  const stop = () => { stopped = true; if (pollTimer) clearInterval(pollTimer); pollTimer = null }
  process.once('SIGTERM', stop)
  process.once('SIGINT',  stop)
}
