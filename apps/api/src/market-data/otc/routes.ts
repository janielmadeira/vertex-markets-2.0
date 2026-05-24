import type { FastifyInstance } from 'fastify'
import { createOtcAssetSchema, updateOtcAssetSchema } from './schema.js'
import {
  listOtcAssets, getOtcAsset, createOtcAsset,
  updateOtcAsset, deleteOtcAsset, toggleOtcAsset,
} from './service.js'

export async function otcAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)
  app.addHook('preHandler', app.requireAdmin)

  app.get('/', async () => ({ assets: await listOtcAssets() }))

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try { return { asset: await getOtcAsset(id) } }
    catch { return reply.status(404).send({ error: 'NOT_FOUND' }) }
  })

  app.post('/', async (req, reply) => {
    const parsed = createOtcAssetSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    try {
      const asset = await createOtcAsset(parsed.data)
      return reply.status(201).send({ asset })
    } catch (err: any) {
      if (err.message === 'SYMBOL_ALREADY_EXISTS') return reply.status(409).send({ error: 'SYMBOL_ALREADY_EXISTS' })
      throw err
    }
  })

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateOtcAssetSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    try { return { asset: await updateOtcAsset(id, parsed.data) } }
    catch { return reply.status(404).send({ error: 'NOT_FOUND' }) }
  })

  app.post('/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string }
    try { return { asset: await toggleOtcAsset(id) } }
    catch { return reply.status(404).send({ error: 'NOT_FOUND' }) }
  })

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try { return await deleteOtcAsset(id) }
    catch { return reply.status(404).send({ error: 'NOT_FOUND' }) }
  })
}

export async function otcPublicRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const assets = await listOtcAssets()
    return {
      assets: assets
        .filter(a => a.status === 'ACTIVE')
        .map(a => ({
          id: a.id, symbol: a.symbol, name: a.name,
          payout: a.payout, decimals: a.decimals,
        })),
    }
  })
}
