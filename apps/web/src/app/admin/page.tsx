'use client'

import { useState } from 'react'
import {
  DollarSign, ArrowUpCircle, Receipt, TrendingUp,
  Wallet, Gift, BarChart2, Users, Layers,
  TrendingDown, Activity, RefreshCw, Calendar,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'
import {
  type Period, getStats, PERF_SERIES, RESULT_DIST, VOLUME_BY_ASSET, ACTIVE_USERS,
} from '@/components/admin/mockData'

/* ── helpers ── */
function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* ── Period filter ── */
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today',     label: 'Hoje'   },
  { key: 'yesterday', label: 'Ontem'  },
  { key: '7d',        label: '7 dias' },
  { key: '15d',       label: '15 dias'},
  { key: '30d',       label: '30 dias'},
]

function PeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-[#6b7280] mr-1">Período:</span>
      {PERIODS.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border',
            value === p.key
              ? 'bg-green-500 border-green-400 text-white'
              : 'bg-[#151c2c] border-[#1e2433] text-[#6b7280] hover:text-white hover:border-[#2a3448]'
          )}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1 ml-1">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[#1e2433] bg-[#151c2c] text-[#6b7280] hover:text-white transition-colors">
          <Calendar size={11} /> De
        </button>
        <span className="text-[#4b5563] text-xs">até</span>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[#1e2433] bg-[#151c2c] text-[#6b7280] hover:text-white transition-colors">
          <Calendar size={11} /> Até
        </button>
      </div>
    </div>
  )
}

/* ── Metric Card ── */
interface CardProps {
  title:       string
  value:       string
  sub?:        string
  icon:        React.ReactNode
  iconBg:      string
  valueColor?: string
  highlight?:  boolean
}

function MetricCard({ title, value, sub, icon, iconBg, valueColor = 'text-white', highlight }: CardProps) {
  return (
    <div className={cn(
      'relative bg-[#111827] border rounded-xl px-5 py-4 flex flex-col justify-between min-h-[100px]',
      highlight ? 'border-green-500/30' : 'border-[#1e2433]'
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-[#6b7280] font-medium mb-2 leading-tight">{title}</div>
          <div className={cn('text-xl font-bold leading-tight', valueColor)}>{value}</div>
          {sub && <div className="text-[10px] text-[#4b5563] mt-1 leading-tight">{sub}</div>}
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ml-3', iconBg)}>
          {icon}
        </div>
      </div>
    </div>
  )
}

/* ── Tooltip custom ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a2235] border border-[#2a3448] rounded-xl px-3 py-2 shadow-2xl">
      <p className="text-[11px] text-[#6b7280] mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[11px] text-[#9ca3af]">{p.name}:</span>
          <span className="text-[11px] font-bold text-white">R$ {fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Section title ── */
function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-green-400">{icon}</div>
      <h3 className="text-sm font-bold text-white">{title}</h3>
    </div>
  )
}

/* ── Main page ── */
export default function AdminDashboard() {
  const [period, setPeriod] = useState<Period>('30d')
  const stats = getStats(period)

  const cards: CardProps[] = [
    {
      title:      'Total Depósitos',
      value:      `R$ ${fmtBRL(stats.totalDeposits)}`,
      icon:       <DollarSign size={16} className="text-white" />,
      iconBg:     'bg-green-500',
      valueColor: 'text-green-400',
      highlight:  true,
    },
    {
      title:  'Total Saques',
      value:  `R$ ${fmtBRL(stats.totalWithdrawals)}`,
      icon:   <ArrowUpCircle size={16} className="text-white" />,
      iconBg: 'bg-red-500',
    },
    {
      title:  'Ticket Médio',
      value:  `R$ ${fmtBRL(stats.avgTicket)}`,
      icon:   <Receipt size={16} className="text-white" />,
      iconBg: 'bg-blue-500',
    },
    {
      title:      'Fluxo Líquido',
      value:      `R$ ${fmtBRL(stats.netFlow)}`,
      icon:       <TrendingUp size={16} className="text-white" />,
      iconBg:     'bg-purple-500',
      valueColor: stats.netFlow >= 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      title:  'Saldo Total Usuários',
      value:  `R$ ${fmtBRL(stats.totalUserBalance)}`,
      icon:   <Wallet size={16} className="text-white" />,
      iconBg: 'bg-teal-500',
    },
    {
      title:  'Bônus Total Usuários',
      value:  `R$ ${fmtBRL(stats.totalBonus)}`,
      icon:   <Gift size={16} className="text-white" />,
      iconBg: 'bg-orange-500',
    },
    {
      title:  'Saldo + Bônus',
      value:  `R$ ${fmtBRL(stats.balanceAndBonus)}`,
      icon:   <BarChart2 size={16} className="text-white" />,
      iconBg: 'bg-indigo-500',
    },
    {
      title:  'Total Usuários',
      value:  String(stats.totalUsers.toLocaleString('pt-BR')),
      sub:    `+${stats.newUsersToday} ${period === 'today' ? 'hoje' : 'no período'}`,
      icon:   <Users size={16} className="text-white" />,
      iconBg: 'bg-pink-500',
    },
    {
      title:  'Valor Apostado',
      value:  `R$ ${fmtBRL(stats.totalWagered)}`,
      icon:   <Layers size={16} className="text-white" />,
      iconBg: 'bg-amber-500',
    },
    {
      title:      'Ganhos Plataforma',
      value:      `R$ ${fmtBRL(stats.platformGains)}`,
      sub:        'Perdas dos usuários',
      icon:       <TrendingUp size={16} className="text-white" />,
      iconBg:     'bg-green-600',
      valueColor: 'text-green-400',
    },
    {
      title:      'Perdas Plataforma',
      value:      `R$ ${fmtBRL(stats.platformLosses)}`,
      sub:        'Ganhos dos usuários',
      icon:       <TrendingDown size={16} className="text-white" />,
      iconBg:     'bg-red-600',
      valueColor: 'text-red-400',
    },
    {
      title:      'Resultado Plataforma',
      value:      `R$ ${fmtBRL(stats.platformResult)}`,
      sub:        'Ganhos - Perdas',
      icon:       <Activity size={16} className="text-white" />,
      iconBg:     'bg-emerald-500',
      valueColor: stats.platformResult >= 0 ? 'text-green-400' : 'text-red-400',
      highlight:  true,
    },
  ]

  return (
    <div className="p-6 min-h-full">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Visão geral da plataforma</p>
        </div>
        <button
          onClick={() => setPeriod(period)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-sm font-semibold text-[#9ca3af] hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {/* Period filter */}
      <div className="mb-6">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {cards.map((c, i) => <MetricCard key={i} {...c} />)}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-4 mb-4">

        {/* Desempenho 7 dias */}
        <div className="col-span-2 bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<Activity size={15} />} title="Desempenho dos Últimos 7 Dias" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={PERF_SERIES} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gGains" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gLosses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gResult" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area type="monotone" dataKey="gains"  name="Ganhos"    stroke="#22c55e" fill="url(#gGains)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="losses" name="Perdas"    stroke="#ef4444" fill="url(#gLosses)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="result" name="Resultado" stroke="#6366f1" fill="url(#gResult)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Distribuição resultados */}
        <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<BarChart2 size={15} />} title="Distribuição de Resultados" />
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={RESULT_DIST}
                cx="50%" cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {RESULT_DIST.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ background: '#1a2235', border: '1px solid #2a3448', borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-1.5 mt-2">
            {RESULT_DIST.map((d, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-[11px] text-[#9ca3af]">{d.name}</span>
                </div>
                <span className="text-[11px] font-bold text-white">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-2 gap-4 mb-4">

        {/* Depósitos vs Saques */}
        <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<DollarSign size={15} />} title="Depósitos vs Saques" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={PERF_SERIES} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="deposits"    name="Depósitos" fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="withdrawals" name="Saques"    fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Usuários ativos */}
        <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<Users size={15} />} title="Usuários Ativos por Dia" />
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={ACTIVE_USERS} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1a2235', border: '1px solid #2a3448', borderRadius: 8, fontSize: 11 }} />
              <Area type="monotone" dataKey="users" name="Usuários ativos" stroke="#6366f1" fill="url(#gUsers)" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 3 */}
      <div className="grid grid-cols-1 gap-4">
        {/* Volume por ativo */}
        <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<Layers size={15} />} title="Volume Apostado por Ativo" />
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={VOLUME_BY_ASSET} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="asset" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={{ background: '#1a2235', border: '1px solid #2a3448', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => `R$ ${fmtBRL(v)}`} />
              <Bar dataKey="volume" name="Volume" fill="#f59e0b" radius={[0,4,4,0]}>
                {VOLUME_BY_ASSET.map((_, i) => (
                  <Cell key={i} fill={`hsl(${160 + i * 20}, 70%, 50%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}
