import type { FastifyInstance } from 'fastify'
import { registerSchema, loginSchema } from './schema.js'
import { registerUser, loginUser, getUserById } from './service.js'

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/register
  app.post('/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }

    try {
      const user = await registerUser(parsed.data)
      const token = app.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' }
      )
      const refreshToken = app.jwt.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '7d' }
      )

      reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', path: '/auth/refresh', maxAge: 60 * 60 * 24 * 7,
      })

      return reply.status(201).send({ user, token })
    } catch (err: any) {
      if (err.message === 'EMAIL_TAKEN') {
        return reply.status(409).send({ error: 'EMAIL_TAKEN', message: 'Este email já está em uso.' })
      }
      throw err
    }
  })

  // POST /auth/login
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }

    try {
      const user = await loginUser(parsed.data)
      const token = app.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' }
      )
      const refreshToken = app.jwt.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '7d' }
      )

      reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', path: '/auth/refresh', maxAge: 60 * 60 * 24 * 7,
      })

      return reply.send({ user, token })
    } catch (err: any) {
      if (err.message === 'INVALID_CREDENTIALS') {
        return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Email ou senha incorretos.' })
      }
      throw err
    }
  })

  // POST /auth/refresh
  app.post('/refresh', async (req, reply) => {
    const refreshToken = req.cookies?.refresh_token
    if (!refreshToken) return reply.status(401).send({ error: 'NO_REFRESH_TOKEN' })

    try {
      const payload = app.jwt.verify<{ sub: string; type: string }>(refreshToken)
      if (payload.type !== 'refresh') return reply.status(401).send({ error: 'INVALID_TOKEN' })

      const user = await getUserById(payload.sub)
      const token = app.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' }
      )
      return reply.send({ token })
    } catch {
      return reply.status(401).send({ error: 'EXPIRED_TOKEN' })
    }
  })

  // GET /auth/me  (protected)
  app.get('/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const payload = req.user as { sub: string }
    try {
      const user = await getUserById(payload.sub)
      return reply.send({ user })
    } catch {
      return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    }
  })

  // POST /auth/logout
  app.post('/logout', async (_req, reply) => {
    reply.clearCookie('refresh_token', { path: '/auth/refresh' })
    return reply.send({ ok: true })
  })
}
