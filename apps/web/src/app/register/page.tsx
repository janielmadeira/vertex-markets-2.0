'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'

export default function RegisterPage() {
  const register = useAuthStore(s => s.register)
  const router   = useRouter()

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return }
    setLoading(true)
    try {
      await register(name, email, password)
      router.replace('/')
    } catch (err: any) {
      const code = err.response?.data?.error
      if (code === 'EMAIL_TAKEN') setError('Este email já está em uso.')
      else setError('Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#151823] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Vertex Markets</h1>
          <p className="text-[#8b8f9a] text-sm mt-1">Crie sua conta gratuita</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1d2130] rounded-2xl p-6 flex flex-col gap-4 border border-[#2a2e3b]">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#8b8f9a] tracking-wide">NOME</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Seu nome"
              className="bg-[#252a3a] border border-[#2a2e3b] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-[#4a4f60]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#8b8f9a] tracking-wide">EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
              className="bg-[#252a3a] border border-[#2a2e3b] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-[#4a4f60]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#8b8f9a] tracking-wide">SENHA</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Mínimo 8 caracteres"
              className="bg-[#252a3a] border border-[#2a2e3b] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-[#4a4f60]"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all font-bold text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading ? 'Criando conta...' : 'Criar conta grátis'}
          </button>

          <p className="text-center text-xs text-[#8b8f9a]">
            Já tem conta?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
              Entrar
            </Link>
          </p>
        </form>

        <p className="text-center text-[10px] text-[#4a4f60] mt-4">
          Ao criar sua conta você recebe R$10.000 em conta demo gratuitamente.
        </p>
      </div>
    </div>
  )
}
