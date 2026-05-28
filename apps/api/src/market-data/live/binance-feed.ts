import { redis, redisPub, KEYS } from '../../redis.js'
import { cryptoFeedSymbols } from '../catalog.js'

// Feed de preco ao vivo para cripto via WebSocket publico da Binance.
// Grava o ultimo preco de cada par em Redis (live:price:SYMBOL) e publica tick,
// no mesmo padrao do OTC engine. A liquidacao (operations/service.ts) le esse
// preco do Redis no momento da expiracao — server-authoritative, sem confiar
// no cliente. Binance WS e gratuito, em tempo real e nao exige API key.
//
// Usa o WebSocket global do Node 22 (sem dependencia extra).

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream'
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS  = 30_000

let ws: WebSocket | null = null
let stopped = false
let reconnectAttempt = 0
let reconnectTimer: NodeJS.Timeout | null = null

function buildUrl(symbols: string[]): string {
  // miniTicker: snapshot leve a cada 1s com o ultimo preco em 'c' (close).
  const streams = symbols.map(s => `${s.toLowerCase()}@miniTicker`).join('/')
  return `${BINANCE_WS_BASE}?streams=${streams}`
}

function scheduleReconnect(symbols: string[]) {
  if (stopped) return
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS)
  reconnectAttempt++
  console.log(`[binance-feed] reconnecting in ${delay}ms (attempt ${reconnectAttempt})`)
  reconnectTimer = setTimeout(() => connect(symbols), delay)
}

function connect(symbols: string[]) {
  if (stopped) return
  const url = buildUrl(symbols)
  ws = new WebSocket(url)

  ws.addEventListener('open', () => {
    reconnectAttempt = 0
    console.log(`[binance-feed] connected (${symbols.length} symbols)`)
  })

  ws.addEventListener('message', (ev: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))
      const data = msg?.data
      if (!data?.s || data?.c == null) return
      const symbol = String(data.s)               // ex: BTCUSDT
      const price  = Number(data.c)               // ultimo preco (close)
      if (!Number.isFinite(price)) return

      const now = Math.floor(Date.now() / 1000)
      // Fire-and-forget: latencia do Redis nao deve travar o processamento do feed.
      redis.set(KEYS.livePrice(symbol), String(price)).catch(e => console.error('[binance-feed] redis.set:', e.message))
      redisPub.publish(KEYS.liveTickChannel(symbol), JSON.stringify({ symbol, price, t: now }))
        .catch(e => console.error('[binance-feed] redis.publish:', e.message))
    } catch (err: any) {
      console.error('[binance-feed] message parse error:', err?.message ?? err)
    }
  })

  ws.addEventListener('close', () => {
    if (stopped) return
    console.warn('[binance-feed] connection closed')
    scheduleReconnect(symbols)
  })

  ws.addEventListener('error', (ev: Event) => {
    console.error('[binance-feed] ws error:', (ev as any)?.message ?? 'unknown')
    // 'close' dispara em seguida e agenda a reconexao.
  })
}

export function startBinanceFeed(): void {
  const symbols = cryptoFeedSymbols()
  if (symbols.length === 0) {
    console.log('[binance-feed] no crypto symbols in catalog; skipping')
    return
  }
  stopped = false
  console.log(`[binance-feed] starting for: ${symbols.join(', ')}`)
  connect(symbols)

  const stop = () => {
    stopped = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    try { ws?.close() } catch { /* noop */ }
    ws = null
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT',  stop)
}
