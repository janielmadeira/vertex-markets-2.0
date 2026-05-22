import { NextRequest, NextResponse } from 'next/server'
import type { Candle } from '@/lib/mockData'

const cache = new Map<string, { candles: Candle[]; ts: number }>()
const CACHE_TTL = 60_000 // 1 min

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
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
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

export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')
  const source   = req.nextUrl.searchParams.get('source') as 'yahoo' | 'binance' | null
  const interval = req.nextUrl.searchParams.get('interval') ?? '60'
  const limit    = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') ?? '80'))

  if (!symbol || !source) return NextResponse.json({ error: 'symbol and source required' }, { status: 400 })

  const cacheKey = `${source}:${symbol}:${interval}:${limit}`
  const cached   = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ candles: cached.candles })
  }

  try {
    let candles: Candle[]
    if (source === 'binance') {
      candles = await fetchBinanceCandles(symbol, interval, limit)
    } else {
      const tfSeconds = parseInt(interval)
      candles = await fetchYahooCandles(symbol, tfSeconds, limit)
    }
    cache.set(cacheKey, { candles, ts: Date.now() })
    return NextResponse.json({ candles })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'fetch failed' }, { status: 502 })
  }
}
