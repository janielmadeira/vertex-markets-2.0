'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Brain, Users, Wallet, TrendingUp, ShieldCheck,
  ArrowDownCircle, ArrowUpCircle, MessageSquare, UserPlus, Copy,
  Trophy, Gift, Zap, BarChart2, Clock, Cpu, Settings, ChevronRight,
  LogOut, Lock, FileSearch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useRouter } from 'next/navigation'

const NAV = [
  { label: 'Dashboard',      href: '/admin',                icon: LayoutDashboard },
  { label: 'Análise IA',     href: '/admin/analise-ia',     icon: Brain },
  { label: 'Usuários',       href: '/admin/usuarios',       icon: Users },
  { label: 'Carteira',       href: '/admin/carteira',       icon: Wallet },
  { label: 'Operações',      href: '/admin/operacoes',      icon: TrendingUp },
  { label: 'Verificação',    href: '/admin/verificacao',    icon: ShieldCheck },
  { label: 'Depósitos',      href: '/admin/depositos',      icon: ArrowDownCircle },
  { label: 'Saques',         href: '/admin/saques',         icon: ArrowUpCircle },
  { label: 'Tickets',        href: '/admin/tickets',        icon: MessageSquare },
  { label: 'Afiliados',      href: '/admin/afiliados',      icon: UserPlus },
  { label: 'Copy Trading',   href: '/admin/copy-trading',   icon: Copy },
  { label: 'Níveis',         href: '/admin/niveis',         icon: Trophy },
  { label: 'Bônus',          href: '/admin/bonus',          icon: Gift },
  { label: 'Boosters',       href: '/admin/boosters',       icon: Zap },
  { label: 'Ativos',         href: '/admin/ativos',         icon: BarChart2 },
  { label: 'Horário Mercado',href: '/admin/horario',        icon: Clock },
  { label: 'Cadastro OTC',   href: '/admin/otc',            icon: Cpu },
  { label: 'Ranking',        href: '/admin/ranking',        icon: Trophy },
  { label: 'Segurança (2FA)',href: '/admin/seguranca/2fa',  icon: Lock },
  { label: 'Audit Log',      href: '/admin/audit-log',      icon: FileSearch },
  { label: 'Configurações',  href: '/admin/configuracoes',  icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <aside className="w-[210px] flex-shrink-0 bg-[#0d1117] border-r border-[#1e2433] flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#1e2433]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
            <LayoutDashboard size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">Admin Panel</div>
            <div className="text-[10px] text-[#4b5563]">Gerenciamento</div>
          </div>
        </div>
      </div>

      {/* Fatura card */}
      <div className="mx-3 mt-3 mb-1 rounded-xl bg-[#1a1200] border border-yellow-600/30 px-3 py-2.5">
        <div className="text-[9px] font-bold text-yellow-500 tracking-widest mb-1">FATURA</div>
        <div className="text-base font-bold text-yellow-400">R$ 387,50</div>
        <div className="text-[9px] text-yellow-600 mt-0.5">18/05/2026 · 1d restante</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {NAV.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-[13px] font-medium transition-colors group',
              isActive(href)
                ? 'bg-green-500/15 text-green-400'
                : 'text-[#6b7280] hover:text-white hover:bg-white/5'
            )}
          >
            <Icon size={15} className={cn('flex-shrink-0', isActive(href) ? 'text-green-400' : 'text-[#4b5563] group-hover:text-white')} />
            <span className="flex-1 leading-tight">{label}</span>
            {isActive(href) && <ChevronRight size={12} className="text-green-400 flex-shrink-0" />}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-2 pb-4 border-t border-[#1e2433] pt-2">
        <button
          onClick={() => { useAuthStore.getState().logout(); router.replace('/') }}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg w-full text-[13px] font-medium text-[#6b7280] hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut size={15} className="flex-shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  )
}
