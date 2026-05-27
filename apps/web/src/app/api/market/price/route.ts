import { NextRequest, NextResponse } from 'next/server'

const cache = new Map<string, { price: number; ts: number }>()

// TTLs diferenciados por fonte. Twelve Data tem cota limitada (800 req/dia),
// entao cacheamos mais agressivamente. Binance/Yahoo nao tem cota — TTL menor.
const CACHE_TTL: Record<string, number> = {
  binance:    10_000,  // 10s — cripto se move rapido
  yahoo:      15_000,  // 15s — fallback legado
  twelvedata: 30_000,  // 30s — protege quota (3 pares * 2/min = 6/min, abaixo do limite de 8/min)
}

async function fetchYahoo(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const json = await res.json()
  const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (!price) throw new Error('Yahoo Finance: no price')
  return price
}

async function fetchBinance(symbol: string): Promise<number> {
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3_000) })
  const json = await res.json()
  if (!json.price) throw new Error('Binance error')
  return parseFloat(json.price)
}

async function fetchTwelveData(symbol: string): Promise<number> {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured')
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5_000) })
  const json = await res.json()
  if (json.status === 'error') throw new Error(`Twelve Data: ${json.message}`)
  const price = parseFloat(json.price)
  if (!price || isNaN(price)) throw new Error('Twelve Data: invalid price')
  return price
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  const source = req.nextUrl.searchParams.get('source') as 'yahoo' | 'binance' | 'twelvedata' | null

  if (!symbol || !source) return NextResponse.json({ error: 'symbol and source required' }, { status: 400 })

  const cacheKey = `${source}:${symbol}`
  const cached = cache.get(cacheKey)
  const ttl = CACHE_TTL[source] ?? 15_000
  if (cached && Date.now() - cached.ts < ttl) {
    return NextResponse.json({ price: cached.price, cached: true })
  }

  try {
    let price: number
    if      (source === 'binance')    price = await fetchBinance(symbol)
    else if (source === 'twelvedata') price = await fetchTwelveData(symbol)
    else                              price = await fetchYahoo(symbol)
    cache.set(cacheKey, { price, ts: Date.now() })
    return NextResponse.json({ price })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'fetch failed' }, { status: 502 })
  }
}
