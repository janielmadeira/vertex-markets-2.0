import { prisma } from '../prisma.js'
import { getCurrentPriceMemory } from './otc/engine.js'

// Publica precos autoritativos na tabela live_prices (Postgres Supabase, mesma
// conexao Prisma usada pelos candles). settle_trade/place_trade leem dela em vez
// de confiar no preco do cliente.
//
// Forex real (Twelve Data) NAO entra: o plano Basic 8 (8 req/min) nao sustenta
// polling + graficos. Forex e coberto pelas versoes OTC (engine). Cripto via
// Binance (gratis, sem limite).
//
// Mapeamento asset_id (operations.asset_id) <-> simbolo. Casa com:
//   - OTC:    seed-otc.ts + web/src/lib/otcClient.ts (OTC_SYMBOL_MAP)
//   - cripto: web/src/lib/marketSymbols.ts (REAL_ASSETS)

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

type PriceRow = { assetId: string; symbol: string; price: number; source: string }

// Upsert batch via Prisma raw. assetId/symbol/source sao constantes do servidor
// (nao input de usuario) e price e number validado -> sem vetor de injecao.
async function upsert(rows: PriceRow[]) {
  const valid = rows.filter(r => Number.isFinite(r.price) && r.price > 0)
  if (valid.length === 0) return
  const values = valid
    .map(r => `('${r.assetId}','${r.symbol}',${r.price},'${r.source}',now())`)
    .join(',')
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO live_prices (asset_id, symbol, price, source, updated_at)
       VALUES ${values}
       ON CONFLICT (asset_id) DO UPDATE
         SET price = EXCLUDED.price, symbol = EXCLUDED.symbol,
             source = EXCLUDED.source, updated_at = now()`,
    )
  } catch (err: any) {
    console.error('[live-prices] upsert:', err?.message ?? err)
  }
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
  // data-api.binance.vision: endpoint publico sem bloqueio geografico (VPS em SFO).
  const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, {
    signal: AbortSignal.timeout(4_000),
  })
  const json = (await res.json()) as { price?: string }
  const price = parseFloat(json.price ?? '')
  if (!price || isNaN(price)) throw new Error(`binance ${symbol}: sem preco`)
  return price
}

// Cripto: Binance a cada 10s. Falha de um par nao derruba os outros.
async function publishCrypto() {
  const rows: PriceRow[] = []
  await Promise.all(
    CRYPTO_ASSETS.map(async a => {
      try { rows.push({ assetId: a.assetId, symbol: a.symbol, price: await fetchBinance(a.symbol), source: 'binance' }) }
      catch (e: any) { console.error('[live-prices]', e.message) }
    }),
  )
  return upsert(rows)
}

let otcTimer: NodeJS.Timeout | null = null
let cryptoTimer: NodeJS.Timeout | null = null

export function startLivePricePublisher() {
  // OTC: 2s (memoria, barato). Cripto: 10s.
  otcTimer    = setInterval(() => { publishOtc().catch(e => console.error('[live-prices] otc:', e.message)) }, 2_000)
  cryptoTimer = setInterval(() => { publishCrypto().catch(e => console.error('[live-prices] crypto:', e.message)) }, 10_000)
  publishCrypto().catch(() => {})  // primeiro publish imediato
  console.log('[live-prices] publisher iniciado via Prisma (OTC 2s, cripto 10s)')

  const stop = () => { if (otcTimer) clearInterval(otcTimer); if (cryptoTimer) clearInterval(cryptoTimer) }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
