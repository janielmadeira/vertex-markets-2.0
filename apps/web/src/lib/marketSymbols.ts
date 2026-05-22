type MarketSource = 'yahoo' | 'binance'

export interface RealAssetConfig {
  symbol: string
  source: MarketSource
}

// Yahoo Finance: gratuito, sem API key, sem rate limit oficial.
// Binance: gratuito, sem API key para dados públicos.
export const REAL_ASSETS: Record<string, RealAssetConfig> = {
  'eur-usd': { symbol: 'EURUSD=X', source: 'yahoo'   },
  'gbp-usd': { symbol: 'GBPUSD=X', source: 'yahoo'   },
  'btc-otc': { symbol: 'BTCUSDT',  source: 'binance' },
  'eth-otc': { symbol: 'ETHUSDT',  source: 'binance' },
}

// Binance klines interval strings
export function tfToBinanceInterval(seconds: number): string {
  if (seconds < 60)      return '1m'
  if (seconds === 300)   return '5m'
  if (seconds === 900)   return '15m'
  if (seconds === 1800)  return '30m'
  if (seconds === 3600)  return '1h'
  if (seconds === 14400) return '4h'
  return '1d'
}
