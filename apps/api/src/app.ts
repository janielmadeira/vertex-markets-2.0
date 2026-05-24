import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { authRoutes } from './auth/routes.js'
import { operationRoutes } from './operations/routes.js'
import { accountRoutes } from './accounts/routes.js'
import { otcAdminRoutes, otcPublicRoutes } from './market-data/otc/routes.js'
import { prisma } from './prisma.js'

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' } })

  // ── Plugins ───────────────────────────────────────────────────────────────
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.FRONTEND_URL ?? '').split(',').map(o => o.trim()).filter(Boolean),
  ]
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true)
      cb(new Error('Not allowed by CORS'), false)
    },
    credentials: true,
  })

  await app.register(cookie)

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

  return app
}
