// Cliente WebSocket para ticks OTC server-authoritative.
// Conecta em /ws/market/:symbol, recebe { symbol, price, t }, auto-reconecta.

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
