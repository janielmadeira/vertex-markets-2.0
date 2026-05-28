import type { FastifyInstance } from 'fastify'
import { verifyWebhookSignature } from '../wallet/bspay-client.js'
import { confirmDepositPaid, markDepositFailed, confirmWithdrawalPaid, markWithdrawalPayoutFailed } from '../wallet/service.js'

// Janela anti-replay para o X-Webhook-Timestamp (segundos).
const TIMESTAMP_TOLERANCE_S = 5 * 60

// Webhook do BSPay. Precisa do CORPO BRUTO pra validar o HMAC (nao pode reserializar
// o JSON, pois espacos/ordem mudam o hash). O content-type parser abaixo e
// encapsulado neste plugin (nao afeta o resto da API) e guarda o raw em req.rawBody.
export async function bspayWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as any).rawBody = body
    try {
      done(null, body ? JSON.parse(body as string) : {})
    } catch {
      done(null, {})
    }
  })

  // POST /webhooks/bspay
  app.post('/bspay', async (req, reply) => {
    const rawBody   = (req as any).rawBody as string | undefined
    const signature = req.headers['x-webhook-signature'] as string | undefined
    const tsHeader  = req.headers['x-webhook-timestamp'] as string | undefined

    if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
      req.log.warn('[webhook/bspay] assinatura invalida')
      return reply.status(401).send({ error: 'INVALID_SIGNATURE' })
    }

    // Anti-replay: rejeita timestamps fora da janela de +-5min.
    if (tsHeader) {
      const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(tsHeader))
      if (!Number.isFinite(skew) || skew > TIMESTAMP_TOLERANCE_S) {
        req.log.warn({ tsHeader }, '[webhook/bspay] timestamp fora da janela')
        return reply.status(401).send({ error: 'STALE_TIMESTAMP' })
      }
    }

    const payload    = req.body as any
    const event      = String(payload.event ?? '').toLowerCase()
    const data       = payload.data ?? {}
    const status     = String(data.status ?? '').toLowerCase()
    const externalId = data.external_id ?? undefined
    const bspayId    = data.transaction_id ?? payload.transaction_id ?? undefined

    try {
      if (event === 'cashin.confirmed' || (event.startsWith('cashin') && status === 'confirmed')) {
        await confirmDepositPaid({ externalId, bspayId })
      } else if (event.startsWith('cashin') && (status === 'failed' || status === 'expired' || status === 'cancelled')) {
        await markDepositFailed({ externalId, bspayId })
      } else if (event === 'cashout.confirmed' || (event.startsWith('cashout') && status === 'confirmed')) {
        // external_id do cashout == withdrawal.id (setado em approveWithdrawal)
        if (externalId) await confirmWithdrawalPaid(String(externalId))
      } else if (event === 'cashout.failed' || (event.startsWith('cashout') && status === 'failed')) {
        if (externalId) await markWithdrawalPayoutFailed(String(externalId), String(data.error ?? data.error_code ?? 'failed'))
      }
    } catch (err: any) {
      // Loga mas responde 200: evento aceito. Evita reentrega infinita do BSPay
      // por erro nosso (DEPOSIT_NOT_FOUND etc). Reprocessamento manual se preciso.
      req.log.error({ err: err.message, event, externalId, bspayId }, '[webhook/bspay] erro ao processar')
    }

    return reply.send({ received: true })
  })
}
