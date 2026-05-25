export interface ActiveTrade {
  id: string
  assetId: string
  entryPrice: number
  entryTime: number
  expiryTime: number
  direction: 'CALL' | 'PUT'
  amount: number
  payout: number
}

export interface Asset {
  id: string
  symbol: string
  label: string
  type: 'OTC' | 'Forex' | 'Crypto'
  category: 'Moedas' | 'Cripto' | 'Matérias-Primas' | 'Ações'
  payout: number
  payout5min: number
  flag1: string
  flag2: string
  code1: string  // ISO 3166-1 alpha-2 for flagcdn.com
  code2: string
  price: number
  change24h: number
}

export const ASSETS: Asset[] = [
  // Moedas Forex
  { id: 'eur-jpy', symbol: 'EUR/JPY', label: 'EUR/JPY', type: 'Forex', category: 'Moedas', payout: 92, payout5min: 94, flag1: '🇪🇺', flag2: '🇯🇵', code1: 'eu', code2: 'jp', price: 170.54, change24h: 0.05 },
  { id: 'usd-jpy', symbol: 'USD/JPY', label: 'USD/JPY', type: 'Forex', category: 'Moedas', payout: 92, payout5min: 91, flag1: '🇺🇸', flag2: '🇯🇵', code1: 'us', code2: 'jp', price: 158.92, change24h: -0.18 },
  { id: 'aud-jpy', symbol: 'AUD/JPY', label: 'AUD/JPY', type: 'Forex', category: 'Moedas', payout: 91, payout5min: 94, flag1: '🇦🇺', flag2: '🇯🇵', code1: 'au', code2: 'jp', price: 104.23, change24h: 0.63 },
  { id: 'aud-usd', symbol: 'AUD/USD', label: 'AUD/USD', type: 'Forex', category: 'Moedas', payout: 89, payout5min: 94, flag1: '🇦🇺', flag2: '🇺🇸', code1: 'au', code2: 'us', price: 0.6612, change24h: 0.81 },
  { id: 'aud-chf', symbol: 'AUD/CHF', label: 'AUD/CHF', type: 'Forex', category: 'Moedas', payout: 88, payout5min: 94, flag1: '🇦🇺', flag2: '🇨🇭', code1: 'au', code2: 'ch', price: 0.5891, change24h: 0.48 },
  { id: 'eur-gbp', symbol: 'EUR/GBP', label: 'EUR/GBP', type: 'Forex', category: 'Moedas', payout: 87, payout5min: 92, flag1: '🇪🇺', flag2: '🇬🇧', code1: 'eu', code2: 'gb', price: 0.8521, change24h: -0.20 },
  { id: 'cad-jpy', symbol: 'CAD/JPY', label: 'CAD/JPY', type: 'Forex', category: 'Moedas', payout: 85, payout5min: 92, flag1: '🇨🇦', flag2: '🇯🇵', code1: 'ca', code2: 'jp', price: 116.78, change24h: -0.08 },
  { id: 'aud-cad', symbol: 'AUD/CAD', label: 'AUD/CAD', type: 'Forex', category: 'Moedas', payout: 84, payout5min: 94, flag1: '🇦🇺', flag2: '🇨🇦', code1: 'au', code2: 'ca', price: 0.9021, change24h: 0.71 },
  { id: 'gbp-usd', symbol: 'GBP/USD', label: 'GBP/USD', type: 'Forex', category: 'Moedas', payout: 84, payout5min: 94, flag1: '🇬🇧', flag2: '🇺🇸', code1: 'gb', code2: 'us', price: 1.2734, change24h: 0.42 },
  { id: 'eur-usd', symbol: 'EUR/USD', label: 'EUR/USD', type: 'Forex', category: 'Moedas', payout: 80, payout5min: 94, flag1: '🇪🇺', flag2: '🇺🇸', code1: 'eu', code2: 'us', price: 1.0854, change24h: 0.12 },
  { id: 'gbp-aud', symbol: 'GBP/AUD', label: 'GBP/AUD', type: 'Forex', category: 'Moedas', payout: 80, payout5min: 94, flag1: '🇬🇧', flag2: '🇦🇺', code1: 'gb', code2: 'au', price: 1.9265, change24h: -0.38 },
  { id: 'usd-cad', symbol: 'USD/CAD', label: 'USD/CAD', type: 'Forex', category: 'Moedas', payout: 79, payout5min: 94, flag1: '🇺🇸', flag2: '🇨🇦', code1: 'us', code2: 'ca', price: 1.3621, change24h: -0.10 },
  { id: 'gbp-cad', symbol: 'GBP/CAD', label: 'GBP/CAD', type: 'Forex', category: 'Moedas', payout: 78, payout5min: 94, flag1: '🇬🇧', flag2: '🇨🇦', code1: 'gb', code2: 'ca', price: 1.7341, change24h: 0.32 },
  // OTC
  { id: 'usd-brl-otc', symbol: 'USD/BRL', label: 'USD/BRL (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 85, flag1: '🇺🇸', flag2: '🇧🇷', code1: 'us', code2: 'br', price: 5.742, change24h: -2.39 },
  { id: 'eur-nzd-otc', symbol: 'EUR/NZD', label: 'EUR/NZD (OTC)', type: 'OTC', category: 'Moedas', payout: 95, payout5min: 95, flag1: '🇪🇺', flag2: '🇳🇿', code1: 'eu', code2: 'nz', price: 1.7812, change24h: -0.85 },
  { id: 'aud-nzd-otc', symbol: 'AUD/NZD', label: 'AUD/NZD (OTC)', type: 'OTC', category: 'Moedas', payout: 95, payout5min: 95, flag1: '🇦🇺', flag2: '🇳🇿', code1: 'au', code2: 'nz', price: 1.0891, change24h: 0.25 },
  { id: 'nzd-cad-otc', symbol: 'NZD/CAD', label: 'NZD/CAD (OTC)', type: 'OTC', category: 'Moedas', payout: 95, payout5min: 95, flag1: '🇳🇿', flag2: '🇨🇦', code1: 'nz', code2: 'ca', price: 0.8234, change24h: 0.05 },
  { id: 'usd-dzd-otc', symbol: 'USD/DZD', label: 'USD/DZD (OTC)', type: 'OTC', category: 'Moedas', payout: 95, payout5min: 95, flag1: '🇺🇸', flag2: '🇩🇿', code1: 'us', code2: 'dz', price: 134.52, change24h: 0.00 },
  { id: 'usd-egp-otc', symbol: 'USD/EGP', label: 'USD/EGP (OTC)', type: 'OTC', category: 'Moedas', payout: 95, payout5min: 95, flag1: '🇺🇸', flag2: '🇪🇬', code1: 'us', code2: 'eg', price: 30.90, change24h: -0.03 },
  { id: 'nzd-chf-otc', symbol: 'NZD/CHF', label: 'NZD/CHF (OTC)', type: 'OTC', category: 'Moedas', payout: 94, payout5min: 93, flag1: '🇳🇿', flag2: '🇨🇭', code1: 'nz', code2: 'ch', price: 0.5421, change24h: 0.91 },
  { id: 'usd-mxn-otc', symbol: 'USD/MXN', label: 'USD/MXN (OTC)', type: 'OTC', category: 'Moedas', payout: 92, payout5min: 86, flag1: '🇺🇸', flag2: '🇲🇽', code1: 'us', code2: 'mx', price: 17.12, change24h: -0.18 },
  { id: 'usd-cop-otc', symbol: 'USD/COP', label: 'USD/COP (OTC)', type: 'OTC', category: 'Moedas', payout: 90, payout5min: 94, flag1: '🇺🇸', flag2: '🇨🇴', code1: 'us', code2: 'co', price: 3921.5, change24h: 0.06 },
  { id: 'usd-ngn-otc', symbol: 'USD/NGN', label: 'USD/NGN (OTC)', type: 'OTC', category: 'Moedas', payout: 89, payout5min: 84, flag1: '🇺🇸', flag2: '🇳🇬', code1: 'us', code2: 'ng', price: 1480.0, change24h: 0.00 },
  { id: 'usd-inr-otc', symbol: 'USD/INR', label: 'USD/INR (OTC)', type: 'OTC', category: 'Moedas', payout: 88, payout5min: 91, flag1: '🇺🇸', flag2: '🇮🇳', code1: 'us', code2: 'in', price: 83.12, change24h: -0.09 },
  { id: 'usd-ars-otc', symbol: 'USD/ARS', label: 'USD/ARS (OTC)', type: 'OTC', category: 'Moedas', payout: 86, payout5min: 87, flag1: '🇺🇸', flag2: '🇦🇷', code1: 'us', code2: 'ar', price: 889.5, change24h: 0.80 },
  { id: 'cad-chf-otc', symbol: 'CAD/CHF', label: 'CAD/CHF (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 87, flag1: '🇨🇦', flag2: '🇨🇭', code1: 'ca', code2: 'ch', price: 0.6712, change24h: 6.88 },
  { id: 'gbp-nzd-otc', symbol: 'GBP/NZD', label: 'GBP/NZD (OTC)', type: 'OTC', category: 'Moedas', payout: 83, payout5min: 82, flag1: '🇬🇧', flag2: '🇳🇿', code1: 'gb', code2: 'nz', price: 2.0341, change24h: 0.08 },
  { id: 'eur-aud-otc', symbol: 'EUR/AUD', label: 'EUR/AUD (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 85, flag1: '🇪🇺', flag2: '🇦🇺', code1: 'eu', code2: 'au', price: 1.6423, change24h: -0.12 },
  { id: 'gbp-chf-otc', symbol: 'GBP/CHF', label: 'GBP/CHF (OTC)', type: 'OTC', category: 'Moedas', payout: 80, payout5min: 84, flag1: '🇬🇧', flag2: '🇨🇭', code1: 'gb', code2: 'ch', price: 1.1432, change24h: 0.22 },
  { id: 'usd-chf-otc', symbol: 'USD/CHF', label: 'USD/CHF (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 85, flag1: '🇺🇸', flag2: '🇨🇭', code1: 'us', code2: 'ch', price: 0.8971, change24h: -0.31 },
  { id: 'eur-chf-otc', symbol: 'EUR/CHF', label: 'EUR/CHF (OTC)', type: 'OTC', category: 'Moedas', payout: 78, payout5min: 82, flag1: '🇪🇺', flag2: '🇨🇭', code1: 'eu', code2: 'ch', price: 0.9732, change24h: 0.15 },
  { id: 'usd-sgd-otc', symbol: 'USD/SGD', label: 'USD/SGD (OTC)', type: 'OTC', category: 'Moedas', payout: 77, payout5min: 81, flag1: '🇺🇸', flag2: '🇸🇬', code1: 'us', code2: 'sg', price: 1.3421, change24h: -0.07 },
  { id: 'usd-pln-otc', symbol: 'USD/PLN', label: 'USD/PLN (OTC)', type: 'OTC', category: 'Moedas', payout: 76, payout5min: 80, flag1: '🇺🇸', flag2: '🇵🇱', code1: 'us', code2: 'pl', price: 3.9821, change24h: 0.43 },
  // Cripto OTC
  { id: 'bch-otc', symbol: 'BCH/USD', label: 'Bitcoin Cash (OTC)', type: 'OTC', category: 'Cripto', payout: 95, payout5min: 89, flag1: '₿', flag2: '🇺🇸', code1: 'crypto:bch', code2: 'us', price: 484.20, change24h: -0.32 },
  { id: 'bnb-otc', symbol: 'BNB/USD', label: 'Binance Coin (OTC)', type: 'OTC', category: 'Cripto', payout: 95, payout5min: 95, flag1: '🪙', flag2: '🇺🇸', code1: 'crypto:bnb', code2: 'us', price: 612.30, change24h: -0.11 },
  { id: 'etc-otc', symbol: 'ETC/USD', label: 'Ethereum Classic (OTC)', type: 'OTC', category: 'Cripto', payout: 95, payout5min: 76, flag1: 'Ξ', flag2: '🇺🇸', code1: 'crypto:etc', code2: 'us', price: 27.84, change24h: 10.22 },
  { id: 'ltc-otc', symbol: 'LTC/USD', label: 'Litecoin (OTC)', type: 'OTC', category: 'Cripto', payout: 95, payout5min: 81, flag1: 'Ł', flag2: '🇺🇸', code1: 'crypto:ltc', code2: 'us', price: 84.52, change24h: -4.84 },
  { id: 'sol-otc', symbol: 'SOL/USD', label: 'Solana (OTC)', type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: '◎', flag2: '🇺🇸', code1: 'crypto:sol', code2: 'us', price: 172.40, change24h: 4.25 },
  { id: 'trump-otc', symbol: 'TRUMP/USD', label: 'Trump (OTC)', type: 'OTC', category: 'Cripto', payout: 95, payout5min: 95, flag1: '🪙', flag2: '🇺🇸', code1: 'crypto:trump', code2: 'us', price: 11.24, change24h: -4.26 },
  { id: 'xrp-otc', symbol: 'XRP/USD', label: 'Ripple (OTC)', type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: '◉', flag2: '🇺🇸', code1: 'crypto:xrp', code2: 'us', price: 0.5123, change24h: 7.50 },
  { id: 'zec-otc', symbol: 'ZEC/USD', label: 'Zcash (OTC)', type: 'OTC', category: 'Cripto', payout: 95, payout5min: 95, flag1: 'Z', flag2: '🇺🇸', code1: 'crypto:zec', code2: 'us', price: 28.91, change24h: 5.43 },
  { id: 'atom-otc', symbol: 'ATOM/USD', label: 'Cosmos (OTC)', type: 'OTC', category: 'Cripto', payout: 93, payout5min: 95, flag1: '⚛', flag2: '🇺🇸', code1: 'crypto:atom', code2: 'us', price: 8.21, change24h: -3.90 },
  { id: 'dash-otc', symbol: 'DASH/USD', label: 'Dash (OTC)', type: 'OTC', category: 'Cripto', payout: 90, payout5min: 61, flag1: 'D', flag2: '🇺🇸', code1: 'crypto:dash', code2: 'us', price: 29.14, change24h: 2.58 },
  { id: 'dot-otc', symbol: 'DOT/USD', label: 'Polkadot (OTC)', type: 'OTC', category: 'Cripto', payout: 90, payout5min: 53, flag1: '●', flag2: '🇺🇸', code1: 'crypto:dot', code2: 'us', price: 7.42, change24h: -9.66 },
  { id: 'link-otc', symbol: 'LINK/USD', label: 'Chainlink (OTC)', type: 'OTC', category: 'Cripto', payout: 85, payout5min: 74, flag1: '⬡', flag2: '🇺🇸', code1: 'crypto:link', code2: 'us', price: 14.32, change24h: -6.67 },
  { id: 'axs-otc', symbol: 'AXS/USD', label: 'Axie Infinity (OTC)', type: 'OTC', category: 'Cripto', payout: 82, payout5min: 77, flag1: '🎮', flag2: '🇺🇸', code1: 'crypto:axs', code2: 'us', price: 5.87, change24h: 10.10 },
  { id: 'btc-otc', symbol: 'BTC/USD', label: 'Bitcoin (OTC)', type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: '₿', flag2: '🇺🇸', code1: 'crypto:btc', code2: 'us', price: 67420, change24h: 0.49 },
  { id: 'eth-otc', symbol: 'ETH/USD', label: 'Ethereum (OTC)', type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: 'Ξ', flag2: '🇺🇸', code1: 'crypto:eth', code2: 'us', price: 3521, change24h: -1.12 },
  { id: 'ada-otc', symbol: 'ADA/USD', label: 'Cardano (OTC)', type: 'OTC', category: 'Cripto', payout: 75, payout5min: 68, flag1: '₳', flag2: '🇺🇸', code1: 'crypto:ada', code2: 'us', price: 0.4521, change24h: 2.34 },
  { id: 'doge-otc', symbol: 'DOGE/USD', label: 'Dogecoin (OTC)', type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: 'Ð', flag2: '🇺🇸', code1: 'crypto:doge', code2: 'us', price: 0.1621, change24h: -1.87 },
  // Matérias-Primas
  { id: 'ukbrent-otc', symbol: 'UKBrent', label: 'UKBrent (OTC)', type: 'OTC', category: 'Matérias-Primas', payout: 86, payout5min: 95, flag1: '🛢', flag2: '🇺🇸', code1: 'gb', code2: 'us', price: 84.21, change24h: 8.81 },
  { id: 'uscrude-otc', symbol: 'USCrude', label: 'USCrude (OTC)', type: 'OTC', category: 'Matérias-Primas', payout: 85, payout5min: 95, flag1: '🛢', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 79.54, change24h: -4.78 },
  { id: 'silver', symbol: 'XAG/USD', label: 'Silver', type: 'Forex', category: 'Matérias-Primas', payout: 44, payout5min: 44, flag1: '🥈', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 31.42, change24h: 2.24 },
  { id: 'gold', symbol: 'XAU/USD', label: 'Gold', type: 'Forex', category: 'Matérias-Primas', payout: 44, payout5min: 44, flag1: '🥇', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 2345.80, change24h: 0.75 },
  // Ações OTC
  { id: 'jnj-otc', symbol: 'JNJ', label: 'Johnson & Johnson (OTC)', type: 'OTC', category: 'Ações', payout: 95, payout5min: 95, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 147.82, change24h: -0.33 },
  { id: 'intc-otc', symbol: 'INTC', label: 'Intel (OTC)', type: 'OTC', category: 'Ações', payout: 90, payout5min: 95, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 30.21, change24h: 0.19 },
  { id: 'msft-otc', symbol: 'MSFT', label: 'Microsoft (OTC)', type: 'OTC', category: 'Ações', payout: 90, payout5min: 85, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 421.54, change24h: -0.17 },
  { id: 'ba-otc', symbol: 'BA', label: 'Boeing Company (OTC)', type: 'OTC', category: 'Ações', payout: 89, payout5min: 94, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 182.41, change24h: 0.65 },
  { id: 'meta-otc', symbol: 'META', label: 'FACEBOOK INC (OTC)', type: 'OTC', category: 'Ações', payout: 87, payout5min: 84, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 512.30, change24h: 7.90 },
  { id: 'pfe-otc', symbol: 'PFE', label: 'Pfizer Inc (OTC)', type: 'OTC', category: 'Ações', payout: 87, payout5min: 81, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 28.14, change24h: 9.13 },
  { id: 'mcd-otc', symbol: 'MCD', label: "McDonald's (OTC)", type: 'OTC', category: 'Ações', payout: 82, payout5min: 95, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 278.92, change24h: -1.34 },
  { id: 'axp-otc', symbol: 'AXP', label: 'American Express (OTC)', type: 'OTC', category: 'Ações', payout: 81, payout5min: 81, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 231.45, change24h: -0.29 },
  { id: 'asx200', symbol: 'S&P/ASX 200', label: 'S&P/ASX 200', type: 'Forex', category: 'Ações', payout: 24, payout5min: 24, flag1: '📊', flag2: '🇦🇺', code1: 'au', code2: 'us', price: 7821.30, change24h: 0.22 },
  { id: 'ftse-china', symbol: 'FTSE China A50', label: 'FTSE China A50 Index', type: 'Forex', category: 'Ações', payout: 24, payout5min: 24, flag1: '📊', flag2: '🇨🇳', code1: 'cn', code2: 'us', price: 13421.0, change24h: 0.00 },
  { id: 'aapl-otc', symbol: 'AAPL', label: 'Apple Inc (OTC)', type: 'OTC', category: 'Ações', payout: 85, payout5min: 85, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 189.21, change24h: -0.54 },
  { id: 'googl-otc', symbol: 'GOOGL', label: 'Google (OTC)', type: 'OTC', category: 'Ações', payout: 79, payout5min: 76, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 178.42, change24h: 1.21 },
  { id: 'amzn-otc', symbol: 'AMZN', label: 'Amazon (OTC)', type: 'OTC', category: 'Ações', payout: 78, payout5min: 75, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 192.15, change24h: 0.87 },
  { id: 'tsla-otc', symbol: 'TSLA', label: 'Tesla (OTC)', type: 'OTC', category: 'Ações', payout: 85, payout5min: 85, flag1: '📊', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 172.80, change24h: -2.14 },
]

export const DEFAULT_FAVORITES = ['eur-jpy', 'usd-jpy', 'aud-jpy', 'aud-usd', 'aud-chf', 'eur-gbp', 'cad-jpy', 'aud-cad', 'gbp-usd', 'eur-usd']

export function getAssetDecimals(asset: Asset): number {
  if (asset.category === 'Cripto')           return asset.price < 1 ? 4 : 2
  if (asset.category === 'Ações')            return 2
  if (asset.category === 'Matérias-Primas')  return 2
  // Moedas / Forex
  if (asset.symbol.includes('JPY'))          return 3
  if (asset.price >= 20)                     return 2  // USD/EGP, USD/INR, USD/DZD, USD/COP, USD/ARS…
  if (asset.price >= 5)                      return 3  // USD/BRL, USD/MXN
  return 5                                             // EUR/USD, GBP/USD, AUD/USD…
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

const BRT_OFFSET = -3 * 3600 // UTC-3 (Horário de Brasília)

function hashSeed(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h >>> 0
}

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
}

// Single deterministic value in [-1, 1] from a seed integer
function randFromSeed(seed: number): number {
  let s = (seed >>> 0) || 1
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5
  return (s >>> 0) / 0xFFFFFFFF * 2 - 1
}

// Value noise: smoothly interpolates between random targets at period boundaries.
// Ensures price continuity (no jumps) while producing realistic trend-like movement.
function valueNoise(periodSec: number, t: number, seed: number): number {
  const idx  = Math.floor(t / periodSec)
  const frac = (t % periodSec) / periodSec
  const v0   = randFromSeed(seed ^ hashSeed(String(idx)))
  const v1   = randFromSeed(seed ^ hashSeed(String(idx + 1)))
  // Smoothstep — removes derivative discontinuities at period edges
  const s    = frac * frac * (3 - 2 * frac)
  return v0 * (1 - s) + v1 * s
}

// OTC price engine v2 — fractal value noise.
// Replaces sine waves with realistic-looking trend phases that have momentum,
// pullbacks, and volatility clustering. Each asset gets unique behavior via assetSeed.
export function getOTCPrice(assetId: string, timestampSec: number, basePrice: number): number {
  const seed = hashSeed(assetId)
  const t    = timestampSec
  // Amplitudes calibradas para OTC estilo Quotex:
  // Mini-tendências de 3–8 candles com reversões frequentes.
  // Componentes de curto prazo (5m, 15m) dominam o visual — parecido com o que
  // um trader vê no 1m: mercado "vivo" sem tendência direcional forte.
  const move =
    valueNoise(14400, t, seed ^ 0xA1B2C3D4) * 0.008 +  // 4h macro (sutil — só define viés geral)
    valueNoise(3600,  t, seed ^ 0xB2C3D4E5) * 0.006 +  // 1h sessão
    valueNoise(900,   t, seed ^ 0xC3D4E5F6) * 0.005 +  // 15m momentum (mini-runs de 8–12 candles)
    valueNoise(300,   t, seed ^ 0xD4E5F6A7) * 0.004 +  // 5m flow (mini-runs de 3–6 candles) ← dominante
    valueNoise(120,   t, seed ^ 0xE1F2A3B4) * 0.003 +  // 2m oscilação rápida
    valueNoise(60,    t, seed ^ 0xE5F6A7B8) * 0.0020 + // 1m tick individual
    valueNoise(15,    t, seed ^ 0xF6A7B8C9) * 0.0008 + // 15s intra-candle
    valueNoise(5,     t, seed ^ 0xA7B8C9DA) * 0.0003   // 5s micro
  return Math.max(basePrice * (1 + move), basePrice * 0.001)
}

export function generateMockCandles(basePrice = 158.92, count = 120, interval = 60, seedKey = ''): Candle[] {
  const candles: Candle[] = []
  const now = Math.floor(Date.now() / 1000) + BRT_OFFSET
  const alignedNow = Math.floor(now / interval) * interval

  // Extract assetId from seedKey (format: "assetId:interval") — falls back to random walk if absent
  const assetId = seedKey.includes(':') ? seedKey.split(':')[0] : ''

  if (!assetId) {
    // Fallback: seeded random walk (non-OTC assets without a seedKey)
    const rng = seedKey ? makeRng(hashSeed(seedKey)) : Math.random.bind(Math)
    let price = basePrice * (1 + (rng() - 0.5) * 0.02)
    let trend = (rng() - 0.5) * 0.3
    let trendAge = 0
    const vol = basePrice * 0.0008
    for (let i = count; i >= 1; i--) {
      trendAge++
      if (trendAge > 8 + Math.floor(rng() * 12)) { trend = (rng() - 0.5) * 0.4; trendAge = 0 }
      trend += (basePrice - price) / basePrice * 0.15
      const open = price
      let lo = open, hi = open
      for (let t = 0; t < 8; t++) {
        price += trend * vol + (rng() - 0.5) * vol * 1.5
        if (price < lo) lo = price; if (price > hi) hi = price
      }
      const close = price
      const wicks = vol * (0.3 + rng() * 0.5)
      candles.push({ time: alignedNow - i * interval, open: parseFloat(open.toFixed(5)), high: parseFloat((hi + wicks).toFixed(5)), low: parseFloat((lo - wicks).toFixed(5)), close: parseFloat(close.toFixed(5)) })
    }
    return candles
  }

  // OTC: sample getOTCPrice at sub-intervals to build OHLC.
  // 20 samples per candle gives accurate high/low without being too expensive.
  const SAMPLES = 20
  const step = Math.max(1, Math.floor(interval / SAMPLES))
  const fmt = (v: number) => parseFloat(v.toFixed(5))

  for (let i = count; i >= 1; i--) {
    const candleStart = alignedNow - i * interval
    let hi = -Infinity, lo = Infinity
    let open = 0, close = 0
    for (let j = 0; j <= SAMPLES; j++) {
      const s = getOTCPrice(assetId, candleStart + j * step, basePrice)
      if (j === 0)       open  = s
      if (j === SAMPLES) close = s
      if (s > hi) hi = s
      if (s < lo) lo = s
    }
    // Wicks proporcionais ao corpo — estilo Quotex OTC: discretos, não exagerados.
    const bodySize  = Math.abs(close - open)
    const wickScale = (randFromSeed(hashSeed(assetId) ^ (candleStart >>> 2)) + 1) / 2  // [0, 1]
    const wickExtra = bodySize * (0.08 + wickScale * 0.18)  // 8–26% do corpo
    candles.push({
      time:  candleStart,
      open:  fmt(open),
      high:  fmt(hi  + wickExtra),
      low:   fmt(lo  - wickExtra),
      close: fmt(close),
    })
  }

  return candles
}

export interface OpenTrade {
  id: string
  asset: Asset
  direction: 'CALL' | 'PUT'
  amount: number
  profit: number
  expiryTime: number  // Unix timestamp (seconds) when the trade expires
  entryPrice: number
  duration?: number   // total duration in seconds (used for early exit decay)
}

export const MOCK_OPEN_TRADES: OpenTrade[] = []
