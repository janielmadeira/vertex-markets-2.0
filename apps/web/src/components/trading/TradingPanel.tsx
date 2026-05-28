'use client'

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, ArrowUp, ArrowDown, RefreshCw, ChevronDown, ChevronUp, ArrowLeftRight, Package, X } from 'lucide-react'
import { ASSETS, getOTCPrice, type Asset, type OpenTrade, type ActiveTrade } from '@/lib/mockData'
import { cn } from '@/lib/utils'
import { FlagPair } from '@/components/ui/FlagPair'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { isMarketOpen, nextOpenAt, formatTimeUntil } from '@/lib/marketHours'

interface TradingPanelProps {
  asset: Asset
  oneClickTrade?: boolean
  shortLabels?: boolean
  mobile?: boolean
  accountId?: string
  onTradeOpened?: (trade: ActiveTrade) => void
  onTradeExpired?: (id: string) => void
  livePrice?: number | null
  livePriceRef?: React.MutableRefObject<number | null>
  /** Quando true, esconde o painel visualmente mas mantém estado/timers vivos */
  hidden?: boolean
}

export interface TradingPanelHandle {
  /** Dispara uma operação rápida usando os defaults atuais (investimento + duração) */
  placeTrade: (direction: 'CALL' | 'PUT') => void
  canTrade: boolean
}

interface ClosedTrade {
  id: string
  asset_symbol: string
  direction: 'CALL' | 'PUT'
  amount: number
  payout_pct: number
  entry_price: number
  exit_price: number | null
  status: 'WON' | 'LOST' | 'DRAW'
  profit: number | null
  created_at: string
  closed_at: string | null
}

// Durações em segundos — correspondem aos horários absolutos exibidos como no Quotex
const TIME_OPTIONS = [60, 120, 180, 240, 300, 600, 900, 1800, 2700, 3600, 7200, 10800, 14400]

const BRT_OFFSET = -3 * 3600 // UTC-3 (Horário de Brasília)

function nowBRTSec() {
  return Math.floor(Date.now() / 1000) + BRT_OFFSET
}

function expiryLabel(duration: number, base: number) {
  const ts = base + duration
  const h = Math.floor(ts / 3600) % 24
  const m = Math.floor(ts / 60) % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function TradeItem({ trade, shortLabels, currentPrice, onDoubleUp, onEarlyClose }: {
  trade: OpenTrade
  shortLabels: boolean
  currentPrice?: number
  onDoubleUp: (trade: OpenTrade, remaining: number) => void
  onEarlyClose: (trade: OpenTrade, refund: number) => void
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, trade.expiryTime - Math.floor(Date.now() / 1000)))
  const [expanded, setExpanded] = useState(false)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, trade.expiryTime - Math.floor(Date.now() / 1000)))
    }, 1000)
    return () => clearInterval(t)
  }, [trade.expiryTime])

  const h = Math.floor(remaining / 3600).toString().padStart(2, '0')
  const m = Math.floor((remaining % 3600) / 60).toString().padStart(2, '0')
  const s = (remaining % 60).toString().padStart(2, '0')

  const name = trade.asset.label.length > 13 ? trade.asset.label.slice(0, 13) + '...' : trade.asset.label
  // Saída antecipada: 20% do valor quando há tempo restante, decrescendo até 0
  const decay = trade.duration && trade.duration > 0 ? remaining / trade.duration : 1
  const earlyExitValue = Math.max(1, Math.round(trade.amount * 0.20 * decay))
  const canAct = remaining > 5 && !acting

  // P&L em tempo real
  const isWinning = currentPrice != null
    ? (trade.direction === 'CALL' ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice)
    : null
  const unrealizedPnL = isWinning ? Math.round(trade.amount * (trade.asset.payout / 100)) : 0

  return (
    <div className="px-2 mb-px">
      <div
        className="px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown size={11} className={cn('text-[#8b8f9a] flex-shrink-0 transition-transform', expanded && 'rotate-180')} />
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
          <span className="text-[11px] text-[#8b8f9a] flex-1">R$ {fmtMoney(trade.amount)}</span>
          <span className={cn(
            'text-[11px] font-bold tabular-nums',
            isWinning === null ? 'text-[#8b8f9a]' : isWinning ? 'text-[#26a69a]' : 'text-[#ef5350]'
          )}>
            {isWinning === null ? '—' : isWinning ? `+R$ ${fmtMoney(unrealizedPnL)}` : 'R$ 0,00'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-2 pb-2 flex gap-2">
          <button
            disabled={!canAct}
            onClick={async (e) => {
              e.stopPropagation()
              if (!canAct) return
              setActing(true)
              await onDoubleUp(trade, remaining)
              setActing(false)
            }}
            className="flex-1 h-7 rounded-lg bg-[#252a3a] border border-[#2a2e3b] text-[11px] font-bold text-white hover:border-blue-500/50 transition-colors disabled:opacity-40"
          >
            x2
          </button>
          <button
            disabled={!canAct}
            onClick={async (e) => {
              e.stopPropagation()
              if (!canAct) return
              setActing(true)
              await onEarlyClose(trade, earlyExitValue)
              setActing(false)
            }}
            className="flex-1 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] font-bold text-white transition-colors px-2 disabled:opacity-40"
          >
            Vender agora &nbsp;{fmtMoney(earlyExitValue)} R$
          </button>
        </div>
      )}
    </div>
  )
}

export const TradingPanel = forwardRef<TradingPanelHandle, TradingPanelProps>(function TradingPanel({ asset, oneClickTrade = true, shortLabels = true, mobile = false, accountId, onTradeOpened, onTradeExpired, livePrice, livePriceRef: externalPriceRef, hidden = false }, ref) {
  const [investment, setInvestment] = useState(50)
  const [investmentRaw, setInvestmentRaw] = useState('')
  const [editingInvestment, setEditingInvestment] = useState(false)
  const [timeIndex, setTimeIndex] = useState(4) // 300s = 5 min
  const [timerPickerOpen, setTimerPickerOpen] = useState(false)
  const [nowBRT, setNowBRT] = useState(nowBRTSec)
  const [pendingEnabled, setPendingEnabled] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNowBRT(nowBRTSec()), 1000)
    return () => clearInterval(id)
  }, [])

  // Market hours: re-render a cada minuto pra atualizar countdown
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const marketOpen = isMarketOpen(asset, new Date(nowTick))
  const nextOpen   = !marketOpen ? nextOpenAt(asset, new Date(nowTick)) : null
  const reopenIn   = nextOpen ? formatTimeUntil(nextOpen, new Date(nowTick)) : ''
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([])
  const [confirmTrade, setConfirmTrade] = useState<'CALL' | 'PUT' | null>(null)
  const [activeTab, setActiveTab] = useState<'operacoes' | 'historico' | 'pedidos'>('pedidos')
  const [placing, setPlacing] = useState(false)
  const [tradeError, setTradeError] = useState('')
  const [tradeResult, setTradeResult] = useState<{ direction: 'CALL' | 'PUT'; amount: number; profit: number; won: boolean } | null>(null)

  // Auto-dismiss do popup após 4s — comum em apps de trading, evita acúmulo de cliques
  useEffect(() => {
    if (!tradeResult) return
    const t = setTimeout(() => setTradeResult(null), 4000)
    return () => clearTimeout(t)
  }, [tradeResult])

  // Reconcilia o resultado mostrado no popup com o resultado oficial do banco.
  // Trata o caso comum em que o backend api (service.ts setTimeout) ja liquidou
  // a operacao antes do cliente chamar settle_trade — nesse caso a RPC retorna
  // erro OPERATION_NOT_FOUND e precisamos buscar o status real direto da tabela.
  // So atualiza o popup se tivermos certeza do resultado oficial e ele divergir.
  async function reconcileWithBackend(
    operationId: string,
    exitPrice:   number,
    direction:   'CALL' | 'PUT',
    investment:  number,
    localWon:    boolean,
    localProfit: number,
  ) {
    let backendStatus: 'WON' | 'LOST' | 'DRAW' | null = null
    let backendProfit = 0
    try {
      const { data: result, error } = await supabase.rpc('settle_trade', {
        p_operation_id: operationId,
        p_exit_price:   exitPrice,
      })
      if (error) {
        // OPERATION_NOT_FOUND = backend ja liquidou antes; buscar resultado oficial.
        if (String(error.message ?? '').includes('OPERATION_NOT_FOUND')) {
          const { data: op } = await supabase
            .from('operations')
            .select('status, profit')
            .eq('id', operationId)
            .single()
          if (op && ['WON', 'LOST', 'DRAW'].includes(op.status as string)) {
            backendStatus = op.status as 'WON' | 'LOST' | 'DRAW'
            backendProfit = Number(op.profit ?? 0)
          }
        } else {
          console.warn('[trade] settle_trade erro inesperado:', error.message)
        }
      } else if (result && (result as any).status) {
        const s = String((result as any).status)
        if (['WON', 'LOST', 'DRAW'].includes(s)) {
          backendStatus = s as 'WON' | 'LOST' | 'DRAW'
          backendProfit = Number((result as any).profit ?? 0)
        }
      }
    } catch (err) {
      console.warn('[trade] reconcileWithBackend falhou:', err)
      return
    }

    // Sem resultado oficial — mantem popup local.
    if (!backendStatus) return

    const backendWon = backendStatus === 'WON'
    if (backendWon === localWon && Math.abs(backendProfit - localProfit) < 0.01) return

    setTradeResult({ direction, amount: investment, profit: backendWon ? backendProfit : 0, won: backendWon })
  }

  const refreshAccounts = useAuthStore(s => s.refreshAccounts)

  // Histórico de operações fechadas
  const [history, setHistory] = useState<ClosedTrade[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Mapa de timeouts por trade ID — permite cancelar no early close
  const timeoutMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Preços em tempo real por asset ID para calcular P&L das operações abertas
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (openTrades.length === 0) return

    const update = async () => {
      const now = Math.floor(Date.now() / 1000)
      const next = new Map<string, number>()

      for (const trade of openTrades) {
        const a = trade.asset

        // Ativo atual: usa o preço ao vivo já disponível
        if (a.id === asset.id && livePriceRef.current != null) {
          next.set(a.id, livePriceRef.current)
          continue
        }

        // OTC: calcula localmente (determinístico, sem API)
        if (a.type === 'OTC') {
          next.set(a.id, getOTCPrice(a.id, now, a.price))
          continue
        }

        // Forex/Crypto: busca da API (mantém último valor se falhar)
        try {
          const { REAL_ASSETS } = await import('@/lib/marketSymbols')
          const cfg = REAL_ASSETS[a.id]
          if (!cfg) { next.set(a.id, a.price); continue }
          const res = await fetch(`/api/market/price?symbol=${encodeURIComponent(cfg.symbol)}&source=${cfg.source}`)
          const json = await res.json()
          if (json.price) next.set(a.id, json.price)
          else next.set(a.id, priceMap.get(a.id) ?? a.price)
        } catch {
          next.set(a.id, priceMap.get(a.id) ?? a.price)
        }
      }

      setPriceMap(next)
    }

    update()
    const interval = setInterval(update, 500)
    return () => clearInterval(interval)
  }, [openTrades, asset.id])

  const loadHistory = useCallback(async () => {
    if (!accountId) return
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from('operations')
        .select('id, asset_symbol, direction, amount, payout_pct, entry_price, exit_price, status, profit, created_at, closed_at')
        .eq('account_id', accountId)
        .in('status', ['WON', 'LOST', 'DRAW'])
        .order('closed_at', { ascending: false })
        .limit(50)
      if (error) {
        console.warn('[history] supabase error:', error.message)
      } else {
        setHistory((data ?? []) as ClosedTrade[])
      }
    } catch (err) {
      // Sem try/catch + finally, qualquer falha (rede, auth expirado, RLS)
      // deixava historyLoading=true pra sempre -> "Carregando..." eterno.
      console.warn('[history] fetch failed:', err)
    } finally {
      setHistoryLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (activeTab === 'historico') loadHistory()
  }, [activeTab, loadHistory])

  // Carrega operações abertas ao montar (persiste após refresh da página)
  const loadOpenTrades = useCallback(async () => {
    if (!accountId) return

    const { data, error } = await supabase
      .from('operations')
      .select('id, asset_id, direction, amount, payout_pct, entry_price, expires_at, created_at')
      .eq('account_id', accountId)
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false })

    if (error || !data || data.length === 0) return

    const now = Date.now()
    const toAdd: OpenTrade[] = []

    for (const op of data) {
      const assetObj = ASSETS.find(a => a.id === op.asset_id)
      if (!assetObj) continue

      const expiresAtMs     = new Date(op.expires_at).getTime()
      const createdAtMs     = new Date(op.created_at).getTime()
      const remainingMs     = expiresAtMs - now
      const totalDurationSec = Math.round((expiresAtMs - createdAtMs) / 1000)
      // UTC: usado pelo countdown local (compara com Date.now()/1000)
      const utcExpiryTime   = Math.floor(expiresAtMs / 1000)
      // BRT: usado pelo eixo de tempo do chart (timeline em UTC-3).
      // entryTime e expiryTime precisam ESTAR NO MESMO offset, senao a linha
      // de entrada fica fora do range visivel (estava 3h pra tras).
      const entryTimeChart  = Math.floor(createdAtMs / 1000) + BRT_OFFSET
      const expiryTimeChart = Math.floor(expiresAtMs / 1000) + BRT_OFFSET

      if (remainingMs <= 0) {
        // Já venceu enquanto o usuário estava fora — liquida imediatamente
        supabase.rpc('settle_trade', {
          p_operation_id: op.id,
          p_exit_price:   livePriceRef.current ?? assetObj.price,
        }).then(() => refreshAccounts())
        continue
      }

      // Ainda ativa — recria no estado local (countdown usa UTC)
      toAdd.push({
        id: op.id,
        asset: assetObj,
        direction: op.direction as 'CALL' | 'PUT',
        amount: op.amount,
        profit: 0,
        expiryTime: utcExpiryTime,
        entryPrice: op.entry_price,
        duration: totalDurationSec,
      })

      // Notifica o gráfico (precisa de BRT em ambos os campos)
      onTradeOpened?.({
        id: op.id,
        assetId: assetObj.id,
        entryPrice: op.entry_price,
        entryTime:  entryTimeChart,
        expiryTime: expiryTimeChart,
        direction: op.direction as 'CALL' | 'PUT',
        amount: op.amount,
        payout: op.payout_pct,
      })

      // Reregistra o timer de liquidação com o tempo restante real.
      // Mesma estrategia do caminho fresh (placeTrade): popup imediato com
      // calculo local + reconcileWithBackend para corrigir se necessario.
      const tid = setTimeout(async () => {
        timeoutMap.current.delete(op.id)
        const exitPrice = livePriceRef.current ?? assetObj.price
        const dir = op.direction as 'CALL' | 'PUT'

        const localWon    = dir === 'CALL' ? exitPrice > op.entry_price : exitPrice < op.entry_price
        const localProfit = localWon ? parseFloat((op.amount * (op.payout_pct / 100)).toFixed(2)) : 0

        setOpenTrades(prev => prev.filter(t => t.id !== op.id))
        onTradeExpired?.(op.id)
        setTradeResult({ direction: dir, amount: op.amount, profit: localProfit, won: localWon })

        await reconcileWithBackend(op.id, exitPrice, dir, op.amount, localWon, localProfit)
        await refreshAccounts()
        loadHistory()
      }, remainingMs)
      timeoutMap.current.set(op.id, tid)
    }

    if (toAdd.length > 0) {
      setOpenTrades(prev => {
        const existingIds = new Set(prev.map(t => t.id))
        return [...toAdd.filter(t => !existingIds.has(t.id)), ...prev]
      })
      setActiveTab('operacoes')
    }
  }, [accountId, onTradeOpened, onTradeExpired, refreshAccounts, loadHistory])

  useEffect(() => {
    loadOpenTrades()
  }, [loadOpenTrades])

  // Cancela todos os timeouts pendentes ao desmontar o componente
  useEffect(() => {
    return () => {
      timeoutMap.current.forEach(tid => clearTimeout(tid))
      timeoutMap.current.clear()
    }
  }, [])

  // Ref interno como fallback — preferimos o externalPriceRef (síncrono, sem lag de re-render)
  const internalPriceRef = useRef(livePrice)
  useEffect(() => { internalPriceRef.current = livePrice }, [livePrice])
  const livePriceRef = externalPriceRef ?? internalPriceRef

  async function handleDoubleUp(trade: OpenTrade, remaining: number) {
    if (!accountId) return
    const entryPrice = livePriceRef.current ?? trade.entryPrice
    const expiresAt  = new Date(Date.now() + remaining * 1000).toISOString()
    const BRT_OFFSET = -3 * 3600
    const entryTime  = Math.floor(Date.now() / 1000) + BRT_OFFSET
    const expiryTime = entryTime + remaining

    const { data, error } = await supabase.rpc('place_trade', {
      p_account_id:   accountId,
      p_asset_id:     trade.asset.id,
      p_asset_symbol: trade.asset.label,
      p_direction:    trade.direction,
      p_amount:       trade.amount,
      p_payout_pct:   trade.asset.payout,
      p_entry_price:  entryPrice,
      p_expires_at:   expiresAt,
    })

    if (error) {
      if (error.message.includes('INSUFFICIENT_BALANCE')) setTradeError('Saldo insuficiente para dobrar.')
      else setTradeError('Erro ao dobrar operação.')
      return
    }

    const newId = (data as any)?.id ?? `local-${Date.now()}`
    const utcExpiry = Math.floor(Date.now() / 1000) + remaining

    setOpenTrades(prev => [{
      id: newId, asset: trade.asset, direction: trade.direction,
      amount: trade.amount, profit: 0, expiryTime: utcExpiry, entryPrice,
      duration: remaining,
    }, ...prev])

    onTradeOpened?.({ id: newId, assetId: trade.asset.id, entryPrice, entryTime, expiryTime, direction: trade.direction, amount: trade.amount, payout: trade.asset.payout })

    const tidDouble = setTimeout(async () => {
      timeoutMap.current.delete(newId)
      const exitPrice = livePriceRef.current ?? trade.asset.price
      if (!newId.startsWith('local-')) {
        await supabase.rpc('settle_trade', { p_operation_id: newId, p_exit_price: exitPrice })
      }
      setOpenTrades(prev => prev.filter(t => t.id !== newId))
      onTradeExpired?.(newId)
      await refreshAccounts()
      if (activeTab === 'historico') loadHistory()
    }, remaining * 1000)
    timeoutMap.current.set(newId, tidDouble)
  }

  async function handleEarlyClose(trade: OpenTrade, refund: number) {
    // Cancela o timeout de liquidação para evitar double-settle
    const tid = timeoutMap.current.get(trade.id)
    if (tid !== undefined) {
      clearTimeout(tid)
      timeoutMap.current.delete(trade.id)
    }

    if (!trade.id.startsWith('local-')) {
      const { error } = await supabase.rpc('early_close_trade', {
        p_operation_id: trade.id,
        p_refund_amount: refund,
      })
      if (error) { setTradeError('Erro ao fechar antecipado.'); return }
    }
    setOpenTrades(prev => prev.filter(t => t.id !== trade.id))
    onTradeExpired?.(trade.id)
    setTradeResult({ direction: trade.direction, amount: trade.amount, profit: refund - trade.amount, won: false })
    await refreshAccounts()
    if (activeTab === 'historico') loadHistory()
  }

  const selectedDuration = TIME_OPTIONS[timeIndex]
  const payoutPct = selectedDuration === 300 ? asset.payout5min : asset.payout
  const payout    = payoutPct / 100
  const payment   = Math.round(investment + investment * payout)

  function commitInvestment(raw: string) {
    const num = parseFloat(raw.replace(/[^0-9.,]/g, '').replace(',', '.'))
    if (!isNaN(num) && num >= 1) setInvestment(Math.round(num * 100) / 100)
    setEditingInvestment(false)
  }

  async function placeTrade(direction: 'CALL' | 'PUT') {
    if (!accountId) return
    const entryPrice = livePriceRef.current
    if (entryPrice == null) {
      setTradeError('Aguarde o gráfico carregar o preço.')
      return
    }
    setTradeError('')
    setPlacing(true)
    try {
      const expiresInSec = TIME_OPTIONS[timeIndex]
      const BRT_OFFSET   = -3 * 3600
      const entryTime    = Math.floor(Date.now() / 1000) + BRT_OFFSET
      const expiryTime   = entryTime + expiresInSec
      const expiresAt    = new Date(Date.now() + expiresInSec * 1000).toISOString()

      const { data, error } = await supabase.rpc('place_trade', {
        p_account_id:   accountId,
        p_asset_id:     asset.id,
        p_asset_symbol: asset.label,
        p_direction:    direction,
        p_amount:       investment,
        p_payout_pct:   payoutPct,
        p_entry_price:  entryPrice,
        p_expires_at:   expiresAt,
      })

      if (error) {
        if (error.message.includes('INSUFFICIENT_BALANCE')) setTradeError('Saldo insuficiente.')
        else setTradeError('Erro ao abrir operação.')
        return
      }

      const operationId: string = (data as any)?.id ?? `local-${Date.now()}`
      const utcExpiryTime = Math.floor(Date.now() / 1000) + expiresInSec

      setOpenTrades(prev => [{
        id: operationId, asset, direction,
        amount: investment, profit: 0,
        expiryTime: utcExpiryTime, entryPrice,
        duration: expiresInSec,
      }, ...prev])
      setActiveTab('operacoes')

      onTradeOpened?.({
        id: operationId, assetId: asset.id, entryPrice, entryTime, expiryTime,
        direction, amount: investment, payout: payoutPct,
      })

      setConfirmTrade(null)

      // Liquidar operação ao expirar com o preço atual no momento da expiração.
      // UX: popup IMEDIATO baseado no preço local (livePriceRef = mesmo que aparece
      // no chart). Em paralelo, busca o resultado oficial do banco. Se houver
      // divergencia clara, atualiza o popup. Se nao, mantem o local.
      const tidPlace = setTimeout(async () => {
        timeoutMap.current.delete(operationId)
        const exitPrice = livePriceRef.current ?? asset.price

        // Calculo local imediato — popup sem esperar nada do servidor
        const localWon    = direction === 'CALL' ? exitPrice > entryPrice : exitPrice < entryPrice
        const localProfit = localWon ? parseFloat((investment * (payout / 100)).toFixed(2)) : 0

        setOpenTrades(prev => prev.filter(t => t.id !== operationId))
        onTradeExpired?.(operationId)
        setTradeResult({ direction, amount: investment, profit: localProfit, won: localWon })

        // Background: confirma resultado oficial no banco
        if (!operationId.startsWith('local-')) {
          await reconcileWithBackend(operationId, exitPrice, direction, investment, localWon, localProfit)
        }

        await refreshAccounts()
        if (activeTab === 'historico') loadHistory()
      }, expiresInSec * 1000)
      timeoutMap.current.set(operationId, tidPlace)

    } catch {
      setTradeError('Erro ao abrir operação.')
    } finally {
      setPlacing(false)
    }
  }

  const timeDisplay = expiryLabel(TIME_OPTIONS[timeIndex], nowBRT)

  function adjustInvestment(delta: number) {
    setInvestment(v => Math.max(1, Math.round((v + delta) * 100) / 100))
  }

  function adjustTime(delta: number) {
    setTimeIndex(i => Math.max(0, Math.min(TIME_OPTIONS.length - 1, i + delta)))
  }

  // Expõe placeTrade pro pai (usado pelo MobileTradingSheet pra disparar trade
  // a partir dos botões rápidos sem expandir o painel)
  useImperativeHandle(ref, () => ({
    placeTrade: (direction: 'CALL' | 'PUT') => {
      if (placing || livePriceRef.current == null || !marketOpen) return
      if (oneClickTrade) placeTrade(direction)
      else setConfirmTrade(direction)
    },
    canTrade: !placing && livePrice != null && marketOpen,
  }), [placing, livePrice, marketOpen, oneClickTrade])

  return (
    <aside className={cn(
      mobile ? 'w-full' : 'w-[280px] flex-shrink-0 border-l border-[#2a2e3b]',
      'flex flex-col bg-[#1d2130] overflow-hidden',
      hidden && 'hidden'
    )}>

      {/* Trade result popup — portal pro <body> pra escapar do display:none quando
          o painel está oculto (sheet colapsado em mobile, modo paisagem, etc.) */}
      {tradeResult && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className={cn(
            'pointer-events-auto px-8 py-6 rounded-2xl shadow-2xl border relative min-w-[260px] text-center backdrop-blur-sm',
            tradeResult.won
              ? 'bg-[#1a2e2a] border-[#26a69a]/50 shadow-[#26a69a]/10'
              : 'bg-[#2e1a1a] border-[#ef5350]/50 shadow-[#ef5350]/10'
          )}>
            <button
              onClick={() => setTradeResult(null)}
              className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
            <p className="text-[10px] font-bold tracking-widest mb-3 uppercase"
              style={{ color: tradeResult.won ? '#26a69a' : '#ef5350' }}>
              {tradeResult.won ? '✓ Operação Ganha' : '✗ Operação Perdida'}
            </p>
            <p className={cn('text-3xl font-black tabular-nums', tradeResult.won ? 'text-[#26a69a]' : 'text-[#ef5350]')}>
              {tradeResult.won
                ? `+R$ ${fmtMoney(tradeResult.profit)}`
                : `-R$ ${fmtMoney(tradeResult.amount)}`}
            </p>
            <p className="text-[11px] text-white/40 mt-1">
              {tradeResult.direction === 'CALL' ? 'Para cima' : 'Para baixo'} · R$ {fmtMoney(tradeResult.amount)}
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* Asset header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e3b] bg-[#161929]">
        <div className="flex items-center gap-2 min-w-0">
          <FlagPair code1={asset.code1} code2={asset.code2} size={22} />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-white truncate leading-tight">{asset.label}</span>
            <span className="text-[10px] text-[#8b8f9a] leading-tight">{asset.type}</span>
          </div>
        </div>
        <div className="flex flex-col items-end flex-shrink-0 ml-2">
          <span className="text-lg font-black text-[#26a69a] leading-tight tabular-nums">{payoutPct}%</span>
          <span className="text-[10px] text-[#8b8f9a] leading-tight">Payout</span>
        </div>
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

          {/* Horário absoluto de expiração — abre grid ao clicar */}
          <div className="flex-1 text-center relative">
            <button
              onClick={() => setTimerPickerOpen(v => !v)}
              className="text-2xl font-black text-white font-mono tracking-widest hover:text-[#26a69a] transition-colors w-full tabular-nums"
            >
              {timeDisplay}
            </button>

            {timerPickerOpen && (
              <div
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-[#1a1e2e] border border-[#2a2e3b] rounded-xl z-50 p-2 shadow-2xl"
                style={{ width: '240px' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="grid grid-cols-4 gap-1">
                  {TIME_OPTIONS.map((duration, i) => (
                    <button
                      key={duration}
                      onClick={() => { setTimeIndex(i); setTimerPickerOpen(false) }}
                      className={cn(
                        'py-1.5 text-[11px] font-bold rounded-lg transition-colors',
                        i === timeIndex
                          ? 'bg-blue-600 text-white'
                          : 'text-[#8b8f9a] hover:text-white hover:bg-white/5'
                      )}
                    >
                      {expiryLabel(duration, nowBRT)}
                    </button>
                  ))}
                </div>
              </div>
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
            onClick={() => adjustInvestment(-10)}
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
                className="text-xl font-black text-white hover:text-[#26a69a] transition-colors w-full tabular-nums"
                title="Clique para editar"
              >
                R$ {fmtMoney(investment)}
              </button>
            )}
          </div>
          <button
            onClick={() => adjustInvestment(10)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[#3a3f50] text-[#8b8f9a] hover:text-white hover:border-white/30 transition-colors flex-shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
      </FloatingBox>

      {/* Pagamento */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-xs text-[#8b8f9a]">Lucro estimado</span>
        <span className="text-sm font-bold text-[#26a69a] tabular-nums">+R$ {fmtMoney(Math.round(investment * payout))}</span>
      </div>

      {/* CALL / PUT buttons */}
      <div className="px-3 pb-3 flex flex-col gap-2">
        {confirmTrade ? (
          <div className="flex flex-col gap-2">
            <div className="text-center text-xs text-[#8b8f9a] font-semibold py-1">
              Confirmar{' '}
              <span className={cn('font-bold', confirmTrade === 'CALL' ? 'text-[#26a69a]' : 'text-[#ef5350]')}>
                {confirmTrade === 'CALL' ? 'Para cima' : 'Para baixo'}
              </span>
              {' '}— R$ {fmtMoney(investment)}?
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
                  'flex-1 h-10 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.97] disabled:opacity-50',
                  confirmTrade === 'CALL' ? 'bg-[#26a69a] hover:bg-[#2bbbad]' : 'bg-[#ef5350] hover:bg-[#f44336]'
                )}
              >
                {placing ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!marketOpen && (
              <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
                <div className="text-xs font-bold text-red-400 mb-0.5">⏸ Mercado fechado</div>
                <div className="text-[10px] text-[#bdc1cc]">
                  Forex opera de Dom 22h UTC a Sex 22h UTC. Reabre em <span className="font-bold text-white">{reopenIn}</span>.
                </div>
              </div>
            )}
            <button
              onClick={() => oneClickTrade ? placeTrade('CALL') : setConfirmTrade('CALL')}
              disabled={placing || livePrice == null || !marketOpen}
              title={!marketOpen ? `Mercado fechado · reabre em ${reopenIn}` : ''}
              className="w-full h-14 rounded-xl bg-[#26a69a] hover:bg-[#2bbbad] active:scale-[0.97] active:bg-[#00897b] transition-all flex items-center justify-between px-5 font-bold text-white text-base shadow-lg shadow-[#26a69a]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#26a69a]"
            >
              <span className="text-base font-black">Para cima</span>
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
                <ArrowUp size={18} strokeWidth={2.5} />
              </div>
            </button>
            <button
              onClick={() => oneClickTrade ? placeTrade('PUT') : setConfirmTrade('PUT')}
              disabled={placing || livePrice == null || !marketOpen}
              title={!marketOpen ? `Mercado fechado · reabre em ${reopenIn}` : ''}
              className="w-full h-14 rounded-xl bg-[#ef5350] hover:bg-[#f44336] active:scale-[0.97] active:bg-[#c62828] transition-all flex items-center justify-between px-5 font-bold text-white text-base shadow-lg shadow-[#ef5350]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#ef5350]"
            >
              <span className="text-base font-black">Para baixo</span>
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0 border border-white/20">
                <ArrowDown size={18} strokeWidth={2.5} />
              </div>
            </button>
            {tradeError && <p className="text-red-400 text-xs text-center mt-1">{tradeError}</p>}
          </>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-[#2a2e3b]" />

      {/* Tab bar */}
      <div className="flex items-stretch border-b border-[#2a2e3b] flex-shrink-0">
        {/* Operações abertas */}
        <button
          onClick={() => setActiveTab('operacoes')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors relative',
            activeTab === 'operacoes' ? 'text-white' : 'text-[#8b8f9a] hover:text-white'
          )}
        >
          {activeTab === 'operacoes' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />}
          <ArrowLeftRight size={13} />
          <span className="w-5 h-5 rounded-full bg-[#252a3a] flex items-center justify-center text-[9px] font-bold">
            {openTrades.length}
          </span>
        </button>

        {/* Histórico */}
        <button
          onClick={() => setActiveTab('historico')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors relative',
            activeTab === 'historico' ? 'text-white' : 'text-[#8b8f9a] hover:text-white'
          )}
        >
          {activeTab === 'historico' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />}
          <Package size={13} />
          <span>Histórico</span>
        </button>

        {/* Pedidos */}
        <button
          onClick={() => setActiveTab('pedidos')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors relative',
            activeTab === 'pedidos' ? 'text-white' : 'text-[#8b8f9a] hover:text-white'
          )}
        >
          {activeTab === 'pedidos' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />}
          <span>Pedidos</span>
          <span className="w-5 h-5 rounded-full bg-[#252a3a] flex items-center justify-center text-[9px] font-bold">0</span>
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
                <span className="text-[10px] font-bold text-[#8b8f9a] tracking-wide">
                  {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }).toUpperCase()}
                </span>
                <div className="w-5 h-5 rounded-full bg-[#252a3a] flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">{openTrades.length}</span>
                </div>
              </div>
              {openTrades.map((trade) => (
                <TradeItem
                  key={trade.id}
                  trade={trade}
                  shortLabels={shortLabels}
                  currentPrice={priceMap.get(trade.asset.id)}
                  onDoubleUp={handleDoubleUp}
                  onEarlyClose={handleEarlyClose}
                />
              ))}
            </>
          )
        ) : activeTab === 'historico' ? (
          historyLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[#8b8f9a] text-xs animate-pulse">Carregando...</span>
            </div>
          ) : history.length === 0 ? (
            <EmptyState message="Nenhuma operação encerrada ainda." />
          ) : (
            <div className="flex flex-col">
              {history.map((op) => (
                <HistoryItem key={op.id} op={op} />
              ))}
            </div>
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
})

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

function HistoryItem({ op }: { op: ClosedTrade }) {
  const won  = op.status === 'WON'
  const draw = op.status === 'DRAW'
  const profit = op.profit ?? 0
  const date = op.closed_at
    ? new Date(op.closed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2333] hover:bg-white/[0.02] transition-colors">
      {/* Direção */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
        op.direction === 'CALL' ? 'bg-[#26a69a]/20' : 'bg-[#ef5350]/20'
      )}>
        {op.direction === 'CALL'
          ? <ArrowUp size={13} className="text-[#26a69a]" />
          : <ArrowDown size={13} className="text-[#ef5350]" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white truncate">{op.asset_symbol}</span>
          <span className={cn(
            'text-[12px] font-bold',
            won ? 'text-[#26a69a]' : draw ? 'text-yellow-400' : 'text-[#ef5350]'
          )}>
            {won ? `+${profit.toFixed(2)} R$` : draw ? '0.00 R$' : `-${op.amount.toFixed(2)} R$`}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-[#8b8f9a]">{date}</span>
          <span className={cn(
            'text-[9px] font-bold px-1.5 py-0.5 rounded',
            won ? 'bg-[#26a69a]/20 text-[#26a69a]' : draw ? 'bg-yellow-400/20 text-yellow-400' : 'bg-[#ef5350]/20 text-[#ef5350]'
          )}>
            {won ? 'GANHOU' : draw ? 'EMPATE' : 'PERDEU'}
          </span>
        </div>
      </div>
    </div>
  )
}
