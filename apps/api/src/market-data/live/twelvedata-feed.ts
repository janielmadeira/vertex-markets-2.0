import { redis, redisPub, KEYS } from '../../redis.js'
import { forexFeedSymbols } from '../catalog.js'

// Feed de preco para FOREX via Twelve Data (polling).
// Atras da flag FOREX_FEED_ENABLED (default OFF). No primeiro lancamento com
// dinheiro real, forex fica disponivel SO em conta DEMO; este poller existe
// pronto mas desligado ate haver feed/quota adequados para forex em conta REAL.
//
// Twelve Data free tier tem quota apertada (~8 req/min). Usa o endpoint /price
// em batch (simbolos separados por virgula) para gastar 1 request por ciclo,
// e respeita um intervalo conservador entre ciclos.

const POLL_INTERVAL_MS = 15_000  // 4 req/min — folga sob o limite do free tier
let pollTimer: NodeJS.Timeout | null = null
let stopped = false

async function pollOnce(symbols: string[], apiKey: string) {
  try {
    const symbolParam = encodeURIComponent(symbols.join(','))
    const url = `https://api.twelvedata.com/price?symbol=${symbolParam}&apikey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) {
      console.error('[twelvedata-feed] http', res.status)
      return
    }
    const json: any = await res.json()
    const now = Math.floor(Date.now() / 1000)

    // Resposta: 1 simbolo => { price }; varios => { 'EUR/USD': { price }, ... }.
    const entries: Array<[string, number]> = []
    if (json?.price != null && symbols.length === 1) {
      entries.push([symbols[0], Number(json.price)])
    } else {
      for (const sym of symbols) {
        const p = json?.[sym]?.price
        if (p != null) entries.push([sym, Number(p)])
      }
    }

    for (const [sym, price] of entries) {
      if (!Number.isFinite(price)) continue
      // Redis usa o simbolo sem barra pra casar com o lookup do settlement.
      const key = sym.replace(/[\/\-\s]/g, '').toUpperCase()
      redis.set(KEYS.livePrice(key), String(price)).catch(e => console.error('[twelvedata-feed] redis.set:', e.message))
      redisPub.publish(KEYS.liveTickChannel(key), JSON.stringify({ symbol: key, price, t: now }))
        .catch(e => console.error('[twelvedata-feed] redis.publish:', e.message))
    }
  } catch (err: any) {
    console.error('[twelvedata-feed] poll error:', err?.message ?? err)
  }
}

export function startTwelveDataFeed(): void {
  if (process.env.FOREX_FEED_ENABLED !== 'true') {
    console.log('[twelvedata-feed] disabled (set FOREX_FEED_ENABLED=true to enable)')
    return
  }
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) {
    console.warn('[twelvedata-feed] TWELVE_DATA_API_KEY ausente; feed forex nao iniciado')
    return
  }
  const symbols = forexFeedSymbols()
  if (symbols.length === 0) {
    console.log('[twelvedata-feed] no forex symbols in catalog; skipping')
    return
  }

  stopped = false
  console.log(`[twelvedata-feed] starting for: ${symbols.join(', ')} (every ${POLL_INTERVAL_MS}ms)`)

  const tick = () => {
    if (stopped) return
    pollOnce(symbols, apiKey)
  }
  tick()
  pollTimer = setInterval(tick, POLL_INTERVAL_MS)

  const stop = () => { stopped = true; if (pollTimer) clearInterval(pollTimer); pollTimer = null }
  process.once('SIGTERM', stop)
  process.once('SIGINT',  stop)
}
