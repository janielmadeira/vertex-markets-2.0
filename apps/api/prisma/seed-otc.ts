import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SEEDS = [
  { symbol: 'USDBRL-OTC', name: 'USD/BRL OTC', basePrice: 5.20000, volatility: 0.0008, payout: 85, decimals: 5 },
  { symbol: 'EURUSD-OTC', name: 'EUR/USD OTC', basePrice: 1.08500, volatility: 0.0006, payout: 87, decimals: 5 },
  { symbol: 'GBPUSD-OTC', name: 'GBP/USD OTC', basePrice: 1.26500, volatility: 0.0007, payout: 86, decimals: 5 },
  { symbol: 'USDJPY-OTC', name: 'USD/JPY OTC', basePrice: 150.250, volatility: 0.0009, payout: 85, decimals: 3 },
  { symbol: 'BTCUSD-OTC', name: 'BTC/USD OTC', basePrice: 68000.00, volatility: 0.0030, payout: 80, decimals: 2 },
]

async function main() {
  console.log('Seeding OTC assets…')
  for (const s of SEEDS) {
    const existing = await prisma.otcAsset.findUnique({ where: { symbol: s.symbol } })
    if (existing) { console.log(`  - ${s.symbol} já existe, pulando`); continue }
    await prisma.otcAsset.create({ data: { ...s, trend: 0, status: 'ACTIVE' } })
    console.log(`  ✓ ${s.symbol}`)
  }
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
