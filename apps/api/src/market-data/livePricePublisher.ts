import { supabaseAdmin } from '../supabaseAdmin.js'
import { getCurrentPriceMemory } from './otc/engine.js'

// Publica precos autoritativos na tabela Supabase live_prices.
// settle_trade/place_trade leem dela em vez de confiar no preco do cliente.
//
// Mapeamento asset_id (front/operations.asset_id) <-> simbolo no provider.
// Tem que casar com:
//   - OTC:    seed-otc.ts (SEEDS) + web/src/lib/otcClient.ts (OTC_SYMBOL_MAP)
//   - cripto/forex: web/src/lib/marketSymbols.ts (REAL_ASSETS)

type AssetEntry = { assetId: string; symbol: string }

const OTC_ASSETS: AssetEntry[] = [
  { assetId: 'eur-usd-otc', symbol: 'EURUSD-OTC' },
  { assetId: 'gbp-usd-otc', symbol: 'GBPUSD-OTC' },
  { assetId: 'usd-jpy-otc', symbol: 'USDJPY-OTC' },
  { assetId: 'usd-brl-otc', symbol: 'USDBRL-OTC' },
  { assetId: 'eur-jpy-otc', symbol: 'EURJPY-OTC' },
  { assetId: 'aud-cad-otc', symbol: 'AUDCAD-OTC' },
  { assetId: 'nzd-usd-otc', symbol: 'NZDUSD-OTC' },
  { assetId: 'usd-chf-otc', symbol: 'USDCHF-OTC' },
  { assetId: 'xau-usd-otc', symbol: 'XAUUSD-OTC' },
  { assetId: 'xag-usd-otc', symbol: 'XAGUSD-OTC' },
]

const CRYPTO_ASSETS: AssetEntry[] = [
  { assetId: 'btc', symbol: 'BTCUSDT' },
  { assetId: 'eth', symbol: 'ETHUSDT' },
  { assetId: 'sol', symbol: 'SOLUSDT' },
  { assetId: 'xrp', symbol: 'XRPUSDT' },
  { assetId: 'bnb', symbol: 'BNBUSDT' },
]

const FOREX_ASSETS: AssetEntry[] = [
  { assetId: 'eur-usd', symbol: 'EUR/USD' },
  { assetId: 'gbp-usd', symbol: 'GBP/USD' },
  { assetId: 'usd-jpy', symbol: 'USD/JPY' },
]

type PriceRow = { assetId: string; symbol: string; price: number; source: string }

async function upsert(rows: PriceRow[]) {
  if (!supabaseAdmin || rows.length === 0) return
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('live_prices')
    .upsert(
      rows.map(r => ({ asset_id: r.assetId, symbol: r.symbol, price: r.price, source: r.source, updated_at: now })),
      { onConflict: 'asset_id' },
    )
  if (error) console.error('[live-prices] upsert:', error.message)
}

// OTC: le preco corrente da memoria do engine (sem I/O externo).
function publishOtc() {
  const rows: PriceRow[] = []
  for (const a of OTC_ASSETS) {
    const price = getCurrentPriceMemory(a.symbol)
    if (price != null) rows.push({ assetId: a.assetId, symbol: a.symbol, price, source: 'otc' })
  }
  return upsert(rows)
}

async function fetchBinance(symbol: string): Promise<number> {
  // data-api.binance.vision: endpoint publico sem bloqueio geografico (a VPS roda em SFO).
  const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, {
    signal: AbortSignal.timeout(4_000),
  })
  const json = await res.json() as { price?: string }
  const price = parseFloat(json.price ?? '')
  if (!price || isNaN(price)) throw new Error(`binance ${symbol}: sem preco`)
  return price
}

async function fetchTwelveData(symbol: string): Promise<number> {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY ausente')
  const res = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`, {
    signal: AbortSignal.timeout(5_000),
  })
  const json = await res.json() as { price?: string; status?: string; message?: string }
  if (json.status === 'error') throw new Error(`twelvedata ${symbol}: ${json.message}`)
  const price = parseFloat(json.price ?? '')
  if (!price || isNaN(price)) throw new Error(`twelvedata ${symbol}: preco invalido`)
  return price
}

// Cripto + forex: busca dos providers reais. Falha de um par nao derruba os outros.
async function publishReal() {
  const rows: PriceRow[] = []
  await Promise.all([
    ...CRYPTO_ASSETS.map(async a => {
      try { rows.push({ assetId: a.assetId, symbol: a.symbol, price: await fetchBinance(a.symbol), source: 'binance' }) }
      catch (e: any) { console.error('[live-prices]', e.message) }
    }),
    ...FOREX_ASSETS.map(async a => {
      try { rows.push({ assetId: a.assetId, symbol: a.symbol, price: await fetchTwelveData(a.symbol), source: 'twelvedata' }) }
      catch (e: any) { console.error('[live-prices]', e.message) }
    }),
  ])
  return upsert(rows)
}

let otcTimer: NodeJS.Timeout | null = null
let realTimer: NodeJS.Timeout | null = null

export function startLivePricePublisher() {
  if (!supabaseAdmin) {
    console.warn('[live-prices] publisher desativado (sem service_role key)')
    return
  }
  // OTC: 2s (preco vem da memoria, barato). Cripto/forex: 10s (protege cota Twelve Data).
  otcTimer  = setInterval(() => { publishOtc().catch(e => console.error('[live-prices] otc:', e.message)) }, 2_000)
  realTimer = setInterval(() => { publishReal().catch(e => console.error('[live-prices] real:', e.message)) }, 10_000)
  // primeiro publish imediato pra tabela nao ficar vazia no boot
  publishReal().catch(() => {})
  console.log('[live-prices] publisher iniciado (OTC 2s, cripto/forex 10s)')

  const stop = () => { if (otcTimer) clearInterval(otcTimer); if (realTimer) clearInterval(realTimer) }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
