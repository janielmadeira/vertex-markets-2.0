import 'dotenv/config'
import { buildApp } from './app.js'
import { startOtcEngine } from './market-data/otc/engine.js'
import { initOtcHub } from './market-data/otc/ws-hub.js'
import { startOrphanSweeper } from './operations/service.js'

const PORT = parseInt(process.env.PORT ?? '3001', 10)

async function start() {
  const app = await buildApp()
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`\n🚀 API rodando em http://localhost:${PORT}`)
    console.log(`   Health: http://localhost:${PORT}/health\n`)

    await initOtcHub()

    if (process.env.OTC_ENGINE_ENABLED !== 'false') {
      await startOtcEngine()
    } else {
      console.log('[otc-engine] disabled via OTC_ENGINE_ENABLED=false')
    }

    // Liquida operacoes que ficaram OPEN com expires_at no passado.
    // Necessario porque setTimeout em memoria eh perdido em restart de container.
    startOrphanSweeper()
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
