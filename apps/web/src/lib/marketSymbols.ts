type MarketSource = 'yahoo' | 'binance'

export interface RealAssetConfig {
  symbol: string
  source: MarketSource
}

// Yahoo Finance: gratuito, sem API key.
// Binance: gratuito, sem API key para dados públicos.
export const REAL_ASSETS: Record<string, RealAssetConfig> = {
  // ── Forex via Yahoo Finance ──────────────────────────────────────
  'eur-usd': { symbol: 'EURUSD=X', source: 'yahoo' },
  'gbp-usd': { symbol: 'GBPUSD=X', source: 'yahoo' },
  'usd-jpy': { symbol: 'JPY=X',    source: 'yahoo' },
  'eur-jpy': { symbol: 'EURJPY=X', source: 'yahoo' },
  'aud-usd': { symbol: 'AUDUSD=X', source: 'yahoo' },
  'aud-jpy': { symbol: 'AUDJPY=X', source: 'yahoo' },
  'aud-chf': { symbol: 'AUDCHF=X', source: 'yahoo' },
  'aud-cad': { symbol: 'AUDCAD=X', source: 'yahoo' },
  'eur-gbp': { symbol: 'EURGBP=X', source: 'yahoo' },
  'gbp-aud': { symbol: 'GBPAUD=X', source: 'yahoo' },
  'gbp-cad': { symbol: 'GBPCAD=X', source: 'yahoo' },
  'usd-cad': { symbol: 'CAD=X',    source: 'yahoo' },
  'cad-jpy': { symbol: 'CADJPY=X', source: 'yahoo' },
  'gold':    { symbol: 'GC=F',     source: 'yahoo' },
  'silver':  { symbol: 'SI=F',     source: 'yahoo' },

  // ── Cripto via Binance ───────────────────────────────────────────
  'btc-otc':  { symbol: 'BTCUSDT',  source: 'binance' },
  'eth-otc':  { symbol: 'ETHUSDT',  source: 'binance' },
  'sol-otc':  { symbol: 'SOLUSDT',  source: 'binance' },
  'bnb-otc':  { symbol: 'BNBUSDT',  source: 'binance' },
  'xrp-otc':  { symbol: 'XRPUSDT',  source: 'binance' },
  'ada-otc':  { symbol: 'ADAUSDT',  source: 'binance' },
  'doge-otc': { symbol: 'DOGEUSDT', source: 'binance' },
  'ltc-otc':  { symbol: 'LTCUSDT',  source: 'binance' },
  'link-otc': { symbol: 'LINKUSDT', source: 'binance' },
  'dot-otc':  { symbol: 'DOTUSDT',  source: 'binance' },
  'bch-otc':  { symbol: 'BCHUSDT',  source: 'binance' },
  'etc-otc':  { symbol: 'ETCUSDT',  source: 'binance' },
  'atom-otc': { symbol: 'ATOMUSDT', source: 'binance' },
  'zec-otc':  { symbol: 'ZECUSDT',  source: 'binance' },
  'axs-otc':  { symbol: 'AXSUSDT',  source: 'binance' },
  'dash-otc': { symbol: 'DASHUSDT', source: 'binance' },
}

// Retorna true se o ativo tem dados de mercado real
export function isRealMarket(assetId: string): boolean {
  return assetId in REAL_ASSETS
}

// Retorna a fonte do ativo: 'binance' | 'yahoo' | null (OTC simulado)
export function getMarketSource(assetId: string): MarketSource | null {
  return REAL_ASSETS[assetId]?.source ?? null
}

// Converte timeframe em segundos para intervalo da Binance
export function tfToBinanceInterval(seconds: number): string {
  if (seconds <= 60)     return '1m'
  if (seconds === 300)   return '5m'
  if (seconds === 900)   return '15m'
  if (seconds === 1800)  return '30m'
  if (seconds === 3600)  return '1h'
  if (seconds === 14400) return '4h'
  return '1d'
}
