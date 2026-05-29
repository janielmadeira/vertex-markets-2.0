import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente Supabase com service_role — ignora RLS. SOMENTE backend.
// Usado para publicar precos autoritativos em live_prices. Null-safe: se as
// envs nao estiverem configuradas, exporta null e os callers pulam a operacao
// (a API nao quebra).
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabaseAdmin: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null

if (!supabaseAdmin) {
  console.warn('[supabase-admin] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente — cliente admin desativado')
}
