import type { FastifyInstance } from 'fastify'
import { verifyWebhookSignature } from '../wallet/bspay-client.js'
import { confirmDepositPaid, markDepositFailed, confirmWithdrawalPaid } from '../wallet/service.js'

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
    const rawBody = (req as any).rawBody as string | undefined
    // TODO(doc): confirmar o nome exato do header de assinatura.
    const signature =
      (req.headers['x-signature'] as string | undefined) ??
      (req.headers['x-webhook-signature'] as string | undefined)

    if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
      req.log.warn('[webhook/bspay] assinatura invalida')
      return reply.status(401).send({ error: 'INVALID_SIGNATURE' })
    }

    const payload = req.body as any
    // TODO(doc): mapear os nomes reais de tipo de evento, status e ids.
    const event  = String(payload.event ?? payload.type ?? '').toLowerCase()
    const status = String(payload.status ?? payload.data?.status ?? '').toLowerCase()
    const externalId = payload.external_id ?? payload.data?.external_id
    const bspayId    = payload.id ?? payload.transaction_id ?? payload.data?.id

    try {
      // Pagamento de deposito confirmado
      if (event.includes('cashin') || event.includes('deposit') || event.includes('charge') ||
          (!event && (status === 'paid' || status === 'completed' || status === 'approved'))) {
        if (status === 'paid' || status === 'completed' || status === 'approved' || status === 'confirmed') {
          await confirmDepositPaid({ externalId, bspayId })
        } else if (status === 'failed' || status === 'expired' || status === 'cancelled') {
          await markDepositFailed({ externalId, bspayId })
        }
      }
      // Payout (saque) confirmado — externalId aqui e o withdrawal.id (setado em approveWithdrawal)
      else if (event.includes('cashout') || event.includes('payout') || event.includes('withdraw')) {
        if (status === 'paid' || status === 'completed' || status === 'confirmed') {
          if (externalId) await confirmWithdrawalPaid(String(externalId))
        }
      }
    } catch (err: any) {
      // Loga mas responde 200: o evento foi aceito. Reprocessamento manual se preciso.
      // (DEPOSIT_NOT_FOUND etc nao deve fazer o BSPay reentregar infinitamente.)
      req.log.error({ err: err.message, externalId, bspayId }, '[webhook/bspay] erro ao processar')
    }

    return reply.send({ received: true })
  })
}
