import type { FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>
    requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void>
  }
}
