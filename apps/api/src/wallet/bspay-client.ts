import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTE BSPay — único arquivo que conhece o "fio" da API do BSPay.
// Baseado na doc oficial: https://dev.bspay.co
//   - Base URL producao: https://api.bspay.co
//   - Auth: POST /v2/oauth/token (Basic base64(client_id:client_secret))
//   - Cash-in:  POST /v2/transactions/cashin   (sem assinatura de request)
//   - Cash-out: POST /v2/transactions/cashout  (COM assinatura X-Signature)
//   - Webhook:  header X-Webhook-Signature = hex(hmac_sha256(rawBody, webhook_secret))
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL       = process.env.BSPAY_BASE_URL       ?? 'https://api.bspay.co'
const CLIENT_ID      = process.env.BSPAY_CLIENT_ID      ?? ''
const CLIENT_SECRET  = process.env.BSPAY_CLIENT_SECRET  ?? ''
const SIGNING_KEY    = process.env.BSPAY_SIGNING_KEY    ?? ''  // assina cash-out
const WEBHOOK_SECRET = process.env.BSPAY_WEBHOOK_SECRET ?? ''  // valida webhooks
const POSTBACK_URL   = process.env.BSPAY_POSTBACK_URL   ?? ''  // URL que recebe os webhooks

// User-Agent fixo: o BSPay tem allowlist de User-Agent. Manter este valor
// liberado no dashboard. (fetch do Node manda 'node' por padrao, nao previsivel.)
const USER_AGENT = process.env.BSPAY_USER_AGENT ?? 'VertexMarkets/1.0'

function assertConfigured() {
  if (!BASE_URL || !CLIENT_ID || !CLIENT_SECRET) throw new Error('BSPAY_NOT_CONFIGURED')
}

// ── Autenticacao (OAuth2 client_credentials via Basic Auth) ──────────────────
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  assertConfigured()
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${BASE_URL}/v2/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${basic}`, 'User-Agent': USER_AGENT },
    body:    JSON.stringify({ grant_type: 'client_credentials' }),
  })
  if (!res.ok) throw new Error(`BSPAY_AUTH_FAILED_${res.status}`)

  const data = (await res.json()) as { access_token: string; expires_in?: number }
  cachedToken = {
    value:     data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

// ── Cash-in: gerar cobranca Pix (sem assinatura de request) ──────────────────
export interface PixChargeResult {
  bspayId: string   // data.transaction_id -> deposits.bspay_id
  qrcode:  string   // data.payment_info.qrcode (EMV copia-e-cola) -> deposits.qrcode
}

export async function createPixCharge(params: {
  externalId: string
  amount:     number
  payerName?: string
  payerDoc?:  string
}): Promise<PixChargeResult> {
  const token = await getAccessToken()

  const body: Record<string, unknown> = {
    amount:      params.amount,
    currency:    'BRL',
    external_id: params.externalId,
  }
  if (POSTBACK_URL) body.postback_url = POSTBACK_URL
  if (params.payerName || params.payerDoc) {
    body.payer = { name: params.payerName, document: params.payerDoc }
  }

  const res = await fetch(`${BASE_URL}/v2/transactions/cashin`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'User-Agent': USER_AGENT },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`BSPAY_CHARGE_FAILED_${res.status}`)

  const json = (await res.json()) as any
  const data = json.data ?? json
  return {
    bspayId: String(data.transaction_id ?? ''),
    qrcode:  String(data.payment_info?.qrcode ?? ''),
  }
}

// ── Cash-out: payout Pix (COM assinatura de request) ─────────────────────────
// X-Signature = hex(hmac_sha256(`${ts}.${nonce}.${rawBody}`, SIGNING_KEY))
// CRITICO: assinar o MESMO string de corpo que vai no fetch (sem re-serializar).
export interface PixPayoutResult {
  payoutId: string   // data.transaction_id -> withdrawals.bspay_payout_id
}

export async function createPixPayout(params: {
  externalId: string
  amount:     number
  pixKeyType: string
  pixKey:     string
  name?:      string
}): Promise<PixPayoutResult> {
  const token = await getAccessToken()
  if (!SIGNING_KEY) throw new Error('BSPAY_SIGNING_KEY_MISSING')

  const payload: Record<string, unknown> = {
    external_id: params.externalId,
    amount:      params.amount,
    currency:    'BRL',
    key:         params.pixKey,
    key_type:    params.pixKeyType,
  }
  if (params.name)   payload.name = params.name
  if (POSTBACK_URL)  payload.postback_url = POSTBACK_URL

  const rawBody   = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce     = randomUUID()
  const signature = createHmac('sha256', SIGNING_KEY)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest('hex')

  const res = await fetch(`${BASE_URL}/v2/transactions/cashout`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      'User-Agent':    USER_AGENT,
      'X-Signature':   signature,
      'X-Timestamp':   timestamp,
      'X-Nonce':       nonce,
    },
    body: rawBody,
  })
  if (!res.ok) throw new Error(`BSPAY_PAYOUT_FAILED_${res.status}`)

  const json = (await res.json()) as any
  const data = json.data ?? json
  return { payoutId: String(data.transaction_id ?? '') }
}

// ── Webhook: validacao de assinatura ─────────────────────────────────────────
// X-Webhook-Signature = hex(hmac_sha256(corpo_bruto, WEBHOOK_SECRET)).
// Sempre sobre o corpo BRUTO (nunca reserializado).
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!WEBHOOK_SECRET || !signature) return false
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
