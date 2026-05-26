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
  function isOriginAllowed(origin: string): boolean {
    if (allowedOrigins.some(o => origin.startsWith(o))) return true
    try {
      const host = new URL(origin).hostname
      if (host.endsWith('.easypanel.host')) return true
      if (host.endsWith('.vercel.app'))     return true
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

  // JWT: agora valida tokens emitidos pelo Supabase Auth.
  // SUPABASE_JWT_SECRET vem do painel Supabase > Settings > API > JWT Secret.
  const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('SUPABASE_JWT_SECRET (ou JWT_SECRET) precisa estar no .env')
  await app.register(jwt, {
    secret: jwtSecret,
    verify: { algorithms: ['HS256'] },
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
  // Admin agora vive na tabela public.admin_users (FK p/ auth.users.id).
  // Existencia da linha = admin. Coluna 'role' distingue admin vs super_admin.
  app.decorate('requireAdmin', async (req: any, reply: any) => {
    const sub = req.user?.sub as string | undefined
    if (!sub) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const admin = await prisma.adminUser.findUnique({ where: { userId: sub } })
    if (!admin) return reply.status(403).send({ error: 'FORBIDDEN' })
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
