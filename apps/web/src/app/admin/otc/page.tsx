'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Plus, Pencil, Trash2, Power, RefreshCcw, X } from 'lucide-react'

type OtcAsset = {
  id: string
  symbol: string
  name: string
  basePrice: string | number
  volatility: string | number
  trend: string | number
  payout: number
  decimals: number
  status: 'ACTIVE' | 'INACTIVE'
  sessionStartUtc: string | null
  sessionEndUtc:   string | null
  updatedAt: string
}

type FormState = {
  id?: string
  symbol:          string
  name:            string
  basePrice:       string
  volatility:      string
  trend:           string
  payout:          string
  decimals:        string
  status:          'ACTIVE' | 'INACTIVE'
  sessionStartUtc: string
  sessionEndUtc:   string
}

const emptyForm: FormState = {
  symbol: '', name: '', basePrice: '', volatility: '0.001', trend: '0',
  payout: '85', decimals: '5', status: 'ACTIVE', sessionStartUtc: '', sessionEndUtc: '',
}

export default function OtcAdminPage() {
  const [assets, setAssets] = useState<OtcAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [modal,   setModal]   = useState<FormState | null>(null)
  const [saving,  setSaving]  = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const { data } = await api.get<{ assets: OtcAsset[] }>('/admin/otc')
      setAssets(data.assets)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openCreate() { setModal({ ...emptyForm }) }
  function openEdit(a: OtcAsset) {
    setModal({
      id: a.id, symbol: a.symbol, name: a.name,
      basePrice: String(a.basePrice), volatility: String(a.volatility), trend: String(a.trend),
      payout: String(a.payout), decimals: String(a.decimals), status: a.status,
      sessionStartUtc: a.sessionStartUtc ?? '', sessionEndUtc: a.sessionEndUtc ?? '',
    })
  }

  async function save() {
    if (!modal) return
    setSaving(true)
    const payload: any = {
      name:       modal.name,
      basePrice:  Number(modal.basePrice),
      volatility: Number(modal.volatility),
      trend:      Number(modal.trend),
      payout:     Number(modal.payout),
      decimals:   Number(modal.decimals),
      status:     modal.status,
      sessionStartUtc: modal.sessionStartUtc || null,
      sessionEndUtc:   modal.sessionEndUtc   || null,
    }
    try {
      if (modal.id) {
        await api.patch(`/admin/otc/${modal.id}`, payload)
      } else {
        await api.post('/admin/otc', { ...payload, symbol: modal.symbol })
      }
      setModal(null)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err.message)
    } finally { setSaving(false) }
  }

  async function toggle(a: OtcAsset) {
    try { await api.post(`/admin/otc/${a.id}/toggle`); await load() }
    catch (err: any) { alert(err?.response?.data?.error ?? err.message) }
  }
  async function remove(a: OtcAsset) {
    if (!confirm(`Remover ${a.symbol}? Esta ação não pode ser desfeita.`)) return
    try { await api.delete(`/admin/otc/${a.id}`); await load() }
    catch (err: any) { alert(err?.response?.data?.error ?? err.message) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Cadastro OTC</h1>
          <p className="text-sm text-[#6b7280]">Ativos sintéticos gerados pelo servidor</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2030] text-[#9ca3af] hover:text-white text-sm">
            <RefreshCcw size={14} /> Atualizar
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium">
            <Plus size={16} /> Novo ativo
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

      <div className="rounded-xl border border-[#1e2433] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0d1117] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Símbolo</th>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-right px-4 py-3">Preço base</th>
              <th className="text-right px-4 py-3">Volatilidade</th>
              <th className="text-right px-4 py-3">Trend</th>
              <th className="text-right px-4 py-3">Payout</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[#6b7280]">Carregando…</td></tr>
            )}
            {!loading && assets.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[#6b7280]">Nenhum ativo cadastrado. Clique em "Novo ativo".</td></tr>
            )}
            {assets.map(a => (
              <tr key={a.id} className="text-white hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono font-semibold">{a.symbol}</td>
                <td className="px-4 py-3 text-[#9ca3af]">{a.name}</td>
                <td className="px-4 py-3 text-right font-mono">{Number(a.basePrice).toFixed(a.decimals)}</td>
                <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">{Number(a.volatility).toFixed(4)}</td>
                <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">{Number(a.trend).toFixed(4)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-400">{a.payout}%</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.status === 'ACTIVE' ? 'bg-green-500/15 text-green-400' : 'bg-[#1e2433] text-[#6b7280]'}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => toggle(a)} title="Ativar/Desativar" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-yellow-400"><Power size={14} /></button>
                    <button onClick={() => openEdit(a)} title="Editar" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-blue-400"><Pencil size={14} /></button>
                    <button onClick={() => remove(a)} title="Remover" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setModal(null)}>
          <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{modal.id ? 'Editar ativo' : 'Novo ativo OTC'}</h2>
              <button onClick={() => setModal(null)} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Símbolo" disabled={!!modal.id} value={modal.symbol} onChange={v => setModal({ ...modal, symbol: v.toUpperCase() })} placeholder="USDBRL-OTC" />
              <Field label="Nome" value={modal.name} onChange={v => setModal({ ...modal, name: v })} placeholder="USD/BRL OTC" />
              <Field label="Preço base" value={modal.basePrice} onChange={v => setModal({ ...modal, basePrice: v })} placeholder="5.20000" />
              <Field label="Decimais" value={modal.decimals} onChange={v => setModal({ ...modal, decimals: v })} placeholder="5" />
              <Field label="Volatilidade (0..1)" value={modal.volatility} onChange={v => setModal({ ...modal, volatility: v })} placeholder="0.001" />
              <Field label="Trend (-1..1)" value={modal.trend} onChange={v => setModal({ ...modal, trend: v })} placeholder="0" />
              <Field label="Payout %" value={modal.payout} onChange={v => setModal({ ...modal, payout: v })} placeholder="85" />
              <div>
                <label className="block text-[11px] text-[#6b7280] mb-1">Status</label>
                <select value={modal.status} onChange={e => setModal({ ...modal, status: e.target.value as any })} className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              <Field label="Sessão início UTC (HH:MM)" value={modal.sessionStartUtc} onChange={v => setModal({ ...modal, sessionStartUtc: v })} placeholder="00:00" />
              <Field label="Sessão fim UTC (HH:MM)" value={modal.sessionEndUtc} onChange={v => setModal({ ...modal, sessionEndUtc: v })} placeholder="23:59" />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] text-[#6b7280] mb-1">{label}</label>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        disabled={disabled} placeholder={placeholder}
        className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white disabled:opacity-50 focus:border-green-500 focus:outline-none"
      />
    </div>
  )
}
