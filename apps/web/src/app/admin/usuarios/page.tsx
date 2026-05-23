'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Users, UserPlus, Search, Eye, Edit2, Ban, RefreshCw, Trash2,
  RotateCw, Loader2, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserDetailsModal } from '@/components/admin/UserDetailsModal'
import { EditUserModal } from '@/components/admin/EditUserModal'

interface Row {
  id:                  string
  name:                string
  email:               string
  kyc_status:          string
  bonus_balance:       number
  rollover_required:   number
  rollover_completed:  number
  blocked_at:          string | null
  is_admin:            boolean
  real_balance:        number
  demo_balance:        number
  created_at:          string
}

interface Stats {
  total:    number
  today:    number
  last_7d:  number
  last_30d: number
}

const PAGE_SIZE = 50

export default function UsuariosAdminPage() {
  const [stats,     setStats]     = useState<Stats | null>(null)
  const [rows,      setRows]      = useState<Row[]>([])
  const [total,     setTotal]     = useState(0)
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [editingUser,  setEditingUser]  = useState<string | null>(null)
  const [actionBusy,   setActionBusy]   = useState<string | null>(null)

  async function handleToggleBlock(u: Row) {
    const isBlocked = !!u.blocked_at
    const confirmMsg = isBlocked
      ? `Desbloquear ${u.name}? Ele poderá fazer login novamente.`
      : `Bloquear ${u.name}? Ele não poderá fazer login.`
    if (!confirm(confirmMsg)) return

    setActionBusy(u.id)
    try {
      const rpc = isBlocked ? 'admin_unblock_user' : 'admin_block_user'
      const params: any = { p_user_id: u.id }
      if (!isBlocked) params.p_reason = prompt('Motivo do bloqueio (opcional):') || null
      const { error } = await supabase.rpc(rpc, params)
      if (error) throw error
      await loadUsers()
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setActionBusy(null)
    }
  }

  async function handleResetDemo(u: Row) {
    if (!confirm(`Resetar saldo demo de ${u.name} para R$ 10.000,00?`)) return
    setActionBusy(u.id)
    try {
      const { error } = await supabase.rpc('admin_reset_demo', { p_user_id: u.id })
      if (error) throw error
      await loadUsers()
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setActionBusy(null)
    }
  }

  async function handleDelete(u: Row) {
    if (u.is_admin) {
      alert('Não é permitido deletar outro admin.')
      return
    }
    const typed = prompt(
      `⚠ DELETAR usuário ${u.name}?\n\n` +
      `Isso vai:\n` +
      `• Bloquear o login permanentemente\n` +
      `• Anonimizar o nome para "[Conta deletada]"\n` +
      `• Manter todo histórico financeiro intacto (compliance)\n\n` +
      `Para confirmar, digite: DELETAR`
    )
    if (typed !== 'DELETAR') return

    const reason = prompt('Motivo da deleção (será registrado no audit log):')
    if (!reason || reason.trim().length < 3) {
      alert('Motivo obrigatório (mínimo 3 caracteres).')
      return
    }

    setActionBusy(u.id)
    try {
      const { error } = await supabase.rpc('admin_soft_delete_user', {
        p_user_id: u.id,
        p_reason:  reason.trim(),
      })
      if (error) throw error
      await loadUsers()
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setActionBusy(null)
    }
  }

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_user_stats')
    if (!error && data) setStats(data as Stats)
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('admin_list_users', {
      p_search: search || null,
      p_limit:  PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    })
    if (error) {
      setError(error.message)
    } else if (data) {
      setRows((data as any).rows ?? [])
      setTotal((data as any).total ?? 0)
    }
    setLoading(false)
  }, [search, page])

  useEffect(() => { loadStats() }, [loadStats])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadUsers() }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { loadUsers() }, [page])

  function splitName(full: string) {
    const parts = (full || '').trim().split(/\s+/)
    const first = parts.shift() ?? '—'
    const last  = parts.join(' ') || '—'
    return { first, last }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Usuários</h1>
        <button
          onClick={() => { loadStats(); loadUsers() }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2a2e3b] text-[#8b8f9a] hover:text-white hover:border-white/30 transition-colors text-xs font-medium"
        >
          <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>
      <p className="text-sm text-[#8b8f9a] mb-6">Gerencie todos os usuários da plataforma</p>

      {/* 4 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Users size={18} />}      label="Total de Usuários" value={stats?.total} color="green" />
        <StatCard icon={<UserPlus size={18} />}   label="Cadastros Hoje"   value={stats?.today} color="green" />
        <StatCard icon={<UserPlus size={18} />}   label="Novos (7 dias)"   value={stats?.last_7d} color="green" />
        <StatCard icon={<TrendingUp size={18} />} label="Novos (30 dias)"  value={stats?.last_30d} color="blue" />
      </div>

      {/* Tabs + search */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex border-b border-[#2a2e3b]">
          <TabButton active>Todos Usuários</TabButton>
          <TabButton disabled>Todos Traders</TabButton>
        </div>
        <div className="relative w-72">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8f9a]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuário..."
            className="w-full h-9 bg-[#161b27] border border-[#2a2e3b] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#8b8f9a] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#161b27] border border-[#2a2e3b] rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#8b8f9a] border-b border-[#2a2e3b]">
              <th className="text-left px-4 py-3 font-medium w-8"><input type="checkbox" className="accent-blue-500" /></th>
              <th className="text-left px-4 py-3 font-medium">ID</th>
              <th className="text-left px-4 py-3 font-medium">Nome</th>
              <th className="text-left px-4 py-3 font-medium">Sobrenome</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-right px-4 py-3 font-medium">Saldo</th>
              <th className="text-right px-4 py-3 font-medium">Bônus</th>
              <th className="text-center px-4 py-3 font-medium">Rollover</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-20"><Loader2 className="inline-block animate-spin text-[#8b8f9a]" size={20} /></td></tr>
            ) : error ? (
              <tr><td colSpan={11} className="text-center py-10 text-red-400">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-10 text-[#8b8f9a]">Nenhum usuário encontrado</td></tr>
            ) : rows.map((u) => {
              const { first, last } = splitName(u.name)
              const blocked = !!u.blocked_at
              const rolloverPct = u.rollover_required > 0 ? Math.min(100, (Number(u.rollover_completed) / Number(u.rollover_required)) * 100) : 0
              return (
                <tr key={u.id} className="border-b border-[#1e2433] text-white hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3"><input type="checkbox" className="accent-blue-500" /></td>
                  <td className="px-4 py-3 text-[#8b8f9a] font-mono text-[10px]">{u.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 font-medium">{first}</td>
                  <td className="px-4 py-3 text-[#bdc1cc]">{last}</td>
                  <td className="px-4 py-3 text-[#8b8f9a] text-[11px]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border', u.is_admin ? 'bg-purple-500/15 text-purple-400 border-purple-500/40' : 'bg-[#2a2e3b] text-[#bdc1cc] border-[#3a3f50]')}>
                      {u.is_admin ? 'Admin' : 'Usuário'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">R$ {Number(u.real_balance).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">R$ {Number(u.bonus_balance).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-center gap-0.5 min-w-[80px]">
                      <span className="text-[10px] text-[#8b8f9a]">
                        {Number(u.rollover_completed).toFixed(0)} / {Number(u.rollover_required).toFixed(0)}
                      </span>
                      {u.rollover_required > 0 && (
                        <div className="w-full h-1 bg-[#2a2e3b] rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${rolloverPct}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold', blocked ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400')}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', blocked ? 'bg-red-400' : 'bg-green-400')} />
                      {blocked ? 'Bloqueado' : 'Ativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ActionBtn onClick={() => setSelectedUser(u.id)} title="Ver detalhes"><Eye size={14} /></ActionBtn>
                      <ActionBtn onClick={() => setEditingUser(u.id)} title="Editar"><Edit2 size={14} /></ActionBtn>
                      <ActionBtn
                        onClick={() => handleToggleBlock(u)}
                        disabled={actionBusy === u.id}
                        title={blocked ? 'Desbloquear' : 'Bloquear'}
                        variant={blocked ? undefined : 'danger'}
                      >
                        <Ban size={14} className={blocked ? 'text-green-400' : ''} />
                      </ActionBtn>
                      <ActionBtn onClick={() => handleResetDemo(u)} disabled={actionBusy === u.id} title="Resetar demo">
                        <RefreshCw size={14} className={actionBusy === u.id ? 'animate-spin' : ''} />
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => handleDelete(u)}
                        disabled={actionBusy === u.id || u.is_admin}
                        title={u.is_admin ? 'Não é permitido deletar admin' : 'Deletar conta'}
                        variant="danger"
                      >
                        <Trash2 size={14} />
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#2a2e3b] text-xs text-[#8b8f9a]">
            <div>
              Mostrando <span className="text-white">{page * PAGE_SIZE + 1}</span>–<span className="text-white">{Math.min((page + 1) * PAGE_SIZE, total)}</span> de <span className="text-white">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded border border-[#2a2e3b] hover:border-blue-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="text-white">Página {page + 1} de {pageCount}</span>
              <button
                onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
                disabled={page >= pageCount - 1}
                className="px-3 py-1 rounded border border-[#2a2e3b] hover:border-blue-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedUser && (
        <UserDetailsModal userId={selectedUser} onClose={() => setSelectedUser(null)} />
      )}

      {editingUser && (
        <EditUserModal
          userId={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => loadUsers()}
        />
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | undefined; color: 'green' | 'blue' }) {
  return (
    <div className="bg-[#161b27] border border-[#2a2e3b] rounded-xl p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color === 'green' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400')}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] text-[#8b8f9a]">{label}</div>
        <div className="text-2xl font-bold text-white leading-tight">
          {value === undefined ? '—' : value.toLocaleString('pt-BR')}
        </div>
      </div>
    </div>
  )
}

function TabButton({ children, active, disabled }: { children: React.ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'px-4 py-2 text-sm font-semibold transition-colors border-b-2',
        active ? 'border-green-400 text-white' : 'border-transparent text-[#8b8f9a] hover:text-white',
        disabled && 'opacity-40 cursor-not-allowed hover:text-[#8b8f9a]'
      )}
    >
      {children}
    </button>
  )
}

function ActionBtn({ children, onClick, title, disabled, variant }: { children: React.ReactNode; onClick?: () => void; title: string; disabled?: boolean; variant?: 'danger' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded transition-colors',
        disabled ? 'text-[#3a3f50] cursor-not-allowed' : 'text-[#8b8f9a] hover:bg-white/5',
        !disabled && (variant === 'danger' ? 'hover:text-red-400' : 'hover:text-white')
      )}
    >
      {children}
    </button>
  )
}
