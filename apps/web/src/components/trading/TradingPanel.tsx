'use client'

import { useState, useEffect } from 'react'
import { Minus, Plus, ArrowUp, ArrowDown, RefreshCw, ChevronDown, ChevronUp, ArrowLeftRight, Package } from 'lucide-react'
import { type Asset, type OpenTrade, MOCK_OPEN_TRADES } from '@/lib/mockData'
import { cn } from '@/lib/utils'
import { FlagPair } from '@/components/ui/FlagPair'
import { api } from '@/lib/api'

interface TradingPanelProps {
  asset: Asset
  oneClickTrade?: boolean
  shortLabels?: boolean
  mobile?: boolean
  accountId?: string
  onTradePlaced?: () => void
}

const TIME_OPTIONS = [30, 60, 120, 180, 300, 600, 900, 1800, 3600]

function fmtMoney(v: number) {
  return v.toLocaleString('en-US')
}

function FloatingBox({ label, link, children }: {
  label: string
  link?: string
  children: React.ReactNode
}) {
  return (
    <div className="px-3 pt-3 pb-1">
      <div className="relative border border-[#2a2e3b] rounded-lg px-3 py-2.5">
        <span className="absolute -top-[9px] left-3 px-1 text-[10px] font-medium text-[#8b8f9a] bg-[#1d2130]">
          {label}
        </span>
        {children}
      </div>
      {link && (
        <p className="text-center mt-1">
          <button className="text-[10px] font-bold text-blue-400 hover:text-blue-300 tracking-widest transition-colors">
            {link}
          </button>
        </p>
      )}
    </div>
  )
}

function TradeItem({ trade, shortLabels }: { trade: OpenTrade; shortLabels: boolean }) {
  const [elapsed, setElapsed] = useState(trade.timeLeft)

  useEffect(() => {
    const t = setInterval(() => setElapsed(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const h = Math.floor(elapsed / 3600).toString().padStart(2, '0')
  const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0')
  const s = (elapsed % 60).toString().padStart(2, '0')

  const name = trade.asset.label.length > 13 ? trade.asset.label.slice(0, 13) + '...' : trade.asset.label

  return (
    <div className="px-2 mb-px">
      <div className="px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group">
        <div className="flex items-center gap-1.5">
          <ChevronDown size={11} className="text-[#8b8f9a] flex-shrink-0 group-hover:text-white transition-colors" />
          <FlagPair code1={trade.asset.code1} code2={trade.asset.code2} size={15} />
          <span className="flex-1 text-[12px] font-semibold text-white truncate">
            {shortLabels ? name : trade.asset.label}
          </span>
          <span className="text-[11px] font-mono text-[#8b8f9a] flex-shrink-0">{h}:{m}:{s}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 pl-5">
          <span className={cn(
            'w-3 h-3 rounded-full flex-shrink-0',
            trade.direction === 'CALL' ? 'bg-green-500' : 'bg-red-500'
          )} />
          <span className="text-[11px] text-[#8b8f9a] flex-1">{fmtMoney(trade.amount)} R$</span>
          <span className={cn(
            'text-[11px] font-bold',
            trade.profit > 0 ? 'text-green-400' : 'text-[#8b8f9a]'
          )}>
            {trade.profit > 0 ? `+${trade.profit.toFixed(2)}` : '0.00'} R$
          </span>
        </div>
      </div>
    </div>
  )
}

export function TradingPanel({ asset, oneClickTrade = true, shortLabels = true, mobile = false, accountId, onTradePlaced }: TradingPanelProps) {
  const [investment, setInvestment] = useState(15000)
  const [investmentRaw, setInvestmentRaw] = useState('')
  const [editingInvestment, setEditingInvestment] = useState(false)
  const [timeIndex, setTimeIndex] = useState(6) // 900s = 15:00
  const [timeRaw, setTimeRaw] = useState('')
  const [editingTime, setEditingTime] = useState(false)
  const [pendingEnabled, setPendingEnabled] = useState(false)
  const [openTrades] = useState<OpenTrade[]>(MOCK_OPEN_TRADES)
  const [confirmTrade, setConfirmTrade] = useState<'CALL' | 'PUT' | null>(null)
  const [activeTab, setActiveTab] = useState<'operacoes' | 'pedidos'>('pedidos')
  const [placing, setPlacing] = useState(false)
  const [tradeError, setTradeError] = useState('')

  const payout  = asset.payout / 100
  const payment = Math.round(investment + investment * payout)

  function commitInvestment(raw: string) {
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''))
    if (!isNaN(num) && num >= 1) setInvestment(Math.round(num))
    setEditingInvestment(false)
  }

  function commitTime(raw: string) {
    // Accept formats: "MM:SS", "MM", seconds number
    const trimmed = raw.trim()
    let secs = 0
    if (trimmed.includes(':')) {
      const [mm, ss] = trimmed.split(':').map(Number)
      secs = (mm || 0) * 60 + (ss || 0)
    } else {
      secs = parseInt(trimmed) * 60 // treat as minutes
    }
    if (secs > 0) {
      // Find closest TIME_OPTIONS index
      const closest = TIME_OPTIONS.reduce((best, opt, i) =>
        Math.abs(opt - secs) < Math.abs(TIME_OPTIONS[best] - secs) ? i : best, 0)
      setTimeIndex(closest)
    }
    setEditingTime(false)
  }

  async function placeTrade(direction: 'CALL' | 'PUT') {
    if (!accountId) return
    setTradeError('')
    setPlacing(true)
    try {
      await api.post('/operations', {
        accountId,
        assetId:          asset.id,
        assetSymbol:      asset.label,
        direction,
        amount:           investment,
        payout:           asset.payout,
        entryPrice:       asset.price,
        expiresInSeconds: TIME_OPTIONS[timeIndex],
      })
      onTradePlaced?.()
      setConfirmTrade(null)
    } catch (err: any) {
      const code = err.response?.data?.error
      if (code === 'INSUFFICIENT_BALANCE') setTradeError('Saldo insuficiente.')
      else setTradeError('Erro ao abrir operação.')
    } finally {
      setPlacing(false)
    }
  }

  const totalSeconds = TIME_OPTIONS[timeIndex]
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const ss = (totalSeconds % 60).toString().padStart(2, '0')
  const timeDisplay = `${mm}:${ss}`

  function adjustInvestment(delta: number) {
    setInvestment(v => Math.max(1000, v + delta))
  }

  function adjustTime(delta: number) {
    setTimeIndex(i => Math.max(0, Math.min(TIME_OPTIONS.length - 1, i + delta)))
  }

  return (
    <aside className={cn(mobile ? 'w-full' : 'w-[280px] flex-shrink-0 border-l border-[#2a2e3b]', 'flex flex-col bg-[#1d2130] overflow-hidden')}>

      {/* Asset header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e3b]">
        <div className="flex items-center gap-2 min-w-0">
          <FlagPair code1={asset.code1} code2={asset.code2} size={20} />
          <span className="text-sm font-bold text-white truncate">{asset.label}</span>
        </div>
        <span className="text-base font-bold text-green-400 flex-shrink-0 ml-2">{asset.payout}%</span>
      </div>

      {/* Negociação Pendente */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2e3b]">
        <div className="flex items-center gap-2">
          <RefreshCw size={12} className="text-blue-400 flex-shrink-0" />
          <span className="text-[10px] font-bold text-[#8b8f9a] tracking-widest">NEGOCIAÇÃO PENDENTE</span>
        </div>
        <button
          onClick={() => setPendingEnabled(v => !v)}
          className={cn(
            'w-10 h-5 rounded-full relative transition-colors flex-shrink-0',
            pendingEnabled ? 'bg-blue-500' : 'bg-[#3a3f50]'
          )}
        >
          <span className={cn(
            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
            pendingEnabled ? 'translate-x-5' : 'translate-x-0.5'
          )} />
        </button>
      </div>

      {/* Tempo */}
      <FloatingBox label="Tempo" link="TEMPO DE COMUTAÇÃO">
        <div className="flex items-center gap-2">
          <button
            onClick={() => adjustTime(-1)}
            disabled={timeIndex === 0}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[#3a3f50] text-[#8b8f9a] hover:text-white hover:border-white/30 transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <Minus size={14} />
          </button>
          <div className="flex-1 text-center">
            {editingTime ? (
              <input
                autoFocus
                type="text"
                value={timeRaw}
                onChange={e => setTimeRaw(e.target.value)}
                onBlur={() => commitTime(timeRaw)}
                onKeyDown={e => { if (e.key === 'Enter') commitTime(timeRaw); if (e.key === 'Escape') setEditingTime(false) }}
                placeholder={timeDisplay}
                className="w-full bg-transparent text-xl font-bold text-white font-mono tracking-wider text-center outline-none border-b border-blue-500 placeholder:text-white/30"
              />
            ) : (
              <button
                onClick={() => { setTimeRaw(''); setEditingTime(true) }}
                className="text-xl font-bold text-white font-mono tracking-wider hover:text-blue-300 transition-colors w-full"
                title="Clique para editar"
              >
                {timeDisplay}
              </button>
            )}
          </div>
          <button
            onClick={() => adjustTime(1)}
            disabled={timeIndex === TIME_OPTIONS.length - 1}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[#3a3f50] text-[#8b8f9a] hover:text-white hover:border-white/30 transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
      </FloatingBox>

      {/* Investimento */}
      <FloatingBox label="Investimento" link="TROCAR">
        <div className="flex items-center gap-2">
          <button
            onClick={() => adjustInvestment(-1000)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[#3a3f50] text-[#8b8f9a] hover:text-white hover:border-white/30 transition-colors flex-shrink-0"
          >
            <Minus size={14} />
          </button>
          <div className="flex-1 text-center">
            {editingInvestment ? (
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={investmentRaw}
                onChange={e => setInvestmentRaw(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => commitInvestment(investmentRaw)}
                onKeyDown={e => { if (e.key === 'Enter') commitInvestment(investmentRaw); if (e.key === 'Escape') setEditingInvestment(false) }}
                placeholder={String(investment)}
                className="w-full bg-transparent text-base font-bold text-white text-center outline-none border-b border-blue-500 placeholder:text-white/30"
              />
            ) : (
              <button
                onClick={() => { setInvestmentRaw(''); setEditingInvestment(true) }}
                className="text-base font-bold text-white hover:text-blue-300 transition-colors w-full"
                title="Clique para editar"
              >
                {fmtMoney(investment)} R$
              </button>
            )}
          </div>
          <button
            onClick={() => adjustInvestment(1000)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[#3a3f50] text-[#8b8f9a] hover:text-white hover:border-white/30 transition-colors flex-shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
      </FloatingBox>

      {/* Pagamento */}
      <div className="flex items-center justify-between px-4 py-2 mt-1">
        <span className="text-sm text-[#8b8f9a]">Pagamento</span>
        <span className="text-sm font-bold text-white">{fmtMoney(payment)} R$</span>
      </div>

      {/* CALL / PUT buttons */}
      <div className="px-3 pb-3 flex flex-col gap-2">
        {confirmTrade ? (
          <div className="flex flex-col gap-2">
            <div className="text-center text-xs text-[#8b8f9a] font-semibold py-1">
              Confirmar{' '}
              <span className={cn('font-bold', confirmTrade === 'CALL' ? 'text-green-400' : 'text-red-400')}>
                {confirmTrade === 'CALL' ? 'Para cima' : 'Para baixo'}
              </span>
              {' '}— {fmtMoney(investment)} R$?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmTrade(null)}
                className="flex-1 h-10 rounded-xl border border-[#3a3f50] text-[#8b8f9a] hover:text-white hover:border-white/30 text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmTrade && placeTrade(confirmTrade)}
                disabled={placing}
                className={cn(
                  'flex-1 h-10 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.98] disabled:opacity-50',
                  confirmTrade === 'CALL' ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500 hover:bg-red-400'
                )}
              >
                {placing ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => oneClickTrade ? placeTrade('CALL') : setConfirmTrade('CALL')}
              disabled={placing}
              className="w-full h-12 rounded-xl bg-green-500 hover:bg-green-400 active:scale-[0.98] transition-all flex items-center justify-between px-5 font-bold text-white text-base shadow-lg shadow-green-900/30 disabled:opacity-50"
            >
              <span>Para cima</span>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <ArrowUp size={16} strokeWidth={2.5} />
              </div>
            </button>
            <button
              onClick={() => oneClickTrade ? placeTrade('PUT') : setConfirmTrade('PUT')}
              disabled={placing}
              className="w-full h-12 rounded-xl bg-red-500 hover:bg-red-400 active:scale-[0.98] transition-all flex items-center justify-between px-5 font-bold text-white text-base shadow-lg shadow-red-900/30 disabled:opacity-50"
            >
              <span>Para baixo</span>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <ArrowDown size={16} strokeWidth={2.5} />
              </div>
            </button>
            {tradeError && <p className="text-red-400 text-xs text-center">{tradeError}</p>}
          </>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-[#2a2e3b]" />

      {/* Tab bar */}
      <div className="flex items-stretch border-b border-[#2a2e3b] flex-shrink-0">
        {/* Operações tab (icon only) */}
        <button
          onClick={() => setActiveTab('operacoes')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors relative',
            activeTab === 'operacoes' ? 'text-white' : 'text-[#8b8f9a] hover:text-white'
          )}
        >
          {activeTab === 'operacoes' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
          )}
          <ArrowLeftRight size={13} />
          <span className="w-5 h-5 rounded-full bg-[#252a3a] flex items-center justify-center text-[9px] font-bold">
            {openTrades.length}
          </span>
        </button>

        {/* Pedidos tab */}
        <button
          onClick={() => setActiveTab('pedidos')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors relative',
            activeTab === 'pedidos' ? 'text-white' : 'text-[#8b8f9a] hover:text-white'
          )}
        >
          {activeTab === 'pedidos' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
          )}
          <span>Pedidos</span>
          <span className="w-5 h-5 rounded-full bg-[#252a3a] flex items-center justify-center text-[9px] font-bold">
            0
          </span>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {activeTab === 'operacoes' ? (
          openTrades.length === 0 ? (
            <EmptyState message="Não há operações abertas." />
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-1.5 mt-1">
                <span className="text-[10px] font-bold text-[#8b8f9a] tracking-wide">20 MAIO</span>
                <div className="w-5 h-5 rounded-full bg-[#252a3a] flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">{openTrades.length}</span>
                </div>
              </div>
              {openTrades.map((trade) => (
                <TradeItem key={trade.id} trade={trade} shortLabels={shortLabels} />
              ))}
            </>
          )
        ) : (
          <EmptyState message={'A lista de pedidos está vazia.\nCrie uma negociação pendente usando o formulário acima.'} />
        )}
      </div>

      {/* Bottom chevron */}
      <div className="flex justify-center py-1.5 border-t border-[#2a2e3b] flex-shrink-0">
        <button className="text-[#3a3f50] hover:text-[#8b8f9a] transition-colors">
          <ChevronUp size={14} />
        </button>
      </div>
    </aside>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
      <div className="w-14 h-14 rounded-full bg-[#252a3a] flex items-center justify-center mb-4">
        <Package size={24} className="text-[#8b8f9a]" />
      </div>
      <p className="text-[13px] text-[#8b8f9a] leading-relaxed whitespace-pre-line">{message}</p>
    </div>
  )
}
