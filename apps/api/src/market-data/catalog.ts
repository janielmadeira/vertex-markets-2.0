// Catalogo canonico de ativos LIVE (nao-OTC) conhecido pelo backend.
// Espelha apps/web/src/lib/marketSymbols.ts (REAL_ASSETS) + ASSETS de mockData.ts.
// O backend precisa conhecer esses ativos para classificar (CRYPTO vs FOREX),
// validar entry price contra o feed proprio e liquidar server-side.
//
// OTC NAO entra aqui — ativos OTC vivem na tabela otc_assets e sao detectados
// via serverAuthSymbols em operations/service.ts. Este catalogo cobre so os
// pares com feed de mercado real (cripto via Binance, forex via Twelve Data).
//
// Para adicionar um ativo live novo: 1) add em ASSETS (web); 2) add em
// REAL_ASSETS (web); 3) add aqui com o mesmo assetId.

export type LiveKind = 'CRYPTO' | 'FOREX'

export interface LiveAssetConfig {
  assetId:    string
  kind:       LiveKind
  feedSymbol: string   // Binance: 'BTCUSDT' | Twelve Data: 'EUR/USD'
  decimals:   number
  payout:     number
}

export const LIVE_ASSETS: Record<string, LiveAssetConfig> = {
  // ── Cripto via Binance WS (tempo real, gratis) ─────────────────────
  'btc': { assetId: 'btc', kind: 'CRYPTO', feedSymbol: 'BTCUSDT', decimals: 2, payout: 88 },
  'eth': { assetId: 'eth', kind: 'CRYPTO', feedSymbol: 'ETHUSDT', decimals: 2, payout: 88 },
  'sol': { assetId: 'sol', kind: 'CRYPTO', feedSymbol: 'SOLUSDT', decimals: 2, payout: 85 },
  'xrp': { assetId: 'xrp', kind: 'CRYPTO', feedSymbol: 'XRPUSDT', decimals: 4, payout: 85 },
  'bnb': { assetId: 'bnb', kind: 'CRYPTO', feedSymbol: 'BNBUSDT', decimals: 2, payout: 85 },

  // ── Forex via Twelve Data (poller, atras de flag) ──────────────────
  'eur-usd': { assetId: 'eur-usd', kind: 'FOREX', feedSymbol: 'EUR/USD', decimals: 5, payout: 92 },
  'gbp-usd': { assetId: 'gbp-usd', kind: 'FOREX', feedSymbol: 'GBP/USD', decimals: 5, payout: 92 },
  'usd-jpy': { assetId: 'usd-jpy', kind: 'FOREX', feedSymbol: 'USD/JPY', decimals: 3, payout: 92 },
}

export function getLiveAsset(assetId: string): LiveAssetConfig | null {
  return LIVE_ASSETS[assetId] ?? null
}

// Simbolos de feed por tipo — usados pelos feeds para saber o que assinar/pollar.
export function cryptoFeedSymbols(): string[] {
  return Object.values(LIVE_ASSETS).filter(a => a.kind === 'CRYPTO').map(a => a.feedSymbol)
}

export function forexFeedSymbols(): string[] {
  return Object.values(LIVE_ASSETS).filter(a => a.kind === 'FOREX').map(a => a.feedSymbol)
}
