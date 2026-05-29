import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BSPAY_BASE = 'https://api.bspay.co/v2'
const CLIENT_ID  = process.env.BSPAY_CLIENT_ID!
const CLIENT_SECRET = process.env.BSPAY_CLIENT_SECRET!
const WEBHOOK_SECRET = process.env.BSPAY_WEBHOOK_SECRET!
// BSPay tem allowlist de User-Agent — o valor precisa estar liberado no dashboard.
// Sem isso (fetch do Node manda 'node'), o BSPay rejeita com INVALID_CREDENTIALS.
const USER_AGENT = process.env.BSPAY_USER_AGENT ?? 'VertexMarkets/1.0'

let tokenCache: { token: string; expiresAt: number } | null = null

async function getBspayToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${BSPAY_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BSPay auth failed: ${text}`)
  }

  const data = await res.json()
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return tokenCache.token
}

export async function POST(req: NextRequest) {
  try {
    const { amount, userId, accountId } = await req.json()

    if (!amount || amount < 10) {
      return NextResponse.json({ error: 'Valor mínimo: R$10' }, { status: 400 })
    }
    if (!userId || !accountId) {
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 })
    }

    const externalId = `vtx_${userId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vertexmarkets.co'
    const postbackUrl = `${appUrl}/api/payments/pix/webhook?secret=${WEBHOOK_SECRET}`

    const token = await getBspayToken()

    const bspayRes = await fetch(`${BSPAY_BASE}/transactions/cashin`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        amount,
        currency: 'BRL',
        external_id: externalId,
        postback_url: postbackUrl,
      }),
    })

    if (!bspayRes.ok) {
      const text = await bspayRes.text()
      throw new Error(`BSPay cashin failed: ${text}`)
    }

    const bspayData = await bspayRes.json()
    const qrcode = bspayData?.data?.payment_info?.qrcode ?? bspayData?.data?.qrcode ?? null
    const bspayId = bspayData?.data?.id ?? bspayData?.data?.transaction_id ?? null

    // Salva depósito pendente no Supabase. PRECISA da service_role: o RLS de
    // deposits exige auth.uid() = user_id, e aqui nao ha sessao de usuario.
    // Sem a service_role, o insert e bloqueado silenciosamente.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[PIX create] SUPABASE_SERVICE_ROLE_KEY ausente — insert seria bloqueado pelo RLS')
      return NextResponse.json({ error: 'Configuração de pagamento incompleta (service role).' }, { status: 500 })
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { error: insErr } = await supabase.from('deposits').insert({
      user_id:     userId,
      account_id:  accountId,
      external_id: externalId,
      bspay_id:    bspayId,
      amount,
      status:      'pending',
      qrcode,
    })
    if (insErr) {
      console.error('[PIX create] falha ao gravar deposito:', insErr)
      return NextResponse.json({ error: 'Falha ao registrar depósito. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ externalId, qrcode, amount })
  } catch (err: any) {
    console.error('[PIX create]', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 })
  }
}
