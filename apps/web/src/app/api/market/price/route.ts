import { NextRequest, NextResponse } from 'next/server'

const cache = new Map<string, { price: number; ts: number }>()
const CACHE_TTL = 10_000 // 10s

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

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  const source = req.nextUrl.searchParams.get('source') as 'yahoo' | 'binance' | null

  if (!symbol || !source) return NextResponse.json({ error: 'symbol and source required' }, { status: 400 })

  const cacheKey = `${source}:${symbol}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ price: cached.price })
  }

  try {
    const price = source === 'binance' ? await fetchBinance(symbol) : await fetchYahoo(symbol)
    cache.set(cacheKey, { price, ts: Date.now() })
    return NextResponse.json({ price })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'fetch failed' }, { status: 502 })
  }
}
