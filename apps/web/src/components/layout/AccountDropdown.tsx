'use client'

import { useEffect, useRef } from 'react'
import { Eye, RefreshCw, Pencil, LogOut, ArrowRightLeft, Clock, BarChart2, User, Gem } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccountDropdownProps {
  isDemo: boolean
  onSelectDemo: () => void
  onSelectReal: () => void
  demoBalance: number
  realBalance: number
  onClose: () => void
}

const menuItems = [
  { label: 'Depósito', href: '#' },
  { label: 'Retirada', href: '#' },
  { label: 'Transações', href: '#', icon: <ArrowRightLeft size={14} /> },
  { label: 'Operações', href: '#', icon: <BarChart2 size={14} /> },
  { label: 'Minha Conta', href: '#', icon: <User size={14} /> },
]

export function AccountDropdown({
  isDemo,
  onSelectDemo,
  onSelectReal,
  demoBalance,
  realBalance,
  onClose,
}: AccountDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 z-50 flex shadow-2xl rounded-xl overflow-hidden border border-[#2a2e3b]"
      style={{ minWidth: 480 }}
    >
      {/* Left panel — account info */}
      <div className="bg-[#1a1e2e] w-[272px] flex-shrink-0 p-4 flex flex-col gap-3">
        {/* VIP row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gem size={16} className="text-purple-400" />
            <span className="text-xs text-[#8b8f9a] font-medium">VIP:</span>
            <span className="text-xs text-white font-semibold">+4% de lucro</span>
          </div>
          <button className="text-[#8b8f9a] hover:text-white transition-colors">
            <Eye size={14} />
          </button>
        </div>

        {/* User info */}
        <div>
          <div className="text-sm text-white font-medium">usuario@vertexmarkets.com</div>
          <div className="text-xs text-[#8b8f9a] mt-0.5">ID: 00000001</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-[#8b8f9a]">Moeda: BRL</span>
            <button className="text-[10px] font-bold text-blue-400 border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 rounded hover:bg-blue-500/20 transition-colors">
              MUDAR
            </button>
          </div>
        </div>

        <div className="h-px bg-[#2a2e3b]" />

        {/* Real account */}
        <button
          onClick={onSelectReal}
          className={cn(
            'w-full text-left rounded-lg p-3 transition-colors border',
            !isDemo
              ? 'border-blue-500/40 bg-blue-500/5'
              : 'border-transparent hover:bg-white/5'
          )}
        >
          <div className="flex items-center gap-2.5">
            {/* Radio */}
            <span className={cn(
              'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
              !isDemo ? 'border-blue-500' : 'border-[#4a4f5e]'
            )}>
              {!isDemo && <span className="w-2 h-2 rounded-full bg-blue-500" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">Conta real</div>
              <div className="text-sm font-bold text-white mt-0.5">
                R${realBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-[#8b8f9a] mt-1">O limite diário não está definido</div>
              <button className="text-[10px] font-bold text-blue-400 mt-0.5 hover:text-blue-300 transition-colors tracking-wide">
                DEFINIR O LIMITE
              </button>
            </div>
          </div>
        </button>

        {/* Demo account */}
        <button
          onClick={onSelectDemo}
          className={cn(
            'w-full text-left rounded-lg p-3 transition-colors border',
            isDemo
              ? 'border-blue-500/40 bg-blue-500/5'
              : 'border-transparent hover:bg-white/5'
          )}
        >
          <div className="flex items-center gap-2.5">
            {/* Radio */}
            <span className={cn(
              'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
              isDemo ? 'border-blue-500 bg-blue-500' : 'border-[#4a4f5e]'
            )}>
              {isDemo && (
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                  <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Conta demo</div>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="text-[#8b8f9a] hover:text-white transition-colors"
                >
                  <Pencil size={12} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-bold text-white">
                  R${demoBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="text-[#8b8f9a] hover:text-white transition-colors"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Right panel — navigation */}
      <div className="bg-[#141720] w-[180px] flex-shrink-0 flex flex-col py-2">
        {menuItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
          >
            {item.label}
          </a>
        ))}

        <div className="h-px bg-[#2a2e3b] mx-4 my-2" />

        <button className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors w-full text-left">
          <LogOut size={14} />
          Sair
        </button>
      </div>
    </div>
  )
}
