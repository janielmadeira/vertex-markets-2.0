/**
 * BSPay API helpers compartilhados.
 *
 * Documentação oficial: https://www.bspay.co/docs (verifique endpoints
 * de cashout — variam conforme habilitação da conta).
 */

const BSPAY_BASE = 'https://api.bspay.co/v2'

const CLIENT_ID     = process.env.BSPAY_CLIENT_ID!
const CLIENT_SECRET = process.env.BSPAY_CLIENT_SECRET!

let tokenCache: { token: string; expiresAt: number } | null = null

export async function getBspayToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${BSPAY_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BSPay auth failed: ${text}`)
  }

  const data = await res.json()
  tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return tokenCache.token
}

// ---------------------------------------------------------------------------
// CASHOUT (PIX payout) — usado para pagar saques de usuários
// ---------------------------------------------------------------------------

export interface CashoutPayload {
  amount:        number          // R$, mesmo formato do cashin
  pixKey:        string
  pixKeyType:    'cpf' | 'cnpj' | 'email' | 'phone' | 'random'
  externalId:    string          // ID interno (vamos usar o withdrawal.id)
  postbackUrl?:  string          // BSPay chama quando o pagamento liquida
  payerName?:    string
}

export interface CashoutResponse {
  bspayPayoutId: string           // ID gerado pela BSPay
  status:        'pending' | 'completed' | 'failed' | string
  e2eId?:        string           // End-to-end ID do PIX (pra comprovante)
  raw:           any              // resposta completa pra debug
}

export async function bspayCashout(p: CashoutPayload): Promise<CashoutResponse> {
  const token = await getBspayToken()

  // Mapeamento de tipo de chave (BSPay usa códigos próprios — verifique a doc)
  const KEY_TYPE_MAP: Record<string, string> = {
    cpf:    'CPF',
    cnpj:   'CNPJ',
    email:  'EMAIL',
    phone:  'PHONE',
    random: 'EVP',     // Endereço Virtual de Pagamento (chave aleatória)
  }

  const body: any = {
    amount:      p.amount,
    currency:    'BRL',
    external_id: p.externalId,
    pix: {
      key:      p.pixKey,
      key_type: KEY_TYPE_MAP[p.pixKeyType] ?? p.pixKeyType.toUpperCase(),
    },
  }
  if (p.postbackUrl) body.postback_url = p.postbackUrl
  if (p.payerName)   body.payer_name   = p.payerName

  const res = await fetch(`${BSPAY_BASE}/transactions/cashout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const raw = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = raw?.message || raw?.error || JSON.stringify(raw)
    throw new Error(`BSPay cashout failed (${res.status}): ${msg}`)
  }

  return {
    bspayPayoutId: raw?.data?.id ?? raw?.data?.transaction_id ?? raw?.id ?? '',
    status:        raw?.data?.status ?? raw?.status ?? 'pending',
    e2eId:         raw?.data?.e2e_id ?? raw?.data?.end_to_end_id ?? raw?.e2e_id,
    raw,
  }
}
