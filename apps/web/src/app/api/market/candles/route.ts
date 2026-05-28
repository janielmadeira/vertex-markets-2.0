import { NextRequest, NextResponse } from 'next/server'
import type { Candle } from '@/lib/mockData'
import { tfToTwelveDataInterval } from '@/lib/marketSymbols'

const cache = new Map<string, { candles: Candle[]; ts: number }>()

// TTLs diferenciados. Twelve Data tem cota (800/dia), entao historicos cacheados
// por 5min — calls historicas sao raras (so quando usuario abre par ou troca tf).
const CACHE_TTL: Record<string, number> = {
  binance:    60_000,
  yahoo:      60_000,
  twelvedata: 300_000,
}

const BRT_OFFSET = -3 * 3600

function tfSecondsToYahoo(seconds: number): { interval: string; range: string } {
  if (seconds <= 60)    return { interval: '1m',  range: '1d'  }
  if (seconds <= 300)   return { interval: '5m',  range: '5d'  }
  if (seconds <= 900)   return { interval: '15m', range: '60d' }
  if (seconds <= 1800)  return { interval: '30m', range: '60d' }
  if (seconds <= 3600)  return { interval: '60m', range: '60d' }
  if (seconds <= 14400) return { interval: '1h',  range: '60d' }
  return { interval: '1d', range: '1y' }
}

async function fetchYahooCandles(symbol: string, tfSeconds: number, limit: number): Promise<Candle[]> {
  const { interval, range } = tfSecondsToYahoo(tfSeconds)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('Yahoo Finance: no result')

  const timestamps: number[] = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const { open = [], high = [], low = [], close = [] } = quote

  const candles: Candle[] = []
  for (let i = 0; i < timestamps.length; i++) {
    if (open[i] == null || close[i] == null) continue
    candles.push({
      time:  timestamps[i] + BRT_OFFSET,
      open:  open[i],
      high:  high[i],
      low:   low[i],
      close: close[i],
    })
  }

  return candles.slice(-limit)
}

async function fetchBinanceCandles(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  // data-api.binance.vision: endpoint publico oficial sem bloqueio geografico
  // (api.binance.com retorna 451 para IPs dos EUA, onde roda a VPS/SFO).
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
  const res  = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5_000) })
  const json = await res.json()
  if (!Array.isArray(json)) throw new Error('Binance error')

  return json.map((k: any[]) => ({
    time:  Math.floor(k[0] / 1000) + BRT_OFFSET,
    open:  parseFloat(k[1]),
    high:  parseFloat(k[2]),
    low:   parseFloat(k[3]),
    close: parseFloat(k[4]),
  }))
}

async function fetchTwelveDataCandles(symbol: string, tfSeconds: number, limit: number): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured')

  const interval = tfToTwelveDataInterval(tfSeconds)
  if (!interval) throw new Error(`Twelve Data: timeframe ${tfSeconds}s not supported`)

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${limit}&apikey=${apiKey}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
  const json = await res.json()
  if (json.status === 'error') throw new Error(`Twelve Data: ${json.message}`)
  if (!Array.isArray(json.values)) throw new Error('Twelve Data: invalid response')

  // Twelve Data devolve em ordem desc (mais recente primeiro). Invertemos para asc.
  return json.values.map((v: any) => ({
    time:  Math.floor(new Date(v.datetime + 'Z').getTime() / 1000) + BRT_OFFSET,
    open:  parseFloat(v.open),
    high:  parseFloat(v.high),
    low:   parseFloat(v.low),
    close: parseFloat(v.close),
  })).reverse()
}

export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')
  const source   = req.nextUrl.searchParams.get('source') as 'yahoo' | 'binance' | 'twelvedata' | null
  const interval = req.nextUrl.searchParams.get('interval') ?? '60'
  const limit    = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') ?? '80'))

  if (!symbol || !source) return NextResponse.json({ error: 'symbol and source required' }, { status: 400 })

  const cacheKey = `${source}:${symbol}:${interval}:${limit}`
  const cached   = cache.get(cacheKey)
  const ttl      = CACHE_TTL[source] ?? 60_000
  if (cached && Date.now() - cached.ts < ttl) {
    return NextResponse.json({ candles: cached.candles, cached: true })
  }

  try {
    let candles: Candle[]
    if (source === 'binance') {
      candles = await fetchBinanceCandles(symbol, interval, limit)
    } else if (source === 'twelvedata') {
      candles = await fetchTwelveDataCandles(symbol, parseInt(interval), limit)
    } else {
      candles = await fetchYahooCandles(symbol, parseInt(interval), limit)
    }
    cache.set(cacheKey, { candles, ts: Date.now() })
    return NextResponse.json({ candles })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'fetch failed' }, { status: 502 })
  }
}
