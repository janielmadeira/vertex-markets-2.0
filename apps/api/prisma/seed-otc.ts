import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 10 pares OTC server-authoritative (payout maior que fallback client-side).
// basePrice alinhado com mockData do front; volatility/decimals calibrados por classe.
const SEEDS = [
  // Forex
  { symbol: 'USDBRL-OTC', name: 'USD/BRL OTC', basePrice: 5.74200,  volatility: 0.0008, payout: 85, decimals: 5 },
  { symbol: 'USDCHF-OTC', name: 'USD/CHF OTC', basePrice: 0.89710,  volatility: 0.0006, payout: 85, decimals: 5 },
  { symbol: 'EURAUD-OTC', name: 'EUR/AUD OTC', basePrice: 1.64230,  volatility: 0.0007, payout: 85, decimals: 5 },
  // Cripto
  { symbol: 'BTCUSD-OTC',  name: 'BTC/USD OTC',  basePrice: 67420.00, volatility: 0.0030, payout: 85, decimals: 2 },
  { symbol: 'ETHUSD-OTC',  name: 'ETH/USD OTC',  basePrice: 3521.00,  volatility: 0.0030, payout: 85, decimals: 2 },
  { symbol: 'SOLUSD-OTC',  name: 'SOL/USD OTC',  basePrice: 172.40,   volatility: 0.0040, payout: 85, decimals: 2 },
  { symbol: 'XRPUSD-OTC',  name: 'XRP/USD OTC',  basePrice: 0.5123,   volatility: 0.0040, payout: 85, decimals: 4 },
  { symbol: 'DOGEUSD-OTC', name: 'DOGE/USD OTC', basePrice: 0.1621,   volatility: 0.0050, payout: 85, decimals: 4 },
  // Ações
  { symbol: 'AAPL-OTC', name: 'Apple Inc OTC', basePrice: 189.21, volatility: 0.0015, payout: 85, decimals: 2 },
  { symbol: 'TSLA-OTC', name: 'Tesla OTC',     basePrice: 172.80, volatility: 0.0025, payout: 85, decimals: 2 },
]

async function main() {
  console.log(`Seeding ${SEEDS.length} OTC assets…`)
  for (const s of SEEDS) {
    await prisma.otcAsset.upsert({
      where: { symbol: s.symbol },
      create: { ...s, trend: 0, status: 'ACTIVE' },
      update: {
        name: s.name,
        basePrice: s.basePrice,
        volatility: s.volatility,
        payout: s.payout,
        decimals: s.decimals,
        status: 'ACTIVE',
      },
    })
    console.log(`  ✓ ${s.symbol}`)
  }
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
