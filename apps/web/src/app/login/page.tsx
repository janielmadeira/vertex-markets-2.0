'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const router = useRouter()
  const login    = useAuthStore(s => s.login)
  const register = useAuthStore(s => s.register)

  // Login state
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  // Register state
  const [rName,     setRName]     = useState('')
  const [rEmail,    setREmail]    = useState('')
  const [rPassword, setRPassword] = useState('')
  const [showRPass, setShowRPass] = useState(false)

  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.replace('/')
    } catch (err: any) {
      const code = err.response?.data?.error
      setError(code === 'INVALID_CREDENTIALS' ? 'Email ou senha incorretos.' : 'Erro ao entrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (rPassword.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return }
    setLoading(true)
    try {
      await register(rName, rEmail, rPassword)
      router.replace('/')
    } catch (err: any) {
      const code = err.response?.data?.error
      setError(code === 'EMAIL_TAKEN' ? 'Este email já está em uso.' : 'Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#0e1120] flex items-center justify-center overflow-hidden">

      {/* Background chart wave */}
      <div className="absolute inset-0 pointer-events-none">
        <svg viewBox="0 0 1440 400" preserveAspectRatio="none" className="w-full h-full opacity-20">
          <defs>
            <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,200 C120,160 180,240 300,200 C420,160 480,100 600,140 C720,180 780,260 900,220 C1020,180 1080,120 1200,160 C1320,200 1380,240 1440,200 L1440,400 L0,400 Z"
            fill="url(#waveGrad)"
          />
          <path
            d="M0,200 C120,160 180,240 300,200 C420,160 480,100 600,140 C720,180 780,260 900,220 C1020,180 1080,120 1200,160 C1320,200 1380,240 1440,200"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            opacity="0.6"
          />
        </svg>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">

        {/* Logo */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">Vertex Markets</h1>
        </div>

        <div className="bg-[#1a1f35] rounded-2xl overflow-hidden shadow-2xl border border-white/5">

          {/* Tabs */}
          <div className="flex">
            <button
              onClick={() => { setTab('login'); setError('') }}
              className={`flex-1 py-4 text-sm font-bold transition-colors ${
                tab === 'login'
                  ? 'bg-[#1a1f35] text-white border-b-2 border-blue-500'
                  : 'bg-[#141828] text-[#8b8f9a] hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => { setTab('register'); setError('') }}
              className={`flex-1 py-4 text-sm font-bold transition-colors ${
                tab === 'register'
                  ? 'bg-[#1a1f35] text-white border-b-2 border-blue-500'
                  : 'bg-[#141828] text-[#8b8f9a] hover:text-white'
              }`}
            >
              Cadastro
            </button>
          </div>

          <div className="p-8">
            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="relative">
                  <label className="absolute -top-2.5 left-3 px-1 text-xs text-[#8b8f9a] bg-[#1a1f35]">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full bg-transparent border border-[#2a2e4a] rounded-lg px-4 py-3.5 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="relative">
                  <label className="absolute -top-2.5 left-3 px-1 text-xs text-[#8b8f9a] bg-[#1a1f35]">Senha</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full bg-transparent border border-[#2a2e4a] rounded-lg px-4 py-3.5 pr-12 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8f9a] hover:text-white transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showPass
                        ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                      }
                    </svg>
                  </button>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-[#8b8f9a] cursor-pointer">
                    <input type="checkbox" className="accent-blue-500 w-4 h-4" />
                    Lembrar-me
                  </label>
                  <button type="button" className="text-blue-400 hover:text-blue-300 transition-colors">
                    Esqueceu sua senha?
                  </button>
                </div>

                {error && <p className="text-red-400 text-xs text-center">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                >
                  {loading ? 'Entrando...' : (
                    <>
                      Entrar
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="flex flex-col gap-4">
                <div className="relative">
                  <label className="absolute -top-2.5 left-3 px-1 text-xs text-[#8b8f9a] bg-[#1a1f35]">Nome</label>
                  <input
                    type="text"
                    value={rName}
                    onChange={e => setRName(e.target.value)}
                    required
                    className="w-full bg-transparent border border-[#2a2e4a] rounded-lg px-4 py-3.5 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="relative">
                  <label className="absolute -top-2.5 left-3 px-1 text-xs text-[#8b8f9a] bg-[#1a1f35]">E-mail</label>
                  <input
                    type="email"
                    value={rEmail}
                    onChange={e => setREmail(e.target.value)}
                    required
                    className="w-full bg-transparent border border-[#2a2e4a] rounded-lg px-4 py-3.5 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="relative">
                  <label className="absolute -top-2.5 left-3 px-1 text-xs text-[#8b8f9a] bg-[#1a1f35]">Senha</label>
                  <input
                    type={showRPass ? 'text' : 'password'}
                    value={rPassword}
                    onChange={e => setRPassword(e.target.value)}
                    required
                    className="w-full bg-transparent border border-[#2a2e4a] rounded-lg px-4 py-3.5 pr-12 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8f9a] hover:text-white transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showRPass
                        ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                      }
                    </svg>
                  </button>
                </div>

                {error && <p className="text-red-400 text-xs text-center">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                >
                  {loading ? 'Criando conta...' : (
                    <>
                      Criar conta grátis
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] text-[#4a4f60]">
                  Ao se cadastrar você recebe R$10.000 em conta demo gratuitamente.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
