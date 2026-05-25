import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import { authRoutes } from './auth/routes.js'
import { operationRoutes } from './operations/routes.js'
import { accountRoutes } from './accounts/routes.js'
import { otcAdminRoutes, otcPublicRoutes } from './market-data/otc/routes.js'
import { otcWsRoutes } from './market-data/otc/ws-routes.js'
import { auditRoutes } from './admin/audit.js'
import { prisma } from './prisma.js'

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' } })

  // ── Plugins ───────────────────────────────────────────────────────────────
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.FRONTEND_URL ?? '').split(',').map(o => o.trim()).filter(Boolean),
  ]
  // Aceita qualquer subdomínio .easypanel.host (proxy reverso pode bater em vários hostnames)
  function isOriginAllowed(origin: string): boolean {
    if (allowedOrigins.some(o => origin.startsWith(o))) return true
    try {
      const host = new URL(origin).hostname
      if (host.endsWith('.easypanel.host')) return true
    } catch { /* origin malformado */ }
    return false
  }
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || isOriginAllowed(origin)) return cb(null, true)
      app.log.warn({ origin }, 'CORS rejected origin')
      cb(new Error('Not allowed by CORS'), false)
    },
    credentials: true,
  })

  await app.register(cookie)
  await app.register(websocket)

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  })

  // ── Auth decorator ─────────────────────────────────────────────────────────
  app.decorate('authenticate', async (req: any, reply: any) => {
    try {
      await req.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'UNAUTHORIZED' })
    }
  })

  // ── Admin guard ───────────────────────────────────────────────────────────
  app.decorate('requireAdmin', async (req: any, reply: any) => {
    const sub = req.user?.sub as string | undefined
    if (!sub) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const user = await prisma.user.findUnique({ where: { id: sub }, select: { role: true } })
    if (!user || user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'FORBIDDEN' })
    }
  })

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(authRoutes,       { prefix: '/auth' })
  await app.register(operationRoutes,  { prefix: '/operations' })
  await app.register(accountRoutes,    { prefix: '/accounts' })
  await app.register(otcPublicRoutes,  { prefix: '/market-data/otc' })
  await app.register(otcAdminRoutes,   { prefix: '/admin/otc' })
  await app.register(auditRoutes,      { prefix: '/admin/audit' })
  await app.register(otcWsRoutes,      { prefix: '/ws' })

  return app
}
