import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WEBHOOK_SECRET = process.env.BSPAY_WEBHOOK_SECRET!

export async function POST(req: NextRequest) {
  // Verifica segredo no query string
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()

    // BSPay envia event = "cashin.confirmed"
    const event      = body?.event ?? body?.type ?? body?.status
    const externalId = body?.external_id ?? body?.data?.external_id

    if (!externalId) {
      return NextResponse.json({ error: 'external_id missing' }, { status: 400 })
    }

    const isConfirmed = (
      event === 'cashin.confirmed' ||
      event === 'confirmed'        ||
      body?.data?.status === 'confirmed'
    )

    if (!isConfirmed) {
      // Outros eventos (pending, failed) — apenas acusa recebimento
      return NextResponse.json({ ok: true })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const { error } = await supabase.rpc('confirm_deposit', { p_external_id: externalId })
    if (error) {
      console.error('[PIX webhook] confirm_deposit error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[PIX webhook] deposit confirmed: ${externalId}`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[PIX webhook]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
