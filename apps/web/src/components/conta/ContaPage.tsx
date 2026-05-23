'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Camera, CheckCircle2, Lock, Globe, Clock, X, ChevronDown, Pencil,
  AlertCircle, ChevronRight, Landmark, Zap, ChevronLeft, Loader2,
  CheckCheck, Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnalisePage } from '@/components/analise/AnalisePage'
import { VerificacaoTab } from '@/components/conta/VerificacaoTab'
import { supabase } from '@/lib/supabase'
import { useAuthStore, useCurrentAccount } from '@/store/auth'

type ContaTab = 'retirada' | 'transacoes' | 'operacoes' | 'minha-conta' | 'verificacao' | 'mercado' | 'torneios' | 'analise'

const CONTA_TABS: { key: ContaTab; label: string }[] = [
  { key: 'retirada', label: 'Retirada' },
  { key: 'transacoes', label: 'Transações' },
  { key: 'operacoes', label: 'Operações' },
  { key: 'minha-conta', label: 'Minha Conta' },
  { key: 'verificacao', label: 'Verificação' },
  { key: 'mercado', label: 'Mercado' },
  { key: 'torneios', label: 'Torneios' },
  { key: 'analise', label: 'Análise' },
]

const FAQ_RETIRADA = [
  ['Como posso retirar dinheiro da conta?', 'O que é a verificação de conta?'],
  ['Quanto tempo leva para retirar fundos?', 'Como entendo que preciso passar pela verificação da conta?'],
  ['Qual é o valor mínimo da retirada?', 'Quanto tempo leva o processo de verificação?'],
  ['Existe alguma taxa para depositar ou retirar fundos da conta?', 'Como posso saber se meus dados estão verificados com sucesso?'],
  ['Preciso fornecer algum documento para fazer uma retirada?', ''],
]

const PIX_KEY_TYPES = [
  { value: 'cpf',    label: 'CPF' },
  { value: 'email',  label: 'E-mail' },
  { value: 'phone',  label: 'Telefone' },
  { value: 'random', label: 'Chave aleatória' },
  { value: 'cnpj',   label: 'CNPJ' },
]

interface Withdrawal {
  id: string
  amount: number
  pix_key_type: string
  pix_key: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  admin_notes: string | null
  created_at: string
  processed_at: string | null
}

function FloatingInput({
  label, value, rightLabel, rightLabelColor = 'text-green-400', readOnly = false,
}: {
  label: string; value: string; rightLabel?: string; rightLabelColor?: string; readOnly?: boolean
}) {
  return (
    <div className="relative border border-[#2a2e3b] rounded-lg px-3 pt-4 pb-2 bg-[#1a1e2e] focus-within:border-blue-500/50 transition-colors">
      <span className="absolute top-1.5 left-3 text-[10px] text-[#8b8f9a] font-medium">{label}</span>
      <div className="flex items-center justify-between">
        <input
          defaultValue={value}
          readOnly={readOnly}
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder-[#8b8f9a]"
        />
        {rightLabel && (
          <span className={cn('text-xs font-semibold ml-2', rightLabelColor)}>{rightLabel}</span>
        )}
      </div>
    </div>
  )
}

function FloatingSelect({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative border border-[#2a2e3b] rounded-lg px-3 pt-4 pb-2 bg-[#1a1e2e] cursor-pointer">
      <span className="absolute top-1.5 left-3 text-[10px] text-[#8b8f9a] font-medium">{label}</span>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white">{value}</span>
        <ChevronDown size={14} className="text-[#8b8f9a]" />
      </div>
    </div>
  )
}

function Toggle({ label, defaultOn = true }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <button onClick={() => setOn(!on)} className="flex items-center gap-3 text-left">
      <div className={cn('relative w-10 h-5 rounded-full transition-colors flex-shrink-0', on ? 'bg-blue-500' : 'bg-[#3a3f50]')}>
        <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
      </div>
      <span className="text-sm text-white">{label}</span>
    </button>
  )
}

const TX_LABEL: Record<string, string> = {
  TRADE_WIN:   'Operação vencida',
  TRADE_LOSS:  'Operação perdida',
  TRADE_DRAW:  'Empate',
  EARLY_CLOSE: 'Saída antecipada',
  DEPOSIT:     'Depósito',
  WITHDRAWAL:  'Retirada',
  DEMO_RESET:  'Reset demo',
  BONUS:       'Bônus',
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ', ' + d.toLocaleTimeString('pt-BR')
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending') return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full border-2 border-[#8b8f9a] flex-shrink-0" />
      <span className="text-xs text-[#8b8f9a]">Aguardando confirmação</span>
    </div>
  )
  if (status === 'failed') return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
        <X size={9} className="text-white" />
      </div>
      <span className="text-xs text-red-400 font-medium">Falhado</span>
    </div>
  )
  return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <CheckCircle2 size={9} className="text-white" />
      </div>
      <span className="text-xs text-green-400 font-medium">Bem-sucedido</span>
    </div>
  )
}

function TransacoesTab() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      setTransactions(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pt-4">
        {/* Header */}
        <div className="grid grid-cols-[260px_200px_220px_1fr_140px] gap-4 pb-2 border-b border-[#2a2e3b] mb-1">
          {['ID da Transação','Data e hora','Status','Tipo','Valor'].map((h) => (
            <span key={h} className="text-xs text-[#8b8f9a] font-medium">{h}</span>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="text-[#8b8f9a] animate-spin" />
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-[#8b8f9a] text-sm">Nenhuma transação ainda</span>
            <span className="text-[#8b8f9a] text-xs">Faça uma operação para ver o histórico aqui</span>
          </div>
        )}

        {transactions.map((tx) => {
          const positive = Number(tx.amount) >= 0
          return (
            <div key={tx.id} className="grid grid-cols-[260px_200px_220px_1fr_140px] gap-4 py-3 border-b border-[#2a2e3b]/40 hover:bg-white/[0.02] transition-colors items-center">
              <span className="text-xs text-white font-mono truncate">{tx.id}</span>
              <span className="text-xs text-[#8b8f9a]">{fmtDate(tx.created_at)}</span>
              <StatusBadge status="success" />
              <span className="text-xs text-[#8b8f9a]">{TX_LABEL[tx.type] ?? tx.type}</span>
              <span className={cn('text-xs font-semibold text-right tabular-nums', positive ? 'text-green-400' : 'text-red-400')}>
                {positive ? '+' : ''}R$ {fmtBRL(Math.abs(Number(tx.amount)))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MiniChartIcon() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" className="text-[#8b8f9a]">
      <polyline points="0,12 5,8 9,10 13,4 17,6 22,2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function OperacoesTab() {
  const store = useAuthStore()
  const [subTab, setSubTab] = useState<'historico' | 'pendentes'>('historico')
  const [contaTipo, setContaTipo] = useState<'REAL' | 'DEMO'>('REAL')
  const [contaDropOpen, setContaDropOpen] = useState(false)
  const [operations, setOperations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const account = store.user?.accounts.find(a => a.type === contaTipo)
      if (!account) { setOperations([]); setLoading(false); return }
      const statusFilter = subTab === 'pendentes' ? ['OPEN'] : ['WON','LOST','DRAW']
      const { data } = await supabase
        .from('operations')
        .select('*')
        .eq('account_id', account.id)
        .in('status', statusFilter)
        .order('created_at', { ascending: false })
        .limit(100)
      setOperations(data ?? [])
      setLoading(false)
    }
    load()
  }, [subTab, contaTipo, store.user])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-tabs */}
      <div className="flex items-center gap-6 px-6 pt-4 pb-0 border-b border-[#2a2e3b] flex-shrink-0">
        <button
          onClick={() => setSubTab('historico')}
          className={cn(
            'pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
            subTab === 'historico' ? 'text-white border-white font-semibold' : 'text-blue-400 border-transparent hover:text-blue-300'
          )}
        >
          Histórico de negociações
        </button>
        <button
          onClick={() => setSubTab('pendentes')}
          className={cn(
            'pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
            subTab === 'pendentes' ? 'text-white border-white font-semibold' : 'text-blue-400 border-transparent hover:text-blue-300'
          )}
        >
          Negociações pendentes
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0">
        {/* Account type */}
        <div className="relative min-w-[160px]">
          <button
            onClick={() => setContaDropOpen(!contaDropOpen)}
            className="relative w-full border border-[#2a2e3b] rounded-lg px-3 pt-5 pb-2 bg-[#1a1e2e] text-left hover:border-blue-500/40 transition-colors"
          >
            <span className="absolute top-1.5 left-3 text-[10px] text-[#8b8f9a] font-medium">Tipo de Conta:</span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-white">{contaTipo === 'REAL' ? 'Conta real' : 'Conta demo'}</span>
              <ChevronDown size={13} className={cn('text-[#8b8f9a] transition-transform', contaDropOpen && 'rotate-180')} />
            </div>
          </button>

          {contaDropOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1e2e] border border-[#2a2e3b] rounded-lg overflow-hidden shadow-xl z-50">
              {(['REAL', 'DEMO'] as const).map((tipo) => (
                <button
                  key={tipo}
                  onClick={() => { setContaTipo(tipo); setContaDropOpen(false) }}
                  className={cn(
                    'w-full px-4 py-2.5 text-sm text-left transition-colors',
                    contaTipo === tipo ? 'bg-white/10 text-white font-semibold' : 'text-[#8b8f9a] hover:bg-white/5 hover:text-white'
                  )}
                >
                  {tipo === 'REAL' ? 'Conta real' : 'Conta demo'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Export */}
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2e3b] text-xs text-[#8b8f9a] hover:text-white hover:border-white/30 transition-colors">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 9v2h9V9M6.5 1v7M4 5l2.5 3L9 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Exportar para
          <ChevronDown size={12} />
        </button>

        {/* Pagination */}
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2e3b] text-xs text-[#8b8f9a] hover:text-white hover:border-white/30 transition-colors">
          <ChevronLeft size={13} />
          Anterior
        </button>
        <span className="text-xs text-[#8b8f9a] font-medium px-1">1/422</span>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold transition-colors">
          Próximo
          <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
            <ChevronRight size={10} className="text-white" />
          </div>
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6">
        {/* Header */}
        <div className="grid grid-cols-[200px_260px_60px_160px_160px_120px_130px] gap-3 py-2 border-b border-[#2a2e3b] mb-1">
          {['Ativo','Informações','Gráfico','Preço de abertura','Preço de fechamento','Status','Valor / Lucro'].map((h) => (
            <span key={h} className="text-xs text-[#8b8f9a] font-medium">{h}</span>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="text-[#8b8f9a] animate-spin" />
          </div>
        )}

        {!loading && operations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-[#8b8f9a] text-sm">Nenhuma operação encontrada</span>
          </div>
        )}

        {operations.map((op) => {
          const isCall = op.direction === 'CALL'
          const won = op.status === 'WON'
          const lost = op.status === 'LOST'
          const open = op.status === 'OPEN'
          const profit = Number(op.profit ?? 0)
          return (
            <div key={op.id} className="grid grid-cols-[200px_260px_60px_160px_160px_120px_130px] gap-3 py-3 border-b border-[#2a2e3b]/40 hover:bg-white/[0.02] transition-colors items-center">
              {/* Ativo */}
              <div className="flex items-center gap-2">
                <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white', isCall ? 'bg-green-600' : 'bg-red-600')}>
                  {isCall ? '▲' : '▼'}
                </div>
                <span className="text-xs text-white font-medium leading-tight">{op.asset_symbol}</span>
              </div>

              {/* Informações */}
              <div>
                <div className="text-xs font-semibold text-white mb-0.5">{op.payout_pct}%</div>
                <div className="text-[10px] text-[#8b8f9a] font-mono truncate leading-tight">{op.id}</div>
              </div>

              {/* Gráfico */}
              <div className="flex items-center justify-center">
                <MiniChartIcon />
              </div>

              {/* Preço de abertura */}
              <div>
                <div className="text-xs text-white font-medium font-mono">{Number(op.entry_price).toFixed(5)}</div>
                <div className="text-[10px] text-[#8b8f9a] mt-0.5">{fmtDate(op.created_at)}</div>
              </div>

              {/* Preço de fechamento */}
              <div>
                {op.exit_price
                  ? <>
                      <div className="text-xs text-white font-medium font-mono">{Number(op.exit_price).toFixed(5)}</div>
                      <div className="text-[10px] text-[#8b8f9a] mt-0.5">{op.closed_at ? fmtDate(op.closed_at) : '—'}</div>
                    </>
                  : <span className="text-xs text-yellow-400 font-semibold">Em aberto</span>
                }
              </div>

              {/* Status */}
              <div>
                {open && <span className="text-xs text-yellow-400 font-semibold">Aberta</span>}
                {won  && <span className="text-xs text-green-400 font-semibold">Ganhou</span>}
                {lost && <span className="text-xs text-red-400 font-semibold">Perdeu</span>}
                {op.status === 'DRAW' && <span className="text-xs text-[#8b8f9a] font-semibold">Empate</span>}
              </div>

              {/* Valor / Lucro */}
              <div className="text-right">
                <div className="text-xs text-[#8b8f9a]">R$ {fmtBRL(Number(op.amount))}</div>
                {!open && (
                  <div className={cn('text-xs font-bold tabular-nums', won ? 'text-green-400' : lost ? 'text-red-400' : 'text-[#8b8f9a]')}>
                    {won ? '+' : ''}R$ {fmtBRL(Math.abs(profit))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WithdrawalStatusBadge({ status }: { status: Withdrawal['status'] }) {
  if (status === 'pending')   return <span className="flex items-center gap-1.5 text-xs text-yellow-400"><div className="w-3 h-3 rounded-full border-2 border-yellow-400" />Aguardando aprovação</span>
  if (status === 'approved')  return <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCheck size={13} />Aprovada</span>
  if (status === 'rejected')  return <span className="flex items-center gap-1.5 text-xs text-red-400"><Ban size={13} />Rejeitada</span>
  if (status === 'cancelled') return <span className="flex items-center gap-1.5 text-xs text-[#8b8f9a]"><X size={13} />Cancelada</span>
  return null
}

function RetiradaTab() {
  const user    = useAuthStore(s => s.user)
  const account = useAuthStore(useCurrentAccount)

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  // form
  const [pixKeyType, setPixKeyType] = useState('cpf')
  const [pixKey, setPixKey]         = useState('')
  const [amount, setAmount]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const realAccount = account?.type === 'REAL' ? account : user?.accounts.find(a => a.type === 'REAL')
  const balance = realAccount ? parseFloat(realAccount.balance) : 0
  const hasPending = withdrawals.some(w => w.status === 'pending')

  const loadWithdrawals = useCallback(async () => {
    if (!user) return
    setLoadingList(true)
    const { data } = await supabase
      .from('withdrawals')
      .select('id,amount,pix_key_type,pix_key,status,admin_notes,created_at,processed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setWithdrawals((data ?? []) as Withdrawal[])
    setLoadingList(false)
  }, [user])

  useEffect(() => { loadWithdrawals() }, [loadWithdrawals])

  const handleSubmit = async () => {
    const val = parseFloat(amount.replace(',', '.'))
    if (isNaN(val) || val < 50) { setFormError('Valor mínimo: R$50,00'); return }
    if (val > balance)           { setFormError('Saldo insuficiente'); return }
    if (!pixKey.trim())          { setFormError('Informe a chave PIX'); return }
    if (!realAccount)            { setFormError('Conta REAL não encontrada'); return }
    if (hasPending)              { setFormError('Você já tem uma retirada pendente. Aguarde a aprovação.'); return }

    setSubmitting(true)
    setFormError(null)
    const { error } = await supabase.rpc('request_withdrawal', {
      p_account_id:   realAccount.id,
      p_amount:       val,
      p_pix_key_type: pixKeyType,
      p_pix_key:      pixKey.trim(),
    })
    setSubmitting(false)

    if (error) { setFormError(error.message); return }
    setAmount('')
    setPixKey('')
    await loadWithdrawals()
    await useAuthStore.getState().refreshAccounts()
  }

  const handleCancel = async (id: string) => {
    setCancellingId(id)
    await supabase.rpc('cancel_withdrawal', { p_withdrawal_id: id })
    setCancellingId(null)
    await loadWithdrawals()
    await useAuthStore.getState().refreshAccounts()
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex min-h-full">

        {/* Left — saldo */}
        <div className="w-[260px] flex-shrink-0 px-6 py-6 border-r border-[#2a2e3b]">
          <p className="text-sm font-semibold text-white mb-5">Conta REAL:</p>
          <div className="mb-4">
            <div className="text-xs text-[#8b8f9a] mb-1">Na conta:</div>
            <div className="text-2xl font-bold text-white">R$ {fmtBRL(balance)}</div>
          </div>
          <div className="border-t border-dashed border-[#2a2e3b] my-4" />
          <div>
            <div className="text-xs text-[#8b8f9a] mb-1">Disponível para retirada:</div>
            <div className="text-2xl font-bold text-white">R$ {fmtBRL(balance)}</div>
          </div>
          <div className="mt-6 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Landmark size={13} className="text-green-400" />
              <span className="text-xs text-[#8b8f9a]">Mínimo: <span className="text-green-400 font-semibold">R$50</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Zap size={13} className="text-orange-400" />
              <span className="text-xs text-[#8b8f9a]">Aprovação em até 48h</span>
            </div>
          </div>
        </div>

        {/* Middle — formulário + histórico */}
        <div className="flex-1 px-6 py-6 border-r border-[#2a2e3b] flex flex-col gap-6">

          {/* Aviso se já tem pendente */}
          {hasPending && (
            <div className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#ccc] leading-relaxed">
                Você possui uma retirada aguardando aprovação. Aguarde o processamento antes de solicitar uma nova.
              </p>
            </div>
          )}

          {/* Formulário */}
          {!hasPending && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-white">Solicitar retirada via PIX:</p>

              {/* Tipo de chave */}
              <div>
                <label className="text-[10px] font-bold text-[#8b8f9a] tracking-widest block mb-1.5">TIPO DE CHAVE PIX</label>
                <div className="flex gap-2 flex-wrap">
                  {PIX_KEY_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setPixKeyType(t.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                        pixKeyType === t.value
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-[#1a1e2e] border-[#2a2e3b] text-[#8b8f9a] hover:text-white'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chave PIX */}
              <div className="border border-[#2a2e3b] rounded-xl px-4 py-3 bg-[#1a1e2e] focus-within:border-blue-500/50 transition-colors">
                <div className="text-[10px] font-bold text-[#8b8f9a] tracking-widest mb-1">CHAVE PIX</div>
                <input
                  type="text"
                  value={pixKey}
                  onChange={e => { setPixKey(e.target.value); setFormError(null) }}
                  placeholder={pixKeyType === 'cpf' ? '000.000.000-00' : pixKeyType === 'email' ? 'seu@email.com' : pixKeyType === 'phone' ? '+55 11 9 0000-0000' : 'Cole a chave aqui'}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder-[#3a3f50]"
                />
              </div>

              {/* Valor */}
              <div className="border border-[#2a2e3b] rounded-xl px-4 py-3 bg-[#1a1e2e] focus-within:border-blue-500/50 transition-colors flex items-center gap-2">
                <span className="text-sm font-semibold text-[#8b8f9a]">R$</span>
                <input
                  type="number"
                  min={50}
                  step={1}
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setFormError(null) }}
                  placeholder="0,00"
                  className="flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder-[#3a3f50]"
                />
                <button
                  onClick={() => setAmount(String(Math.floor(balance)))}
                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300"
                >
                  MAX
                </button>
              </div>

              {formError && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                  <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
                  <span className="text-xs text-red-400">{formError}</span>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !amount || !pixKey}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-white text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={15} className="animate-spin" />}
                {submitting ? 'Enviando…' : 'Solicitar retirada'}
              </button>
            </div>
          )}

          <div className="border-t border-dashed border-[#2a2e3b]" />

          {/* Histórico */}
          <div>
            <p className="text-sm font-semibold text-white mb-3">Pedidos recentes:</p>
            {loadingList ? (
              <div className="flex items-center gap-2 text-[#8b8f9a]">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Carregando…</span>
              </div>
            ) : withdrawals.length === 0 ? (
              <p className="text-xs text-[#8b8f9a]">Nenhuma retirada solicitada ainda.</p>
            ) : (
              <div className="flex flex-col">
                {withdrawals.map(w => (
                  <div key={w.id}>
                    <button
                      onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                      className="w-full flex items-center gap-4 py-3 text-left hover:bg-white/3 transition-colors border-b border-[#2a2e3b]/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-[#8b8f9a] font-mono">{w.id.slice(0, 8).toUpperCase()}</span>
                          <span className="text-[10px] text-[#8b8f9a]">{fmtDate(w.created_at)}</span>
                        </div>
                        <WithdrawalStatusBadge status={w.status} />
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-red-400">-R$ {fmtBRL(w.amount)}</div>
                        <div className="text-[10px] text-[#8b8f9a]">PIX · {PIX_KEY_TYPES.find(t => t.value === w.pix_key_type)?.label}</div>
                      </div>
                    </button>

                    {expandedId === w.id && (
                      <div className="bg-[#1a1e2e] border border-[#2a2e3b] rounded-xl px-4 py-3 mx-2 mb-2 mt-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] text-[#8b8f9a]">Chave PIX:</span>
                          <span className="text-xs text-white font-mono">{w.pix_key}</span>
                        </div>
                        {w.admin_notes && (
                          <p className="text-xs text-[#ccc] mb-2">{w.admin_notes}</p>
                        )}
                        {w.status === 'pending' && (
                          <p className="text-xs text-[#8b8f9a] mb-3">
                            Sua solicitação está aguardando aprovação do administrador. Prazo: até 48h úteis.
                          </p>
                        )}
                        {w.status === 'pending' && (
                          <button
                            onClick={() => handleCancel(w.id)}
                            disabled={cancellingId === w.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#3a3f50] text-xs font-semibold text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                          >
                            {cancellingId === w.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                            Cancelar solicitação
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — FAQ */}
        <div className="w-[380px] flex-shrink-0 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-white">FAQ:</p>
          </div>
          <div className="flex flex-col gap-3">
            {FAQ_RETIRADA.flat().filter(Boolean).map((q, i) => (
              <button key={i} className="flex items-start gap-2 text-left group">
                <ChevronDown size={13} className="text-[#8b8f9a] mt-0.5 flex-shrink-0 group-hover:text-white transition-colors" />
                <span className="text-xs text-[#8b8f9a] group-hover:text-white transition-colors leading-relaxed">{q}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

export function ContaPage({ initialTab = 'minha-conta' }: { initialTab?: ContaTab }) {
  const [activeTab, setActiveTab] = useState<ContaTab>(initialTab)

  return (
    <div className="flex-1 flex flex-col bg-[#151822] min-h-0 overflow-hidden">

      {/* Top tabs */}
      <div className="flex items-center px-6 border-b border-[#2a2e3b] bg-[#1a1e2e] flex-shrink-0 gap-1">
        {CONTA_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === t.key
                ? 'text-white border-white font-semibold'
                : 'text-[#8b8f9a] border-transparent hover:text-white'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Balance info bar */}
      <div className="flex items-center justify-end gap-8 px-6 py-3 border-b border-[#2a2e3b] bg-[#1a1e2e] flex-shrink-0">
        {activeTab === 'minha-conta' && (
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-xs text-[#8b8f9a]">Minha moeda atual</span>
            <span className="text-sm font-bold text-white">R$ BRL</span>
            <button className="text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded">MUDAR</button>
          </div>
        )}
        <div className="text-right">
          <div className="text-xs text-[#8b8f9a]">Disponível para retirada</div>
          <div className="text-sm font-bold text-white">108.289,70 R$</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[#8b8f9a]">Na conta</div>
          <div className="text-sm font-bold text-white">108.289,70 R$</div>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'retirada' && <RetiradaTab />}
      {activeTab === 'transacoes' && <TransacoesTab />}
      {activeTab === 'operacoes' && <OperacoesTab />}
      {activeTab === 'verificacao' && <VerificacaoTab />}

      {activeTab === 'minha-conta' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex gap-0 h-full">

            {/* Left — Dados pessoais */}
            <div className="flex-1 max-w-[540px] px-8 py-6 border-r border-[#2a2e3b]">
              <p className="text-sm font-semibold text-white mb-5">Dados pessoais:</p>

              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-9 h-9 text-blue-400 fill-current">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                    </svg>
                  </div>
                  <button className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#2a2e3b] border border-[#3a3f50] flex items-center justify-center hover:bg-[#3a3f50] transition-colors">
                    <Camera size={11} className="text-[#8b8f9a]" />
                  </button>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">janielmadeira@gmail.com</div>
                  <div className="text-xs text-[#8b8f9a] mt-0.5">ID: 10000001</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle2 size={12} className="text-green-400" />
                    <span className="text-xs font-semibold text-green-400">Verificado</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <FloatingInput label="Apelido" value="Janiel" />
                <FloatingInput label="Nome" value="Janiel" />
                <FloatingInput label="Sobrenome" value="Madeira" />
                <FloatingInput label="Data de nascimento" value="" />
                <FloatingInput label="CPF" value="" />
                <FloatingInput label="Email" value="janielmadeira@gmail.com" rightLabel="Verificado" />
                <FloatingSelect label="País" value="Brasil" />
                <FloatingInput label="Endereço" value="" />
              </div>

              <button className="mt-5 w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-bold text-white">
                Salvar
              </button>
            </div>

            {/* Middle — Segurança */}
            <div className="flex-1 max-w-[480px] px-8 py-6 border-r border-[#2a2e3b]">
              <p className="text-sm font-semibold text-white mb-5">Segurança:</p>

              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-white">Verificação em duas etapas</span>
                </div>
                <div className="flex items-center gap-2 ml-6">
                  <span className="text-xs text-[#8b8f9a]">Recebimento de códigos por email</span>
                  <button className="text-[#8b8f9a] hover:text-white transition-colors">
                    <Pencil size={11} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4 mb-6">
                <Toggle label="Para entrar na plataforma" defaultOn={true} />
                <Toggle label="Para retirar fundos" defaultOn={true} />
              </div>

              <div className="border-t border-[#2a2e3b] pt-5">
                <div className="flex items-start gap-3">
                  <Lock size={16} className="text-[#8b8f9a] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-white mb-0.5">Senha</div>
                    <div className="text-xs text-[#8b8f9a] mb-1.5">Alterar a senha da sua conta</div>
                    <button className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors">
                      Mudar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — Idioma + Fuso + Excluir */}
            <div className="flex-1 px-8 py-6">
              <div className="mb-4">
                <div className="border border-[#2a2e3b] rounded-lg overflow-hidden">
                  <div className="px-4 py-2 border-b border-[#2a2e3b]">
                    <span className="text-[10px] text-[#8b8f9a] font-medium">Idioma</span>
                  </div>
                  <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <Globe size={15} className="text-[#8b8f9a]" />
                      <span className="text-sm text-white">Português</span>
                    </div>
                    <ChevronDown size={14} className="text-[#8b8f9a]" />
                  </button>
                </div>
              </div>

              <div className="mb-8">
                <div className="border border-[#2a2e3b] rounded-lg overflow-hidden">
                  <div className="px-4 py-2 border-b border-[#2a2e3b]">
                    <span className="text-[10px] text-[#8b8f9a] font-medium">Fuso horário</span>
                  </div>
                  <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <Clock size={15} className="text-[#8b8f9a]" />
                      <span className="text-sm text-white">(UTC-03:00)</span>
                    </div>
                    <ChevronDown size={14} className="text-[#8b8f9a]" />
                  </button>
                </div>
              </div>

              <button className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors">
                <X size={14} />
                <span className="text-sm font-semibold">Excluir minha conta</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'analise' && <AnalisePage />}

      {activeTab !== 'minha-conta' && activeTab !== 'retirada' && activeTab !== 'transacoes' && activeTab !== 'operacoes' && activeTab !== 'analise' && activeTab !== 'verificacao' && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[#8b8f9a]">Em breve</p>
        </div>
      )}

    </div>
  )
}
