import { createHmac, timingSafeEqual } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTE BSPay — ÚNICO arquivo que conhece o "fio" da API do BSPay.
//
// >>> PONTOS A CONFIRMAR NA DOC (bspaybr.com/dev) — marcados com TODO(doc): <<<
//   - URL base (sandbox vs producao)
//   - endpoint/forma de autenticacao (token OAuth ou client_id/secret direto)
//   - caminho e corpo do cash-in (cobranca Pix) e quais campos voltam (id, qrcode)
//   - caminho e corpo do cash-out (payout Pix)
//   - nome do header de assinatura do webhook e como o HMAC e calculado
//
// Tudo que esta fora deste arquivo (rotas, saldo, idempotencia) ja esta correto e
// nao muda quando a doc chegar — so os detalhes daqui.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL       = process.env.BSPAY_BASE_URL       ?? ''
const CLIENT_ID      = process.env.BSPAY_CLIENT_ID      ?? ''
const CLIENT_SECRET  = process.env.BSPAY_CLIENT_SECRET  ?? ''
const WEBHOOK_SECRET = process.env.BSPAY_WEBHOOK_SECRET ?? ''

function assertConfigured() {
  if (!BASE_URL || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('BSPAY_NOT_CONFIGURED')
  }
}

// ── Autenticacao ─────────────────────────────────────────────────────────────
// BSPay usa client_id/client_secret. A doc indica OAuth2; cacheamos o token.
// TODO(doc): confirmar o endpoint de token e o shape da resposta.
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  assertConfigured()
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value
  }

  // TODO(doc): ajustar path / corpo conforme a doc do BSPay.
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  if (!res.ok) throw new Error(`BSPAY_AUTH_FAILED_${res.status}`)

  const data = (await res.json()) as { access_token: string; expires_in?: number }
  cachedToken = {
    value:     data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

async function authedFetch(path: string, init: RequestInit) {
  const token = await getAccessToken()
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
}

// ── Cash-in: gerar cobranca Pix ──────────────────────────────────────────────
export interface PixChargeResult {
  bspayId: string   // id da cobranca no BSPay (vai pra deposits.bspay_id)
  qrcode:  string   // payload copia-e-cola / EMV (vai pra deposits.qrcode)
}

export async function createPixCharge(params: {
  externalId: string   // nosso id idempotente (deposits.external_id)
  amount:     number    // em reais
  payerName?: string
  payerDoc?:  string    // CPF/CNPJ do pagador, se a doc exigir
}): Promise<PixChargeResult> {
  // TODO(doc): ajustar path e campos do corpo/resposta conforme a doc.
  const res = await authedFetch('/v1/pix/qrcode', {
    method: 'POST',
    body: JSON.stringify({
      external_id: params.externalId,
      amount:      params.amount,
      payer: params.payerName || params.payerDoc
        ? { name: params.payerName, document: params.payerDoc }
        : undefined,
    }),
  })
  if (!res.ok) throw new Error(`BSPAY_CHARGE_FAILED_${res.status}`)

  const data = (await res.json()) as any
  // TODO(doc): mapear os nomes reais dos campos de resposta.
  return {
    bspayId: String(data.id ?? data.transaction_id ?? ''),
    qrcode:  String(data.qrcode ?? data.emv ?? data.copy_paste ?? ''),
  }
}

// ── Cash-out: payout Pix ──────────────────────────────────────────────────────
export interface PixPayoutResult {
  payoutId: string   // vai pra withdrawals.bspay_payout_id
}

export async function createPixPayout(params: {
  externalId: string
  amount:     number
  pixKeyType: string
  pixKey:     string
}): Promise<PixPayoutResult> {
  // TODO(doc): ajustar path e campos conforme a doc.
  const res = await authedFetch('/v1/pix/payment', {
    method: 'POST',
    body: JSON.stringify({
      external_id:  params.externalId,
      amount:       params.amount,
      pix_key_type: params.pixKeyType,
      pix_key:      params.pixKey,
    }),
  })
  if (!res.ok) throw new Error(`BSPAY_PAYOUT_FAILED_${res.status}`)

  const data = (await res.json()) as any
  return { payoutId: String(data.id ?? data.transaction_id ?? '') }
}

// ── Webhook: validacao de assinatura ─────────────────────────────────────────
// X-SIGNATURE = HMAC-SHA256(corpo_bruto, WEBHOOK_SECRET) em hex.
// Validamos sobre o corpo BRUTO (string), nunca sobre o objeto reserializado.
// TODO(doc): confirmar header exato e encoding (hex vs base64).
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!WEBHOOK_SECRET || !signature) return false
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
