import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Pares OTC server-authoritative ativos. Cripto majors (BTC/ETH/SOL/XRP/DOGE)
// usam feed real da Binance via marketSymbols.ts, entao nao precisam estar aqui
// (timer desperdicaria CPU).
const SEEDS = [
  // Forex (sem fonte real cobrindo bem -> OTC engine eh a escolha)
  { symbol: 'USDBRL-OTC', name: 'USD/BRL OTC', basePrice: 5.74200,  volatility: 0.0008, payout: 85, decimals: 5 },
  { symbol: 'USDCHF-OTC', name: 'USD/CHF OTC', basePrice: 0.89710,  volatility: 0.0006, payout: 85, decimals: 5 },
  { symbol: 'EURAUD-OTC', name: 'EUR/AUD OTC', basePrice: 1.64230,  volatility: 0.0007, payout: 85, decimals: 5 },
  // Acoes
  { symbol: 'AAPL-OTC', name: 'Apple Inc OTC', basePrice: 189.21, volatility: 0.0015, payout: 85, decimals: 2 },
  { symbol: 'TSLA-OTC', name: 'Tesla OTC',     basePrice: 172.80, volatility: 0.0025, payout: 85, decimals: 2 },
]

// Symbols que existiam em seed anterior mas viraram dormentes -> desativa
// (mantem dados historicos no banco mas para o engine de gastar CPU com elas).
const DEPRECATED = ['BTCUSD-OTC', 'ETHUSD-OTC', 'SOLUSD-OTC', 'XRPUSD-OTC', 'DOGEUSD-OTC']

async function main() {
  console.log(`Seeding ${SEEDS.length} OTC assets...`)
  for (const s of SEEDS) {
    await prisma.otcAsset.upsert({
      where: { symbol: s.symbol },
      create: { ...s, trend: 0, status: 'ACTIVE' },
      update: {
        name: s.name, basePrice: s.basePrice, volatility: s.volatility,
        payout: s.payout, decimals: s.decimals, status: 'ACTIVE',
      },
    })
    console.log(`  ok ${s.symbol}`)
  }

  console.log(`Deactivating ${DEPRECATED.length} dormant assets...`)
  for (const symbol of DEPRECATED) {
    const existing = await prisma.otcAsset.findUnique({ where: { symbol } })
    if (existing && existing.status === 'ACTIVE') {
      await prisma.otcAsset.update({ where: { symbol }, data: { status: 'INACTIVE' } })
      console.log(`  -> ${symbol} INACTIVE`)
    }
  }

  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
