import 'dotenv/config'
import { buildApp } from './app.js'

const PORT = parseInt(process.env.PORT ?? '3001', 10)

async function start() {
  const app = await buildApp()
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`\n🚀 API rodando em http://localhost:${PORT}`)
    console.log(`   Health: http://localhost:${PORT}/health\n`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
