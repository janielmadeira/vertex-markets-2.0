import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface Account {
  id:       string
  type:     'DEMO' | 'REAL'
  balance:  string
  currency: string
}

export interface User {
  id:        string
  name:      string
  email:     string
  kycStatus: string
  accounts:  Account[]
}

interface AuthState {
  user:     User | null
  token:    string | null
  isDemo:   boolean
  loading:  boolean

  login:           (email: string, password: string) => Promise<void>
  register:        (name: string, email: string, password: string) => Promise<void>
  logout:          () => Promise<void>
  init:            () => Promise<void>
  setIsDemo:       (v: boolean) => void
  refreshAccounts: () => Promise<void>
  resetDemo:       () => Promise<void>
}

async function fetchAccounts(userId: string): Promise<Account[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, type, balance, currency')
    .eq('user_id', userId)
  return (data ?? []).map(a => ({ ...a, balance: String(a.balance) }))
}

async function buildUser(supabaseUser: any, accounts: Account[]): Promise<User> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, kyc_status')
    .eq('id', supabaseUser.id)
    .single()

  return {
    id:        supabaseUser.id,
    name:      profile?.name ?? supabaseUser.email?.split('@')[0] ?? '',
    email:     supabaseUser.email ?? '',
    kycStatus: profile?.kyc_status ?? 'pending',
    accounts,
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:    null,
  token:   null,
  isDemo:  true,
  loading: true,

  setIsDemo: (v) => set({ isDemo: v }),

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const accounts = await fetchAccounts(data.user.id)
    const user = await buildUser(data.user, accounts)
    set({ user, token: data.session.access_token })
  },

  register: async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) throw error
    if (!data.session) throw new Error('EMAIL_CONFIRMATION_REQUIRED')
    const accounts = await fetchAccounts(data.user!.id)
    const user = await buildUser(data.user!, accounts)
    set({ user, token: data.session.access_token })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, token: null })
  },

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { set({ loading: false }); return }
    const accounts = await fetchAccounts(session.user.id)
    const user = await buildUser(session.user, accounts)
    set({ user, token: session.access_token, loading: false })

    // Mantém sessão sincronizada automaticamente
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) set({ token: session.access_token })
      else set({ user: null, token: null })
    })
  },

  refreshAccounts: async () => {
    const user = get().user
    if (!user) return
    const accounts = await fetchAccounts(user.id)
    set({ user: { ...user, accounts } })
  },

  resetDemo: async () => {
    await supabase.rpc('reset_demo_account')
    await get().refreshAccounts()
  },
}))

export function useCurrentAccount(state: AuthState) {
  const accounts = state.user?.accounts ?? []
  return state.isDemo
    ? accounts.find(a => a.type === 'DEMO')
    : accounts.find(a => a.type === 'REAL')
}
