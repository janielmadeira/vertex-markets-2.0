// Cliente WebSocket + REST helpers para o sistema OTC server-authoritative.
// - subscribeOtc(symbol, cb): WS em /ws/market/:symbol, auto-reconecta.
// - fetchOtcCandles(symbol, tf, limit): GET /market-data/otc/:symbol/candles
// - assetIdToOtcSymbol(): mapeia asset.id do front -> símbolo do backend.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function wsUrl(symbol: string): string {
  const base = API_URL.replace(/^http/, 'ws')
  return `${base}/ws/market/${encodeURIComponent(symbol)}`
}

export type OtcTick = { symbol: string; price: number; t: number; snapshot?: boolean }

export type OtcSubscription = {
  close: () => void
}

// Mapeia asset.id do front (ex: "usd-brl-otc") para o símbolo do backend ("USDBRL-OTC").
// Retorna null se o asset não for OTC ou não tiver mapeamento óbvio.
export function assetIdToOtcSymbol(assetId: string): string | null {
  if (!assetId.endsWith('-otc')) return null
  const base = assetId.slice(0, -'-otc'.length)         // "usd-brl"
  const pair = base.split('-').join('').toUpperCase()    // "USDBRL"
  return `${pair}-OTC`
}

// Timeframes suportados pelo backend (segundos)
export const OTC_BACKEND_TFS = [5, 15, 60, 300] as const

export type OtcCandle = { t: number; o: number; h: number; l: number; c: number }

// Busca candles históricos do backend OTC. Retorna null se o backend não responder
// (ex: símbolo não cadastrado, rede caiu) — caller deve cair em fallback.
export async function fetchOtcCandles(symbol: string, tf: number, limit = 300): Promise<OtcCandle[] | null> {
  if (!OTC_BACKEND_TFS.includes(tf as any)) return null
  try {
    const url = `${API_URL}/market-data/otc/${encodeURIComponent(symbol)}/candles?tf=${tf}&limit=${limit}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    return Array.isArray(json?.candles) ? (json.candles as OtcCandle[]) : null
  } catch {
    return null
  }
}

export function subscribeOtc(symbol: string, onTick: (tick: OtcTick) => void): OtcSubscription {
  let ws: WebSocket | null = null
  let closed = false
  let retryDelay = 1_000

  function connect() {
    if (closed) return
    try {
      ws = new WebSocket(wsUrl(symbol))
    } catch (err) {
      console.error('[otc-ws] connect error', err)
      scheduleReconnect()
      return
    }

    ws.onopen = () => { retryDelay = 1_000 }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string)
        if (typeof data?.price === 'number' && typeof data?.t === 'number') {
          onTick(data as OtcTick)
        }
      } catch { /* ignora payloads inválidos */ }
    }

    ws.onerror = () => { /* o onclose vai disparar e tratar a reconexão */ }

    ws.onclose = () => {
      ws = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (closed) return
    setTimeout(connect, retryDelay)
    retryDelay = Math.min(retryDelay * 2, 15_000)
  }

  connect()

  return {
    close: () => {
      closed = true
      if (ws) {
        try { ws.close() } catch { /* noop */ }
        ws = null
      }
    },
  }
}
