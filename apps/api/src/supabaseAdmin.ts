import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'

// Cliente Supabase com service_role — ignora RLS. SOMENTE backend.
// Usado para publicar precos autoritativos em live_prices.
//
// Node 20 nao tem WebSocket global -> o supabase-js estoura ao iniciar o
// Realtime. Fornecemos 'ws' como transport. Alem disso, todo o createClient
// fica em try/catch: se falhar, supabaseAdmin = null e a API NAO quebra
// (publisher apenas nao roda).
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

let client: SupabaseClient | null = null

if (url && key) {
  try {
    client = createClient(url, key, {
      auth:     { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws as any },
    })
  } catch (err: any) {
    console.error('[supabase-admin] falha ao criar client:', err?.message ?? err)
  }
} else {
  console.warn('[supabase-admin] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente — desativado')
}

export const supabaseAdmin = client
