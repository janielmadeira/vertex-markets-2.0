import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const cache = new Map<string, { price: number; ts: number }>()

// Cliente Supabase (anon) para ler live_prices. live_prices tem RLS read-all,
// entao a anon key basta. So leitura.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Le o preco forex publicado pelo vertex-api em live_prices (centralizado:
// nenhum navegador chama o Twelve Data direto -> cota protegida). live_prices.symbol
// guarda o simbolo do provider (ex: 'EUR/USD'). Rejeita se ausente ou muito velho
// (>120s), pro caller cair no fallback direto.
async function readLivePrice(symbol: string): Promise<number> {
  const { data, error } = await supabase
    .from('live_prices')
    .select('price, updated_at')
    .eq('symbol', symbol)
    .maybeSingle()
  if (error || !data) throw new Error('live_prices: sem registro')
  const ageMs = Date.now() - new Date(data.updated_at as string).getTime()
  if (ageMs > 120_000) throw new Error('live_prices: preco velho')
  const price = Number(data.price)
  if (!price || isNaN(price)) throw new Error('live_prices: preco invalido')
  return price
}

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
  // data-api.binance.vision: endpoint publico oficial sem bloqueio geografico
  // (api.binance.com retorna 451 para IPs dos EUA, onde roda a VPS/SFO).
  const url = `https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`
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
    if (source === 'binance') {
      price = await fetchBinance(symbol)
    } else if (source === 'twelvedata') {
      // Centralizado: le da live_prices (alimentada pelo publisher do vertex-api).
      // Fallback pro Twelve Data direto so se a tabela estiver ausente/velha.
      try { price = await readLivePrice(symbol) }
      catch { price = await fetchTwelveData(symbol) }
    } else {
      price = await fetchYahoo(symbol)
    }
    cache.set(cacheKey, { price, ts: Date.now() })
    return NextResponse.json({ price })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'fetch failed' }, { status: 502 })
  }
}
