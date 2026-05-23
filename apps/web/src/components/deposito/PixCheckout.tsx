'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Copy, Check, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore, useCurrentAccount } from '@/store/auth'
import { cn } from '@/lib/utils'
import QRCode from 'qrcode'

interface PixCheckoutProps {
  onBack: () => void
  onSuccess: () => void
}

const AMOUNT_PRESETS = [50, 100, 200, 500, 1000]

type Step = 'amount' | 'qrcode' | 'success'

export function PixCheckout({ onBack, onSuccess }: PixCheckoutProps) {
  const user = useAuthStore(s => s.user)
  const account = useAuthStore(useCurrentAccount)

  const [step, setStep]           = useState<Step>('amount')
  const [amount, setAmount]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [qrcode, setQrcode]       = useState<string | null>(null)
  const [qrImg, setQrImg]         = useState<string | null>(null)
  const [externalId, setExternalId] = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)

  // Gera imagem QR quando qrcode (string EMV) chega
  useEffect(() => {
    if (!qrcode) return
    QRCode.toDataURL(qrcode, { width: 220, margin: 1, color: { dark: '#000', light: '#fff' } })
      .then(setQrImg)
      .catch(() => setQrImg(null))
  }, [qrcode])

  // Poll: verifica se depósito foi confirmado a cada 4s
  useEffect(() => {
    if (step !== 'qrcode' || !externalId) return
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from('deposits')
        .select('status')
        .eq('external_id', externalId)
        .single()
      if (data?.status === 'confirmed') {
        clearInterval(iv)
        setStep('success')
        setTimeout(onSuccess, 3000)
      }
    }, 4000)
    return () => clearInterval(iv)
  }, [step, externalId, onSuccess])

  const handleCreate = useCallback(async () => {
    const val = parseFloat(amount.replace(',', '.'))
    if (isNaN(val) || val < 10) { setError('Valor mínimo: R$10,00'); return }
    if (!user || !account) { setError('Conta não encontrada'); return }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/payments/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: val, userId: user.id, accountId: account.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar PIX')
      setQrcode(json.qrcode)
      setExternalId(json.externalId)
      setStep('qrcode')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [amount, user, account])

  const copyCode = () => {
    if (!qrcode) return
    navigator.clipboard.writeText(qrcode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  /* ── Sucesso ── */
  if (step === 'success') {
    const val = parseFloat(amount.replace(',', '.'))
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-400" />
        </div>
        <p className="text-xl font-bold text-white">Depósito confirmado!</p>
        <p className="text-sm text-[#8b8f9a]">R$ {fmtBRL(val)} adicionado à sua conta REAL</p>
      </div>
    )
  }

  /* ── QR Code ── */
  if (step === 'qrcode') {
    const val = parseFloat(amount.replace(',', '.'))
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-[#2a2e3b]">
          <button onClick={() => setStep('amount')} className="text-[#8b8f9a] hover:text-white">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-white">PIX — R$ {fmtBRL(val)}</span>
        </div>

        <div className="flex flex-col items-center gap-6 p-8">
          {/* QR Image */}
          <div className="bg-white rounded-2xl p-3 shadow-xl">
            {qrImg ? (
              <img src={qrImg} alt="QR Code PIX" width={220} height={220} />
            ) : (
              <div className="w-[220px] h-[220px] flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-[#8b8f9a]" />
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 text-sm text-[#8b8f9a]">
            <Loader2 size={14} className="animate-spin" />
            <span>Aguardando pagamento…</span>
          </div>

          {/* Copy button */}
          {qrcode && (
            <button
              onClick={copyCode}
              className={cn(
                'flex items-center gap-2 w-full max-w-xs py-3 rounded-xl font-semibold text-sm transition-colors',
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-[#1e2235] border border-[#2a2e3b] text-white hover:border-blue-500/40'
              )}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span className="flex-1 text-center">
                {copied ? 'Código copiado!' : 'Copiar código PIX'}
              </span>
            </button>
          )}

          <p className="text-[11px] text-[#8b8f9a] text-center max-w-xs leading-relaxed">
            Abra o app do seu banco, escolha PIX → Pagar com QR Code ou Cole o código acima.
            O saldo é creditado automaticamente após confirmação.
          </p>
        </div>
      </div>
    )
  }

  /* ── Seleção de valor ── */
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[#2a2e3b]">
        <button onClick={onBack} className="text-[#8b8f9a] hover:text-white">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-white">Depósito via PIX</span>
      </div>

      <div className="p-6 flex flex-col gap-5">
        {/* Valor */}
        <div>
          <label className="text-[10px] font-bold text-[#8b8f9a] tracking-widest block mb-2">VALOR</label>
          <div className="relative border border-[#2a2e3b] rounded-xl px-4 py-3 bg-[#1a1e2e] focus-within:border-blue-500/50 transition-colors flex items-center gap-2">
            <span className="text-sm font-semibold text-[#8b8f9a]">R$</span>
            <input
              type="number"
              min={10}
              step={1}
              placeholder="0,00"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="flex-1 bg-transparent text-lg font-bold text-white outline-none placeholder-[#3a3f50]"
              autoFocus
            />
          </div>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-5 gap-2">
          {AMOUNT_PRESETS.map(v => (
            <button
              key={v}
              onClick={() => { setAmount(String(v)); setError(null) }}
              className={cn(
                'py-2 rounded-lg text-sm font-semibold transition-colors border',
                amount === String(v)
                  ? 'bg-green-600 border-green-500 text-white'
                  : 'bg-[#1a1e2e] border-[#2a2e3b] text-[#8b8f9a] hover:text-white hover:border-[#3a3f50]'
              )}
            >
              {v >= 1000 ? `${v / 1000}K` : v}
            </button>
          ))}
        </div>

        {/* Info mínimo */}
        <p className="text-[11px] text-[#8b8f9a]">Valor mínimo: R$10,00 · Conta: REAL</p>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={loading || !amount}
          className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-white text-sm transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {loading ? 'Gerando QR Code…' : 'Gerar QR Code PIX'}
        </button>
      </div>
    </div>
  )
}
