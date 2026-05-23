'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckCheck, Ban, Loader2, RefreshCw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const PIX_LABEL: Record<string, string> = {
  cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Telefone', random: 'Aleatória',
}

interface Row {
  id: string; amount: number; pix_key_type: string; pix_key: string
  status: string; admin_notes: string | null; created_at: string
  processed_at: string | null; user_id: string
  profiles: { name: string } | null
}

function fmtBRL(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }
function fmtDate(s: string) { return new Date(s).toLocaleString('pt-BR') }

export default function AdminSaquesPage() {
  const [rows, setRows]         = useState<Row[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'pending' | 'all'>('pending')
  const [search, setSearch]     = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [notes, setNotes]       = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const q = supabase
      .from('withdrawals')
      .select('id,amount,pix_key_type,pix_key,status,admin_notes,created_at,processed_at,user_id,profiles(name)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (filter === 'pending') q.eq('status', 'pending')
    const { data } = await q
    setRows((data ?? []) as unknown as Row[])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActionId(id)
    const { error } = await supabase.rpc('admin_process_withdrawal', {
      p_withdrawal_id: id, p_action: action, p_notes: notes[id] ?? null,
    })
    setActionId(null)
    if (error) { alert(error.message); return }
    load()
  }

  const filtered = rows.filter(r =>
    !search || r.pix_key.includes(search) || r.profiles?.name?.toLowerCase().includes(search.toLowerCase())
  )
  const pending = rows.filter(r => r.status === 'pending')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Saques</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Aprovação de retiradas</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-sm text-[#9ca3af] hover:text-white transition-colors">
          <RefreshCw size={14} />Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pendentes',       value: pending.length,                         color: 'text-yellow-400' },
          { label: 'Total pendente',  value: `R$ ${fmtBRL(pending.reduce((s,r)=>s+r.amount,0))}`, color: 'text-white' },
          { label: 'Total registros', value: rows.length,                            color: 'text-white' },
        ].map(s => (
          <div key={s.label} className="bg-[#111827] border border-[#1e2433] rounded-xl px-5 py-4">
            <div className="text-xs text-[#6b7280] mb-1">{s.label}</div>
            <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        {(['pending','all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={cn(
            'px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
            filter === f ? 'bg-green-500 border-green-400 text-white' : 'bg-[#111827] border-[#1e2433] text-[#6b7280] hover:text-white'
          )}>
            {f === 'pending' ? 'Pendentes' : 'Todas'}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou chave..."
            className="pl-8 pr-4 py-1.5 rounded-lg bg-[#111827] border border-[#1e2433] text-xs text-white outline-none placeholder-[#4b5563] focus:border-green-500/50 w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#6b7280]"><Loader2 size={16} className="animate-spin" /><span className="text-sm">Carregando…</span></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#6b7280]">Nenhum saque encontrado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(w => (
            <div key={w.id} className={cn(
              'bg-[#111827] border rounded-xl px-5 py-4',
              w.status === 'pending'  ? 'border-yellow-500/25' :
              w.status === 'approved' ? 'border-green-500/25'  :
              w.status === 'rejected' ? 'border-red-500/25'    : 'border-[#1e2433]'
            )}>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-base font-bold text-white">R$ {fmtBRL(w.amount)}</span>
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                      w.status === 'pending'  ? 'bg-yellow-500/20 text-yellow-400' :
                      w.status === 'approved' ? 'bg-green-500/20 text-green-400'   :
                      w.status === 'rejected' ? 'bg-red-500/20 text-red-400'       : 'bg-[#1e2433] text-[#6b7280]'
                    )}>
                      {w.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div><span className="text-[#6b7280]">Usuário: </span><span className="text-white">{w.profiles?.name ?? w.user_id.slice(0,8)}</span></div>
                    <div><span className="text-[#6b7280]">Chave PIX ({PIX_LABEL[w.pix_key_type]}): </span><span className="text-white font-mono">{w.pix_key}</span></div>
                    <div><span className="text-[#6b7280]">Solicitado: </span><span className="text-white">{fmtDate(w.created_at)}</span></div>
                    {w.processed_at && <div><span className="text-[#6b7280]">Processado: </span><span className="text-white">{fmtDate(w.processed_at)}</span></div>}
                    {w.admin_notes && <div className="col-span-2"><span className="text-[#6b7280]">Nota: </span><span className="text-white">{w.admin_notes}</span></div>}
                  </div>
                </div>
                {w.status === 'pending' && (
                  <div className="flex flex-col gap-2 min-w-[200px] flex-shrink-0">
                    <input
                      placeholder="Observação (opcional)"
                      value={notes[w.id] ?? ''}
                      onChange={e => setNotes(n => ({ ...n, [w.id]: e.target.value }))}
                      className="w-full bg-[#0d1117] border border-[#1e2433] rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder-[#3a3f50] focus:border-green-500/50"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => act(w.id,'approve')} disabled={actionId===w.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-xs font-bold text-white transition-colors">
                        {actionId===w.id ? <Loader2 size={12} className="animate-spin"/> : <CheckCheck size={12}/>} Aprovar
                      </button>
                      <button onClick={() => act(w.id,'reject')} disabled={actionId===w.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-xs font-bold text-white transition-colors">
                        <Ban size={12}/> Rejeitar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
