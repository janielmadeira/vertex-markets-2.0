import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'

// Endpoints de auditoria para validar Fase 5 (operacoes server-authoritative).
// Acesso restrito a admins.
export async function auditRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)
  app.addHook('preHandler', app.requireAdmin)

  // GET /admin/audit/operations/recent?limit=20
  // Retorna as N operacoes mais recentes com TODOS os campos de auditoria.
  app.get('/operations/recent', async (req) => {
    const { limit = '20' } = req.query as { limit?: string }
    const take = Math.min(parseInt(limit, 10) || 20, 100)

    const ops = await prisma.operation.findMany({
      orderBy: { openedAt: 'desc' },
      take,
      select: {
        id:               true,
        assetSymbol:      true,
        direction:        true,
        amount:           true,
        payout:           true,
        entryPrice:       true,
        exitPrice:        true,
        entryPriceSource: true,
        exitPriceSource:  true,
        auditHash:        true,
        status:           true,
        profit:           true,
        openedAt:         true,
        closedAt:         true,
      },
    })

    // Resumo agregado pra ver de relance a saude da Fase 5
    const summary = {
      total:           ops.length,
      serverEntry:     ops.filter(o => o.entryPriceSource === 'SERVER').length,
      serverExit:      ops.filter(o => o.exitPriceSource === 'SERVER').length,
      withAuditHash:   ops.filter(o => o.auditHash != null).length,
      stillOpen:       ops.filter(o => o.status === 'OPEN').length,
    }

    return { summary, operations: ops }
  })

  // GET /admin/audit/operations/:id/verify
  // Recalcula o hash da operacao e compara com o persistido.
  // Detecta adulteracao manual no banco.
  app.get('/operations/:id/verify', async (req, reply) => {
    const { id } = req.params as { id: string }
    const op = await prisma.operation.findUnique({ where: { id } })
    if (!op) return reply.status(404).send({ error: 'NOT_FOUND' })
    if (!op.auditHash || op.exitPrice == null || op.closedAt == null) {
      return reply.send({ id, status: 'PENDING', message: 'Operacao ainda nao foi encerrada' })
    }

    const { createHash } = await import('node:crypto')
    const payload = [
      op.id,
      Number(op.entryPrice).toFixed(8),
      Number(op.exitPrice).toFixed(8),
      op.openedAt.toISOString(),
      op.closedAt.toISOString(),
      op.direction,
      Number(op.amount).toFixed(2),
      String(op.payout),
    ].join('|')
    const recomputed = createHash('sha256').update(payload).digest('hex')

    return {
      id,
      persistedHash:  op.auditHash,
      recomputedHash: recomputed,
      match:          recomputed === op.auditHash,
      payload,
    }
  })
}
