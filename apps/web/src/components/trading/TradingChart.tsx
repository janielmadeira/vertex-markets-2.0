'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, ZoomIn, ZoomOut, Crosshair, ChevronDown, Eye, Pen, X, Activity, Bell } from 'lucide-react'
import { generateMockCandles, getOTCPrice, getAssetDecimals, type Asset, type Candle, type ActiveTrade } from '@/lib/mockData'
import { REAL_ASSETS, tfToBinanceInterval } from '@/lib/marketSymbols'
import { subscribeOtc, assetIdToOtcSymbol, type OtcSubscription } from '@/lib/otcClient'
import { cn } from '@/lib/utils'
import { DrawingsPanel } from './DrawingsPanel'
import { DrawingSettingsPanel } from './DrawingSettingsPanel'
import { IndicadoresPanel } from './IndicadoresPanel'
import { BBSettingsPanel, type BBSettings, BB_DEFAULTS } from './BBSettingsPanel'
import { MASettingsPanel, type MASettings, type MAType, MA_DEFAULTS } from './MASettingsPanel'
import { MACDSettingsPanel, type MACDSettings, MACD_DEFAULTS } from './MACDSettingsPanel'
import { RSISettingsPanel, type RSISettings, RSI_DEFAULTS } from './RSISettingsPanel'

type ChartTheme = 'diurno' | 'crepusculo' | 'noite'
type ChartType = 'velas' | 'area' | 'barras' | 'heiken-ashi'

// ── Drawing tools ────────────────────────────────────────────────────────────
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
const FIB_COLORS = ['#ef5350', '#f7931a', '#f1c40f', '#26a69a', '#42a5f5', '#ab47bc', '#ef5350']
const DRAW_PALETTE = ['#2196f3', '#26a69a', '#ef5350', '#f7931a', '#ab47bc', '#f1c40f']
let _drawColorIdx = 0
function nextDrawColor() { return DRAW_PALETTE[(_drawColorIdx++) % DRAW_PALETTE.length] }

type DrawingStyle = 'solid' | 'dashed'
type Drawing =
  | { id: string; type: 'hline'; price: number; color: string; style?: DrawingStyle }
  | { id: string; type: 'vline'; time: number; color: string; style?: DrawingStyle }
  | { id: string; type: 'trendline'; p1: { time: number; price: number }; p2: { time: number; price: number }; color: string; style?: DrawingStyle }
  | { id: string; type: 'fib'; p1: { time: number; price: number }; p2: { time: number; price: number }; color: string; style?: DrawingStyle }

type DrawingPx =
  | { id: string; type: 'hline'; y: number; price: number; color: string }
  | { id: string; type: 'vline'; x: number; color: string }
  | { id: string; type: 'trendline'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; type: 'fib'; x1: number; y1: number; x2: number; y2: number; color: string; levels: Array<{ ratio: number; y: number; price: number }> }

const THEME_COLORS: Record<ChartTheme, {
  bg: string; text: string; grid: string; border: string; crosshair: string; labelBg: string
}> = {
  noite:     { bg: '#151822', text: '#8b8f9a', grid: '#1e2333', border: '#2a2e3b', crosshair: '#4a5568', labelBg: '#2d3748' },
  diurno:    { bg: '#ffffff', text: '#374151', grid: '#e5e7eb', border: '#d1d5db', crosshair: '#9ca3af', labelBg: '#f3f4f6' },
  crepusculo:{ bg: '#1f1b2e', text: '#a78bfa', grid: '#2d2640', border: '#3d3554', crosshair: '#6d5eac', labelBg: '#2d2640' },
}

interface Timeframe { label: string; seconds: number }
const TIMEFRAMES: Timeframe[] = [
  { label: '5s',  seconds: 5    },
  { label: '15s', seconds: 15   },
  { label: '30s', seconds: 30   },
  { label: '1m',  seconds: 60   },
  { label: '5m',  seconds: 300  },
  { label: '15m', seconds: 900  },
  { label: '30m', seconds: 1800 },
  { label: '1h',  seconds: 3600 },
  { label: '4h',  seconds: 14400},
  { label: '1D',  seconds: 86400},
]

const CHART_TYPES: { key: ChartType; label: string; icon: React.ReactNode }[] = [
  { key: 'area', label: 'Área', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <polyline points="1,12 5,7 9,9 13,3 15,5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <polygon points="1,12 5,7 9,9 13,3 15,5 15,13 1,13" fill="currentColor" opacity="0.3"/>
    </svg>
  )},
  { key: 'velas', label: 'Velas', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <line x1="4" y1="2" x2="4" y2="14" stroke="currentColor" strokeWidth="1"/>
      <rect x="2.5" y="5" width="3" height="5" fill="#26a69a"/>
      <line x1="11" y1="2" x2="11" y2="14" stroke="currentColor" strokeWidth="1"/>
      <rect x="9.5" y="7" width="3" height="5" fill="#ef5350"/>
    </svg>
  )},
  { key: 'barras', label: 'Barras', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <line x1="4" y1="3" x2="4" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="5" x2="4" y2="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="4" y1="9" x2="6" y2="9" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="11" y1="4" x2="11" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="9" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="11" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )},
  { key: 'heiken-ashi', label: 'Heiken Ashi', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <line x1="4" y1="2" x2="4" y2="14" stroke="currentColor" strokeWidth="1"/>
      <rect x="2.5" y="4" width="3" height="7" fill="#26a69a"/>
      <line x1="11" y1="3" x2="11" y2="14" stroke="currentColor" strokeWidth="1"/>
      <rect x="9.5" y="6" width="3" height="6" fill="#ef5350"/>
    </svg>
  )},
]

interface OhlcData { open: number; high: number; low: number; close: number }

interface TradingChartProps {
  asset: Asset
  onInfoClick: () => void
  theme?: ChartTheme
  autoScroll?: boolean
  performanceMode?: boolean
  activeTrades?: ActiveTrade[]
  onPriceUpdate?: (price: number) => void
}

function calculateBollingerBands(candles: Candle[], period = 20, mult = 2) {
  return candles.map((c, i) => {
    if (i < period - 1) return null
    const slice = candles.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, x) => s + x.close, 0) / period
    const std = Math.sqrt(slice.reduce((s, x) => s + Math.pow(x.close - avg, 2), 0) / period)
    return {
      time: c.time as number,
      upper:  parseFloat((avg + mult * std).toFixed(5)),
      middle: parseFloat(avg.toFixed(5)),
      lower:  parseFloat((avg - mult * std).toFixed(5)),
    }
  }).filter(Boolean) as { time: number; upper: number; middle: number; lower: number }[]
}

function calculateParabolicSAR(candles: Candle[], step = 0.02, maxAf = 0.2): { time: number; value: number; bull: boolean }[] {
  if (candles.length < 2) return []
  const result: { time: number; value: number; bull: boolean }[] = []
  let bull = true, af = step
  let ep = candles[0].high, sar = candles[0].low
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1]
    if (bull) {
      sar = sar + af * (ep - sar)
      sar = Math.min(sar, prev.low, i > 1 ? candles[i - 2].low : prev.low)
      if (c.low < sar)       { bull = false; sar = ep; ep = c.low;  af = step }
      else if (c.high > ep)  { ep = c.high;  af = Math.min(af + step, maxAf) }
    } else {
      sar = sar + af * (ep - sar)
      sar = Math.max(sar, prev.high, i > 1 ? candles[i - 2].high : prev.high)
      if (c.high > sar)      { bull = true;  sar = ep; ep = c.high; af = step }
      else if (c.low < ep)   { ep = c.low;   af = Math.min(af + step, maxAf) }
    }
    result.push({ time: c.time as number, value: parseFloat(sar.toFixed(5)), bull })
  }
  return result
}

function calculateRSI(candles: Candle[], period = 14): { time: number; value: number }[] {
  if (candles.length < period + 1) return []
  const result: { time: number; value: number }[] = []
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close
    if (d > 0) avgGain += d; else avgLoss -= d
  }
  avgGain /= period; avgLoss /= period
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
    result.push({ time: candles[i].time as number, value: parseFloat((100 - 100 / (1 + rs)).toFixed(2)) })
  }
  return result
}

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1), out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) out.push((values[i] - out[i - 1]) * k + out[i - 1])
  return out
}

function calculateMACD(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  const closes = candles.map(c => c.close)
  const emaFast = calcEMA(closes, fast), emaSlow = calcEMA(closes, slow)
  const macdVals = closes.map((_, i) => emaFast[i] - emaSlow[i])
  const sigVals  = calcEMA(macdVals, signal)
  const skip = slow - 1
  return {
    macdLine:   candles.slice(skip).map((c, i) => ({ time: c.time as number, value: parseFloat(macdVals[i + skip].toFixed(5)) })),
    signalLine: candles.slice(skip).map((c, i) => ({ time: c.time as number, value: parseFloat(sigVals[i + skip].toFixed(5)) })),
    histogram:  candles.slice(skip).map((c, i) => ({
      time: c.time as number,
      value: parseFloat((macdVals[i + skip] - sigVals[i + skip]).toFixed(5)),
    })),
  }
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function calculateSMA(candles: Candle[], period: number): { time: number; value: number }[] {
  return candles
    .map((c, i) => {
      if (i < period - 1) return null
      const avg = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.close, 0) / period
      return { time: c.time as number, value: parseFloat(avg.toFixed(5)) }
    })
    .filter(Boolean) as { time: number; value: number }[]
}

function calculateEMAIndicator(candles: Candle[], period: number): { time: number; value: number }[] {
  const emas = calcEMA(candles.map(c => c.close), period)
  return candles.map((c, i) => ({ time: c.time as number, value: parseFloat(emas[i].toFixed(5)) }))
}

function calculateWMA(candles: Candle[], period: number): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0, weights = 0
    for (let j = 0; j < period; j++) { const w = j + 1; sum += candles[i - period + 1 + j].close * w; weights += w }
    result.push({ time: candles[i].time as number, value: parseFloat((sum / weights).toFixed(5)) })
  }
  return result
}

function calculateSMMA(candles: Candle[], period: number): { time: number; value: number }[] {
  if (candles.length < period) return []
  const result: { time: number; value: number }[] = []
  let smma = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  for (let i = period; i < candles.length; i++) {
    smma = (smma * (period - 1) + candles[i].close) / period
    result.push({ time: candles[i].time as number, value: parseFloat(smma.toFixed(5)) })
  }
  return result
}

function calculateMA(candles: Candle[], settings: { period: number; type: MAType }): { time: number; value: number }[] {
  switch (settings.type) {
    case 'EMA':  return calculateEMAIndicator(candles, settings.period)
    case 'WMA':  return calculateWMA(candles, settings.period)
    case 'SMMA': return calculateSMMA(candles, settings.period)
    default:     return calculateSMA(candles, settings.period)
  }
}

function calculateZigZag(candles: Candle[], depth = 5): { time: number; value: number }[] {
  const points: { time: number; value: number }[] = []
  let lastDir = 0
  for (let i = depth; i < candles.length - depth; i++) {
    const c = candles[i]
    const win = candles.slice(i - depth, i + depth + 1)
    const isHigh = c.high >= Math.max(...win.map(x => x.high))
    const isLow  = c.low  <= Math.min(...win.map(x => x.low))
    if (isHigh && lastDir !== 1)  { points.push({ time: c.time as number, value: c.high }); lastDir = 1 }
    else if (isLow && lastDir !== -1) { points.push({ time: c.time as number, value: c.low });  lastDir = -1 }
  }
  return points
}

function toHeikenAshi(candles: Candle[]): Candle[] {
  const ha: Candle[] = []
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const haClose = parseFloat(((c.open + c.high + c.low + c.close) / 4).toFixed(5))
    const haOpen  = i === 0 ? parseFloat(((c.open + c.close) / 2).toFixed(5)) : parseFloat(((ha[i-1].open + ha[i-1].close) / 2).toFixed(5))
    const haHigh  = Math.max(c.high, haOpen, haClose)
    const haLow   = Math.min(c.low,  haOpen, haClose)
    ha.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose })
  }
  return ha
}

const BRT_OFFSET_CHART = -3 * 3600

function TradeTimer({ expiryTime, x, y, color }: { expiryTime: number; x: number; y: number; color: string }) {
  const nowBRT = () => Math.floor(Date.now() / 1000) + BRT_OFFSET_CHART
  const [remaining, setRemaining] = React.useState(Math.max(0, expiryTime - nowBRT()))
  React.useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, expiryTime - nowBRT())), 200)
    return () => clearInterval(t)
  }, [expiryTime])
  const m = Math.floor(remaining / 60).toString().padStart(2, '0')
  const s = (remaining % 60).toString().padStart(2, '0')
  return (
    <div className="absolute pointer-events-none z-[8]" style={{ left: x - 18, top: y + 6 }}>
      <div className="text-[10px] font-mono font-bold px-1.5 py-[1px] rounded border" style={{ color, borderColor: color + '80', backgroundColor: '#151822' }}>
        {m}:{s}
      </div>
    </div>
  )
}

function TradeExpiryLabel({ expiryTime, color }: { expiryTime: number; color: string }) {
  const nowBRT = () => Math.floor(Date.now() / 1000) + BRT_OFFSET_CHART
  const [remaining, setRemaining] = React.useState(Math.max(0, expiryTime - nowBRT()))
  React.useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, expiryTime - nowBRT())), 200)
    return () => clearInterval(t)
  }, [expiryTime])
  const m = Math.floor(remaining / 60).toString().padStart(2, '0')
  const s = (remaining % 60).toString().padStart(2, '0')
  return (
    <span className="text-[10px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded font-mono"
      style={{ color, backgroundColor: '#151822cc', border: `1px solid ${color}50` }}>
      Fechamento da negociação {m}:{s}
    </span>
  )
}

// Cache de candles históricos por "assetId:tfSeconds" — evita regenerar ao voltar para um par.
// Chave expira após 5 minutos para absorver novos candles sem crescer indefinidamente.
const candleCache = new Map<string, { candles: import('@/lib/mockData').Candle[]; ts: number }>()
const CANDLE_CACHE_TTL = 5 * 60 * 1000

export function TradingChart({ asset, onInfoClick, theme = 'noite', autoScroll = true, performanceMode = true, activeTrades = [], onPriceUpdate }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const autoScrollRef = useRef(autoScroll)
  const priceLinesRef = useRef<Record<string, any>>({})
  const tradesPosIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tfSecRef = useRef(TIMEFRAMES[3].seconds) // synced below after tfIndex state
  const onPriceUpdateRef = useRef(onPriceUpdate)
  useEffect(() => { onPriceUpdateRef.current = onPriceUpdate }, [onPriceUpdate])

  const [currentPrice, setCurrentPrice] = useState(asset.price)
  const [priceChange, setPriceChange] = useState(0)
  const [timestamp, setTimestamp] = useState('')
  const [ohlc, setOhlc] = useState<OhlcData | null>(null)
  const [tfIndex, setTfIndex] = useState(3)
  const [tfOpen, setTfOpen] = useState(false)
  useEffect(() => { tfSecRef.current = TIMEFRAMES[tfIndex].seconds }, [tfIndex])
  const [candleTime, setCandleTime] = useState('')
  const [tradePositions, setTradePositions] = useState<Record<string, { entryX: number; expiryX: number; entryY: number }>>({})

  const [candleSecsLeft, setCandleSecsLeft] = useState(0)
  const [candleTimerY, setCandleTimerY] = useState<number | null>(null)
  const [candleTimerX, setCandleTimerX] = useState<number | null>(null)
  const [drawingsOpen, setDrawingsOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const drawingsRef = useRef<Drawing[]>([])
  useEffect(() => { drawingsRef.current = drawings }, [drawings])
  const [pendingPoint, setPendingPoint] = useState<{ price: number; time: number } | null>(null)
  const pendingPointRef = useRef<{ price: number; time: number } | null>(null)
  useEffect(() => { pendingPointRef.current = pendingPoint }, [pendingPoint])
  const activeToolRef = useRef<string | null>(null)
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])
  const [drawingPixels, setDrawingPixels] = useState<DrawingPx[]>([])
  const [mousePx, setMousePx] = useState<{ x: number; y: number } | null>(null)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const selectedDrawingIdRef = useRef<string | null>(null)
  useEffect(() => { selectedDrawingIdRef.current = selectedDrawingId }, [selectedDrawingId])
  const draggingRef = useRef<{
    id: string
    handle: 'body' | 'p1' | 'p2'
    startClientX: number
    startClientY: number
    origDrawing: Drawing
  } | null>(null)
  const [indicadoresOpen, setIndicadoresOpen] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('velas')
  const [chartTypeOpen, setChartTypeOpen] = useState(false)
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set())
  const [chartKey, setChartKey] = useState(0) // incrementa cada vez que o gráfico é recriado
  const [alertSet, setAlertSet] = useState(false)
  const [bbSettings, setBBSettings] = useState<BBSettings>(BB_DEFAULTS)
  const [bbEditOpen, setBBEditOpen] = useState(false)
  const [maSettings, setMASettings] = useState<MASettings>(MA_DEFAULTS)
  const [maEditOpen, setMAEditOpen] = useState(false)
  const [macdSettings, setMACDSettings] = useState<MACDSettings>(MACD_DEFAULTS)
  const [macdEditOpen, setMACDEditOpen] = useState(false)
  const [rsiSettings, setRSISettings] = useState<RSISettings>(RSI_DEFAULTS)
  const [rsiEditOpen, setRSIEditOpen] = useState(false)

  const showSMA    = activeIndicators.has('moving-average')
  const showZigzag = activeIndicators.has('zig-zag')
  const showBB     = activeIndicators.has('bollinger-bands')
  const showPSAR   = activeIndicators.has('parabolic-sar')
  const showRSI    = activeIndicators.has('rsi')
  const showMACD   = activeIndicators.has('macd')
  const oscActive  = showRSI || showMACD
  const activeOsc: 'rsi' | 'macd' | null = showRSI ? 'rsi' : showMACD ? 'macd' : null

  const oscChartContainerRef = useRef<HTMLDivElement>(null)
  const oscChartRef = useRef<any>(null)

  function toggleIndicator(id: string) {
    setActiveIndicators(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function clearAllIndicators() {
    setActiveIndicators(new Set())
  }

  const selectedTf = TIMEFRAMES[tfIndex]
  const selectedChartType = CHART_TYPES.find(t => t.key === chartType)!

  useEffect(() => {
    const updateTimestamp = () => {
      // UTC-3 fixo (horário de Brasília), independente do timezone do sistema
      const nowUtc = Date.now()
      const brt = new Date(nowUtc - 3 * 3600 * 1000)
      const h = brt.getUTCHours().toString().padStart(2, '0')
      const m = brt.getUTCMinutes().toString().padStart(2, '0')
      const s = brt.getUTCSeconds().toString().padStart(2, '0')
      setTimestamp(`${h}:${m}:${s} UTC-3`)
    }
    updateTimestamp()
    const t = setInterval(updateTimestamp, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    const c = THEME_COLORS[theme]
    chartRef.current.applyOptions({
      layout: { background: { color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border, textColor: c.text },
      timeScale: { borderColor: c.border },
      crosshair: {
        vertLine: { color: c.crosshair, labelBackgroundColor: c.labelBg },
        horzLine: { color: c.crosshair, labelBackgroundColor: c.labelBg },
      },
    })
  }, [theme])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.applyOptions({
      kineticScroll: { touch: !performanceMode, mouse: !performanceMode },
      handleScale: { axisPressedMouseMove: !performanceMode },
    })
  }, [performanceMode])

  useEffect(() => {
    autoScrollRef.current = autoScroll
    if (autoScroll && chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime()
    }
  }, [autoScroll])

  // ── Active trades: price lines + overlay positions ───────────────────────
  useEffect(() => {
    if (!seriesRef.current) return

    // Sync price lines: add new, remove stale
    const activeIds = new Set(activeTrades.map(t => t.id))

    // Remove price lines for expired trades
    Object.keys(priceLinesRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        try { seriesRef.current.removePriceLine(priceLinesRef.current[id]) } catch {}
        delete priceLinesRef.current[id]
      }
    })

    // Create price lines for new trades — linha colorida + label no eixo Y
    const createLines = async () => {
      const { LineStyle } = await import('lightweight-charts')
      for (const trade of activeTrades) {
        if (priceLinesRef.current[trade.id]) continue
        if (!seriesRef.current) continue
        const color = trade.direction === 'CALL' ? '#26a69a' : '#ef5350'
        try {
          priceLinesRef.current[trade.id] = seriesRef.current.createPriceLine({
            price: trade.entryPrice,
            color: color + '60',   // linha sutil — o CSS cuida da visual principal
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: '',
          })
        } catch {}
      }
    }
    createLines()

    // Mantém a linha de preço atual sempre visível para o usuário ter referência
    try {
      seriesRef.current.applyOptions({ priceLineVisible: true })
    } catch {}

    // Remove positions for closed trades
    setTradePositions(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => { if (!activeIds.has(id)) delete next[id] })
      return next
    })
  }, [activeTrades, chartKey])

  // ── Poll overlay positions for all active trades ──────────────────────────
  useEffect(() => {
    if (tradesPosIntervalRef.current) clearInterval(tradesPosIntervalRef.current)
    if (activeTrades.length === 0) { setTradePositions({}); return }

    tradesPosIntervalRef.current = setInterval(() => {
      if (!chartRef.current || !seriesRef.current) return
      const ts = chartRef.current.timeScale()
      const tfSec = tfSecRef.current
      setTradePositions(() => {
        const next: Record<string, { entryX: number; expiryX: number; entryY: number }> = {}
        for (const trade of activeTrades) {
          // Alinha ao início do candle — o gráfico sempre tem esse timestamp
          const alignedEntry = Math.floor(trade.entryTime / tfSec) * tfSec
          const entryX = ts.timeToCoordinate(alignedEntry) ?? ts.timeToCoordinate(trade.entryTime)
          const alignedExpiry = Math.floor(trade.expiryTime / tfSec) * tfSec
          const expiryX = ts.timeToCoordinate(alignedExpiry) ?? ts.timeToCoordinate(trade.expiryTime)
          const entryY = seriesRef.current.priceToCoordinate(trade.entryPrice)
          if (entryX != null && entryY != null) {
            next[trade.id] = { entryX, expiryX: expiryX ?? entryX + 120, entryY }
          }
        }
        return next
      })
    }, 200)

    return () => {
      if (tradesPosIntervalRef.current) clearInterval(tradesPosIntervalRef.current)
    }
  }, [activeTrades])

  // ── Drawing pixels: convert stored price/time to pixel coords ────────────
  useEffect(() => {
    const iv = setInterval(() => {
      if (!chartRef.current || !seriesRef.current) return
      const ts = chartRef.current.timeScale()
      const pixels: DrawingPx[] = []
      for (const d of drawingsRef.current) {
        if (d.type === 'hline') {
          const y = seriesRef.current.priceToCoordinate(d.price)
          if (y != null) pixels.push({ id: d.id, type: 'hline', y, price: d.price, color: d.color })
        } else if (d.type === 'vline') {
          const x = ts.timeToCoordinate(d.time)
          if (x != null) pixels.push({ id: d.id, type: 'vline', x, color: d.color })
        } else if (d.type === 'trendline') {
          const x1 = ts.timeToCoordinate(d.p1.time) ?? 0
          const y1 = seriesRef.current.priceToCoordinate(d.p1.price) ?? 0
          const x2 = ts.timeToCoordinate(d.p2.time) ?? 0
          const y2 = seriesRef.current.priceToCoordinate(d.p2.price) ?? 0
          pixels.push({ id: d.id, type: 'trendline', x1, y1, x2, y2, color: d.color })
        } else if (d.type === 'fib') {
          const x1 = ts.timeToCoordinate(d.p1.time) ?? 0
          const y1 = seriesRef.current.priceToCoordinate(d.p1.price) ?? 0
          const x2 = ts.timeToCoordinate(d.p2.time) ?? 0
          const y2 = seriesRef.current.priceToCoordinate(d.p2.price) ?? 0
          const levels = FIB_LEVELS.map((r, i) => {
            const price = d.p2.price + (d.p1.price - d.p2.price) * r
            const y = seriesRef.current!.priceToCoordinate(price) ?? 0
            return { ratio: r, y, price }
          })
          pixels.push({ id: d.id, type: 'fib', x1, y1, x2, y2, color: d.color, levels })
        }
      }
      setDrawingPixels(pixels)
    }, 100)
    return () => clearInterval(iv)
  }, [])

  // Escape cancels active drawing tool / deselects drawing; Delete removes selected drawing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool(null); setPendingPoint(null); setMousePx(null)
        setSelectedDrawingId(null)
      }
      if (e.key === 'Delete' && selectedDrawingIdRef.current) {
        const id = selectedDrawingIdRef.current
        setDrawings(prev => prev.filter(d => d.id !== id))
        setSelectedDrawingId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    let chart: any = null
    let priceInterval: ReturnType<typeof setInterval>
    let realPriceInterval: ReturnType<typeof setInterval> | null = null
    let rafId: number | null = null
    let otcWs: OtcSubscription | null = null
    let otcWsPrice: number | null = null   // último preço recebido do backend (server-authoritative)

    async function initChart() {
      if (!chartContainerRef.current) return

      const { createChart, ColorType, CrosshairMode, LineStyle, CandlestickSeries, LineSeries, AreaSeries, BarSeries } = await import('lightweight-charts')

      const tc = THEME_COLORS[theme]
      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: tc.bg },
          textColor: tc.text,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: tc.grid, style: 1 },
          horzLines: { color: tc.grid, style: 1 },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: tc.crosshair, labelBackgroundColor: tc.labelBg },
          horzLine: { color: tc.crosshair, labelBackgroundColor: tc.labelBg },
        },
        rightPriceScale: { borderColor: tc.border, textColor: tc.text },
        timeScale: {
          borderColor: tc.border,
          timeVisible: true,
          secondsVisible: selectedTf.seconds < 60,
          fixLeftEdge: false,
          rightOffset: 5,
          barSpacing: 10,
          lockVisibleTimeRangeOnResize: true,
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      })

      chartRef.current = chart

      // Server-authoritative OTC via WebSocket — DESLIGADO temporariamente.
      // Ativar setando NEXT_PUBLIC_OTC_WS=1. Mantemos engine client-side enquanto
      // depuramos o handshake do WS no navegador (wscat funciona, browser não).
      if (process.env.NEXT_PUBLIC_OTC_WS === '1') {
        const otcSymbol = assetIdToOtcSymbol(asset.id)
        if (otcSymbol) {
          otcWs = subscribeOtc(otcSymbol, (tick) => { otcWsPrice = tick.price })
        }
      }

      // Real data for configured assets; OTC engine for everything else
      const realConfig = REAL_ASSETS[asset.id] ?? null
      const isBinance  = realConfig?.source === 'binance'
      const interval   = realConfig
        ? (isBinance ? tfToBinanceInterval(selectedTf.seconds) : String(selectedTf.seconds))
        : null

      const candleLimit = 300
      const cacheKey = `${asset.id}:${selectedTf.seconds}`
      const cached = candleCache.get(cacheKey)

      // 1. Busca preço real ANTES dos candles para poder seedar os mock corretamente
      let realPrice: number | null = null
      if (realConfig) {
        const priceParams = new URLSearchParams({ symbol: realConfig.symbol, source: realConfig.source })
        try {
          const res = await fetch(`/api/market/price?${priceParams}`)
          const json = await res.json()
          if (json.price) realPrice = json.price
        } catch {}
        realPriceInterval = setInterval(async () => {
          try {
            const r = await fetch(`/api/market/price?${priceParams}`)
            const j = await r.json()
            if (j.price) realPrice = j.price
          } catch {}
        }, 12_000)
      }

      // 2. Gera candles mock usando o preço real como seed (fallback para asset.price)
      const seedPrice = realPrice ?? asset.price
      let candles: Candle[]
      if (cached && Date.now() - cached.ts < CANDLE_CACHE_TTL) {
        candles = cached.candles
      } else {
        candles = generateMockCandles(seedPrice, candleLimit, selectedTf.seconds, cacheKey)
        candleCache.set(cacheKey, { candles, ts: Date.now() })
      }

      // 3. Tenta substituir pelos candles reais — mas só se não estiverem velhos
      //    (Forex fecha no fim de semana; candles velhos causam gap visual enorme)
      if (realConfig && interval) {
        try {
          const params = new URLSearchParams({
            symbol:   realConfig.symbol,
            source:   realConfig.source,
            interval,
            limit:    String(candleLimit),
          })
          const res = await fetch(`/api/market/candles?${params}`)
          const json = await res.json()
          if (json.candles?.length > 0) {
            const last = json.candles[json.candles.length - 1]
            const nowBRT = Math.floor(Date.now() / 1000) - 3 * 3600
            const ageHours = (nowBRT - (last.time as number)) / 3600
            // Binance: sempre usa (cripto 24/7). Yahoo: só usa se candles < 3h
            const useReal = isBinance || ageHours < 3
            if (useReal) {
              candles = json.candles
              candleCache.set(cacheKey, { candles, ts: Date.now() })
            }
            // Se candles estão velhos (forex fechado), mantém OTC mock
            // seedado do preço real — visual coerente com o preço atual
          }
        } catch {}
      }

      // BB fill areas must be added BEFORE the main series so candles render on top
      const bbData = showBB ? calculateBollingerBands(candles, bbSettings.period, bbSettings.deviation) : []
      if (showBB && bbData.length > 0) {
        const fillRgba = hexToRgba(bbSettings.colorFill, 0.14)
        const areaCommon = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineWidth: 0 as const }
        const upperFill = chart.addSeries(AreaSeries, { lineColor: 'transparent', topColor: fillRgba, bottomColor: fillRgba, ...areaCommon })
        upperFill.setData(bbData.map(d => ({ time: d.time, value: d.upper })))
        // Erase area below lower band so fill only appears between the bands
        const eraseFill = chart.addSeries(AreaSeries, { lineColor: 'transparent', topColor: tc.bg, bottomColor: tc.bg, ...areaCommon })
        eraseFill.setData(bbData.map(d => ({ time: d.time, value: d.lower })))
      }

      // Main series based on chart type
      let mainSeries: any
      if (chartType === 'area') {
        mainSeries = chart.addSeries(AreaSeries, {
          lineColor: '#26a69a',
          topColor: 'rgba(38, 166, 154, 0.3)',
          bottomColor: 'rgba(38, 166, 154, 0.01)',
          lineWidth: 2,
        })
        mainSeries.setData(candles.map(c => ({ time: c.time, value: c.close })))
      } else if (chartType === 'barras') {
        mainSeries = chart.addSeries(BarSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
        })
        mainSeries.setData(candles)
      } else if (chartType === 'heiken-ashi') {
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderUpColor: '#26a69a',
          borderDownColor: '#ef5350',
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        })
        mainSeries.setData(toHeikenAshi(candles))
      } else {
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderUpColor: '#26a69a',
          borderDownColor: '#ef5350',
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        })
        mainSeries.setData(candles)
      }

      seriesRef.current = mainSeries
      setChartKey(k => k + 1) // sinaliza que o gráfico está pronto para receber price lines

      // Dashed price line at current close — estilo Quotex
      mainSeries.applyOptions({
        priceLineVisible: true,
        priceLineStyle: LineStyle.Dashed,
        priceLineColor: 'rgba(255,255,255,0.25)',
        lastValueVisible: false,
      })

      // Moving Average overlay
      if (showSMA) {
        const maData = calculateMA(candles, maSettings)
        const smaSeries = chart.addSeries(LineSeries, {
          color: maSettings.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        smaSeries.setData(maData)
      }

      // ZigZag overlay
      if (showZigzag) {
        const zzData = calculateZigZag(candles, 5)
        if (zzData.length > 1) {
          const zzSeries = chart.addSeries(LineSeries, {
            color: '#ef4444',
            lineWidth: 1.5,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          zzSeries.setData(zzData)
        }
      }

      // Bollinger Bands — line overlays (fill was added before main series for correct z-order)
      if (showBB && bbData.length > 0) {
        const bbCommon = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
        const bbUpper = chart.addSeries(LineSeries, { color: bbSettings.colorTop, lineWidth: 1, ...bbCommon })
        const bbMid   = chart.addSeries(LineSeries, { color: hexToRgba(bbSettings.colorMid, 0.6), lineWidth: 1, lineStyle: LineStyle.Dashed, ...bbCommon })
        const bbLower = chart.addSeries(LineSeries, { color: bbSettings.colorBot, lineWidth: 1, ...bbCommon })
        bbUpper.setData(bbData.map(d => ({ time: d.time, value: d.upper })))
        bbMid.setData(bbData.map(d => ({ time: d.time, value: d.middle })))
        bbLower.setData(bbData.map(d => ({ time: d.time, value: d.lower })))
      }

      // Parabolic SAR overlay — split into segments by trend direction
      if (showPSAR) {
        const sarData = calculateParabolicSAR(candles)
        const segments: { time: number; value: number }[][] = []
        let seg: { time: number; value: number }[] = []
        let lastBull: boolean | null = null
        for (const d of sarData) {
          if (lastBull !== null && d.bull !== lastBull) { segments.push(seg); seg = [] }
          seg.push({ time: d.time, value: d.value }); lastBull = d.bull
        }
        if (seg.length > 0) segments.push(seg)
        for (const segment of segments) {
          const sarSeg = chart.addSeries(LineSeries, {
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          sarSeg.setData(segment)
        }
      }

      // OHLC crosshair subscription
      chart.subscribeCrosshairMove((param: any) => {
        if (!param || !param.time || !param.seriesData) { setOhlc(null); setCandleTime(''); return }
        const data = param.seriesData.get(mainSeries)
        if (!data) { setOhlc(null); return }
        const open  = data.open  ?? data.value ?? 0
        const close = data.close ?? data.value ?? 0
        const high  = data.high  ?? data.value ?? 0
        const low   = data.low   ?? data.value ?? 0
        setOhlc({ open, high, low, close })
        const t = typeof param.time === 'number' ? param.time : 0
        const d = new Date(t * 1000)
        const h = d.getHours().toString().padStart(2, '0')
        const m = d.getMinutes().toString().padStart(2, '0')
        const s = d.getSeconds().toString().padStart(2, '0')
        setCandleTime(`${h}:${m}:${s}`)
      })

      chart.timeScale().scrollToRealTime()

      // ── OTC Live Engine ───────────────────────────────────────────────────
      const decimals = getAssetDecimals(asset)
      const fmt5 = (v: number) => parseFloat(v.toFixed(decimals))
      const tfSec = selectedTf.seconds

      const BRT_OFFSET = -3 * 3600
      const nowSec = () => Math.floor(Date.now() / 1000) + BRT_OFFSET
      const alignedStart = (t: number) => Math.floor(t / tfSec) * tfSec

      const getPrice = () => {
        // Server-authoritative: se temos tick OTC ao vivo do backend, usa ele.
        // Cai pro engine client-side determinístico apenas como fallback (WS ainda não chegou).
        if (otcWsPrice != null) return fmt5(otcWsPrice)
        if (!realConfig || realPrice == null) return fmt5(getOTCPrice(asset.id, nowSec(), asset.price))
        const otcBase = getOTCPrice(asset.id, nowSec(), realPrice)
        const noise   = (otcBase - realPrice) * 0.08
        return fmt5(realPrice + noise)
      }

      // ── Separação tick / frame ────────────────────────────────────────────
      // targetPrice  → preço real do tick (200ms)
      // displayedPrice → interpola suavemente até targetPrice a cada frame (~60fps)
      const SMOOTH = 0.12

      // Âncora de abertura: fechamento do último candle histórico.
      // Garante continuidade visual — a vela ao vivo abre exatamente onde a
      // história terminou, evitando o corpo inicial enorme causado por pico do OTC.
      const lastHistClose = fmt5(candles[candles.length - 1].close)
      let targetPrice     = getPrice()
      let displayedPrice  = lastHistClose  // anima DO histórico ATÉ o preço real

      let candleStart  = alignedStart(nowSec())
      let candleOpen   = lastHistClose     // abre no fechamento anterior
      let candleHigh   = Math.max(lastHistClose, targetPrice)
      let candleLow    = Math.min(lastHistClose, targetPrice)
      const entryPrice = lastHistClose
      let lastSecsLeft = -1

      // Preenche gap entre último candle histórico e o motor ao vivo
      const lastHistTime = candles[candles.length - 1].time as number
      for (let gapT = lastHistTime + tfSec; gapT < candleStart; gapT += tfSec) {
        const gapPrice = fmt5(getOTCPrice(asset.id, gapT, asset.price))
        if (chartType === 'area') mainSeries.update({ time: gapT, value: gapPrice })
        else mainSeries.update({ time: gapT, open: gapPrice, high: gapPrice, low: gapPrice, close: gapPrice })
      }
      // Candle inicial
      if (chartType === 'area') mainSeries.update({ time: candleStart, value: lastHistClose })
      else mainSeries.update({ time: candleStart, open: candleOpen, high: candleHigh, low: candleLow, close: lastHistClose })

      chart.timeScale().scrollToRealTime()
      setCurrentPrice(lastHistClose)
      onPriceUpdateRef.current?.(lastHistClose)

      // ── Tick (200ms): atualiza targetPrice, high/low e estado de tempo ────
      priceInterval = setInterval(() => {
        const next = getPrice()
        if (next > 0) targetPrice = next

        const now = nowSec()

        // Avança candle quando o período termina.
        // Snap de displayedPrice → targetPrice na troca de vela:
        // garante que a nova vela abre no preço real, sem herdar o lag
        // da interpolação anterior (que causava candles enormes no primeiro tick).
        if (now >= candleStart + tfSec) {
          candleStart    = alignedStart(now)
          displayedPrice = targetPrice          // cancela lag pendente
          candleOpen     = fmt5(targetPrice)
          candleHigh     = candleOpen
          candleLow      = candleOpen
        }

        // High/low atualizados pelo preço real (tick), não pela animação.
        // Isso evita que o caminho da interpolação expanda o corpo da vela.
        if (targetPrice > candleHigh) candleHigh = targetPrice
        if (targetPrice < candleLow)  candleLow  = targetPrice

        // Timer de expiração do candle
        const secsLeft = tfSec - (now % tfSec)
        if (secsLeft !== lastSecsLeft) {
          lastSecsLeft = secsLeft
          setCandleSecsLeft(secsLeft)
        }

        // Posição X do timer (eixo de tempo)
        if (chartRef.current) {
          const x = chartRef.current.timeScale().timeToCoordinate(now)
          const chartW = chartContainerRef.current?.clientWidth ?? 0
          setCandleTimerX(x != null && x > 0 && x < chartW ? x : null)
        }
      }, 200)

      // ── RAF (~60fps): interpola displayedPrice → targetPrice e renderiza ─
      function animate() {
        displayedPrice = displayedPrice + (targetPrice - displayedPrice) * SMOOTH
        const dp = fmt5(displayedPrice)

        // High/low NÃO são atualizados aqui — apenas o tick usa targetPrice para isso.
        // O RAF só anima o close (displayedPrice) dentro dos limites já definidos.

        const candle = { time: candleStart, open: candleOpen, high: candleHigh, low: candleLow, close: dp }

        try {
          if (chartType === 'area') {
            mainSeries.update({ time: candleStart, value: dp })
          } else if (chartType === 'heiken-ashi') {
            const haClose = fmt5((candleOpen + candleHigh + candleLow + dp) / 4)
            mainSeries.update({ ...candle, close: haClose })
          } else {
            mainSeries.update(candle)
          }
        } catch {}

        if (autoScrollRef.current && chartRef.current) {
          chartRef.current.timeScale().scrollToRealTime()
        }

        setCurrentPrice(dp)
        setPriceChange(fmt5(dp - entryPrice))
        onPriceUpdateRef.current?.(dp)

        // Posição Y da label de preço (eixo vertical)
        try {
          const y = mainSeries.priceToCoordinate(dp)
          setCandleTimerY(y ?? null)
        } catch {}

        rafId = requestAnimationFrame(animate)
      }

      rafId = requestAnimationFrame(animate)
    }

    initChart()

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    })

    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current)

    return () => {
      clearInterval(priceInterval)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (realPriceInterval) clearInterval(realPriceInterval)
      if (otcWs) { otcWs.close(); otcWs = null }
      resizeObserver.disconnect()
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
      // Limpa refs de séries destruídas para que as linhas sejam recriadas no novo gráfico
      seriesRef.current = null
      priceLinesRef.current = {}
    }
  }, [asset.id, asset.price, tfIndex, chartType, showSMA, showZigzag, showBB, showPSAR, bbSettings, maSettings])

  // ── Oscillator sub-panel (RSI / MACD) ────────────────────────────────────
  useEffect(() => {
    if (!activeOsc) {
      if (oscChartRef.current) { oscChartRef.current.remove(); oscChartRef.current = null }
      return
    }

    let oscChart: any = null
    let unsubMain = () => {}, unsubOsc = () => {}

    async function initOscChart() {
      if (!oscChartContainerRef.current) return
      const { createChart, ColorType, LineSeries, HistogramSeries } = await import('lightweight-charts')
      const tc = THEME_COLORS[theme]

      oscChart = createChart(oscChartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: tc.bg }, textColor: tc.text, fontSize: 10 },
        grid:   { vertLines: { color: tc.grid }, horzLines: { color: tc.grid } },
        rightPriceScale: { borderColor: tc.border, textColor: tc.text, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: tc.border, timeVisible: false, visible: false },
        crosshair: { vertLine: { color: tc.crosshair, labelVisible: false }, horzLine: { color: tc.crosshair, labelBackgroundColor: tc.labelBg } },
        handleScroll: { mouseWheel: false },
        handleScale:  { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
        width:  oscChartContainerRef.current.clientWidth,
        height: oscChartContainerRef.current.clientHeight,
      })
      oscChartRef.current = oscChart

      const tfSec = TIMEFRAMES[tfIndex].seconds
      const candles = generateMockCandles(asset.price, 80, tfSec, `${asset.id}:${tfSec}`)

      if (activeOsc === 'rsi') {
        const rsiSeries = oscChart.addSeries(LineSeries, {
          color: rsiSettings.colorMain, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        })
        rsiSeries.setData(calculateRSI(candles, rsiSettings.period))
        rsiSeries.createPriceLine({ price: rsiSettings.overbought, color: rsiSettings.colorOverbought, lineWidth: 1, lineStyle: 2, axisLabelVisible: true })
        rsiSeries.createPriceLine({ price: rsiSettings.oversold,   color: rsiSettings.colorOversold,   lineWidth: 1, lineStyle: 2, axisLabelVisible: true })
        rsiSeries.createPriceLine({ price: 50, color: '#ffffff18', lineWidth: 1, lineStyle: 2, axisLabelVisible: false })
      } else {
        const { macdLine, signalLine, histogram } = calculateMACD(candles, macdSettings.fastPeriod, macdSettings.slowPeriod, macdSettings.signalPeriod)
        const histSeries = oscChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false })
        histSeries.setData(histogram.map(d => ({
          ...d,
          color: d.value >= 0
            ? hexToRgba(macdSettings.colorHistogram, 0.9)
            : hexToRgba(macdSettings.colorHistogram, 0.45),
        })))
        const macdSeries = oscChart.addSeries(LineSeries, { color: macdSettings.colorMACD, lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
        macdSeries.setData(macdLine)
        const sigSeries = oscChart.addSeries(LineSeries, { color: macdSettings.colorSignal, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false })
        sigSeries.setData(signalLine)
      }

      // Sync timeScale with main chart
      const mainRange = chartRef.current?.timeScale().getVisibleLogicalRange()
      if (mainRange) try { oscChart.timeScale().setVisibleLogicalRange(mainRange) } catch {}

      let syncing = false
      const handleMain = (range: any) => {
        if (syncing || !range) return; syncing = true
        try { oscChart?.timeScale().setVisibleLogicalRange(range) } catch {}
        syncing = false
      }
      const handleOsc = (range: any) => {
        if (syncing || !range) return; syncing = true
        try { chartRef.current?.timeScale().setVisibleLogicalRange(range) } catch {}
        syncing = false
      }
      chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange(handleMain)
      oscChart.timeScale().subscribeVisibleLogicalRangeChange(handleOsc)
      unsubMain = () => { try { chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(handleMain) } catch {} }
      unsubOsc  = () => { try { oscChart?.timeScale().unsubscribeVisibleLogicalRangeChange(handleOsc) } catch {} }

      const ro = new ResizeObserver(() => {
        if (oscChart && oscChartContainerRef.current)
          oscChart.applyOptions({ width: oscChartContainerRef.current.clientWidth, height: oscChartContainerRef.current.clientHeight })
      })
      if (oscChartContainerRef.current) ro.observe(oscChartContainerRef.current)
    }

    initOscChart()
    return () => {
      unsubMain(); unsubOsc()
      if (oscChartRef.current) { oscChartRef.current.remove(); oscChartRef.current = null }
    }
  }, [activeOsc, asset.id, asset.price, tfIndex, theme, macdSettings, rsiSettings])

  const fmt = (v: number) => v.toFixed(getAssetDecimals(asset))

  // ── Select + drag drawings ────────────────────────────────────────────────
  const startDrawingDrag = useCallback((
    id: string,
    handle: 'body' | 'p1' | 'p2',
    e: React.MouseEvent,
    origDrawing: Drawing,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedDrawingId(id)
    setDrawingsOpen(true)
    draggingRef.current = { id, handle, startClientX: e.clientX, startClientY: e.clientY, origDrawing }

    const onMove = (me: MouseEvent) => {
      const drag = draggingRef.current
      if (!drag || !chartRef.current || !seriesRef.current || !chartContainerRef.current) return
      const ts = chartRef.current.timeScale()
      const dx = me.clientX - drag.startClientX
      const dy = me.clientY - drag.startClientY
      const orig = drag.origDrawing

      setDrawings(prev => prev.map(item => {
        if (item.id !== drag.id) return item

        if (item.type === 'hline') {
          const origY = seriesRef.current!.priceToCoordinate((orig as typeof item).price)
          if (origY == null) return item
          const newPrice = seriesRef.current!.coordinateToPrice(origY + dy) as number | null
          return newPrice != null ? { ...item, price: newPrice } : item
        }

        if (item.type === 'vline') {
          const origX = ts.timeToCoordinate((orig as typeof item).time)
          if (origX == null) return item
          const newTime = ts.coordinateToTime(origX + dx) as number | null
          return newTime != null ? { ...item, time: newTime } : item
        }

        if (item.type === 'trendline' || item.type === 'fib') {
          const o = orig as Extract<Drawing, { type: 'trendline' | 'fib' }>
          const getNew = (p: { time: number; price: number }, ddx: number, ddy: number) => {
            const ox = ts.timeToCoordinate(p.time)
            const oy = seriesRef.current!.priceToCoordinate(p.price)
            if (ox == null || oy == null) return p
            const nt = ts.coordinateToTime(ox + ddx) as number | null
            const np = seriesRef.current!.coordinateToPrice(oy + ddy) as number | null
            return nt != null && np != null ? { time: nt, price: np } : p
          }

          if (drag.handle === 'p1') return { ...item, p1: getNew(o.p1, dx, dy) }
          if (drag.handle === 'p2') return { ...item, p2: getNew(o.p2, dx, dy) }
          // body: move both points
          return { ...item, p1: getNew(o.p1, dx, dy), p2: getNew(o.p2, dx, dy) }
        }

        return item
      }))
    }

    const onUp = () => {
      draggingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const updateDrawingColor = useCallback((id: string, color: string) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, color } : d))
  }, [])

  const updateDrawingStyle = useCallback((id: string, style: DrawingStyle) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, style } : d))
  }, [])

  const deleteDrawing = useCallback((id: string) => {
    setDrawings(prev => prev.filter(d => d.id !== id))
    setSelectedDrawingId(null)
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#151822] relative overflow-hidden" onClick={() => { setTfOpen(false); setChartTypeOpen(false) }} onKeyDown={() => {}}>

      {/* Top info bar */}
      <div className="absolute top-2 left-3 z-10 flex items-center gap-3 pointer-events-none">
        <div className="text-[11px] text-[#8b8f9a]">{timestamp}</div>
        <button
          onClick={onInfoClick}
          className="pointer-events-auto flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          <span className="w-3.5 h-3.5 rounded-full bg-blue-500/20 border border-blue-400 flex items-center justify-center text-[8px] font-bold">i</span>
          INFORMAÇÃO DO PAR
        </button>
      </div>

      {/* Active indicators bar */}
      {(showSMA || showZigzag || showBB || showPSAR || showRSI || showMACD) && (
        <div className="absolute top-8 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none max-w-[calc(100%-120px)]">
          <button className="pointer-events-auto w-5 h-5 flex items-center justify-center text-[#8b8f9a] hover:text-white transition-colors">
            <Eye size={12} />
          </button>

          {showSMA && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#1d2130]/80 border border-[#2a2e3b] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#8b8f9a] tracking-widest">MOVING AVERAGE</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5" style={{ backgroundColor: maSettings.color }} />
              <span className="text-[#8b8f9a]">{maSettings.type}</span>
              <span className="text-white font-bold">{maSettings.period}</span>
              <button onClick={() => setMAEditOpen(v => !v)} className="text-[#8b8f9a] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('moving-average')} className="text-[#8b8f9a] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showZigzag && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#1d2130]/80 border border-[#2a2e3b] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#8b8f9a] tracking-widest">ZIG ZAG</span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 ml-0.5" />
              <button onClick={() => toggleIndicator('zig-zag')} className="text-[#8b8f9a] hover:text-red-400 ml-1 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showBB && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#1d2130]/80 border border-[#2a2e3b] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#8b8f9a] tracking-widest">BOLLINGER BANDS</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5 border" style={{ backgroundColor: bbSettings.colorFill + '60', borderColor: bbSettings.colorTop }} />
              <span className="text-white font-bold">{bbSettings.period}</span>
              <span className="text-white font-bold">{bbSettings.deviation}</span>
              <button onClick={() => setBBEditOpen(v => !v)} className="text-[#8b8f9a] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('bollinger-bands')} className="text-[#8b8f9a] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showPSAR && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#1d2130]/80 border border-[#2a2e3b] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#8b8f9a] tracking-widest">PSAR</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0 ml-0.5" />
              <button onClick={() => toggleIndicator('parabolic-sar')} className="text-[#8b8f9a] hover:text-red-400 ml-1 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showRSI && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#1d2130]/80 border border-[#2a2e3b] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#8b8f9a] tracking-widest">RSI</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5" style={{ backgroundColor: rsiSettings.colorMain }} />
              <span className="text-white font-bold">{rsiSettings.period}</span>
              <span className="text-white font-bold">{rsiSettings.overbought}</span>
              <span className="text-white font-bold">{rsiSettings.oversold}</span>
              <button onClick={() => setRSIEditOpen(v => !v)} className="text-[#8b8f9a] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('rsi')} className="text-[#8b8f9a] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showMACD && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#1d2130]/80 border border-[#2a2e3b] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#8b8f9a] tracking-widest">MACD</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: macdSettings.colorHistogram }} />
              <span className="text-white font-bold">{macdSettings.fastPeriod}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: macdSettings.colorMACD }} />
              <span className="text-white font-bold">{macdSettings.slowPeriod}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: macdSettings.colorSignal }} />
              <span className="text-white font-bold">{macdSettings.signalPeriod}</span>
              <button onClick={() => setMACDEditOpen(v => !v)} className="text-[#8b8f9a] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('macd')} className="text-[#8b8f9a] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}
        </div>
      )}

      {/* ── Label flutuante de preço atual (segue o preço no eixo Y) ─────── */}
      {candleTimerY != null && (
        <div className="absolute z-10 right-0 flex items-center gap-1"
          style={{ top: candleTimerY, transform: 'translateY(-50%)' }}>

          {/* Timer de expiração do candle atual */}
          <div className="bg-[#1d2130] border border-[#2a2e3b] text-white text-[10px] font-mono font-bold px-1.5 py-[2px] rounded">
            {String(Math.floor(candleSecsLeft / 60)).padStart(2, '0')}:{String(candleSecsLeft % 60).padStart(2, '0')}
          </div>

          {/* Sino de alerta — clicável para ativar alerta de preço */}
          <button
            onClick={() => setAlertSet(v => !v)}
            className={cn(
              'flex items-center gap-1 px-2 py-[3px] rounded-l text-[11px] font-bold border transition-colors',
              alertSet
                ? 'bg-yellow-500 text-[#151822] border-yellow-400'
                : 'bg-[#1d2130] text-[#8b8f9a] border-[#2a2e3b] hover:text-yellow-400 hover:border-yellow-500/50'
            )}
          >
            <Bell size={11} className={alertSet ? 'text-[#151822]' : ''} />
            <span className="font-mono">{fmt(currentPrice)}</span>
          </button>
        </div>
      )}

      {/* Drawings panel / settings overlay */}
      {drawingsOpen && (() => {
        const selDraw = selectedDrawingId ? drawings.find(d => d.id === selectedDrawingId) : null
        if (selDraw) {
          return (
            <DrawingSettingsPanel
              drawingType={selDraw.type}
              color={selDraw.color}
              style={selDraw.style ?? 'dashed'}
              onColorChange={c => updateDrawingColor(selDraw.id, c)}
              onStyleChange={s => updateDrawingStyle(selDraw.id, s)}
              onDelete={() => { deleteDrawing(selDraw.id); setDrawingsOpen(false) }}
              onBack={() => setSelectedDrawingId(null)}
            />
          )
        }
        return (
          <DrawingsPanel
            onClose={() => setDrawingsOpen(false)}
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            onClearAll={() => { setDrawings([]); setDrawingPixels([]); setSelectedDrawingId(null) }}
          />
        )
      })()}

      {/* Indicators panel overlay */}
      {indicadoresOpen && !bbEditOpen && !maEditOpen && !macdEditOpen && !rsiEditOpen && (
        <IndicadoresPanel
          onClose={() => setIndicadoresOpen(false)}
          activeIds={activeIndicators}
          onToggle={toggleIndicator}
          onClearAll={clearAllIndicators}
        />
      )}

      {/* BB settings panel */}
      {bbEditOpen && (
        <BBSettingsPanel
          settings={bbSettings}
          onChange={setBBSettings}
          onBack={() => setBBEditOpen(false)}
          onDelete={() => { toggleIndicator('bollinger-bands'); setBBEditOpen(false) }}
        />
      )}

      {/* MA settings panel */}
      {maEditOpen && (
        <MASettingsPanel
          settings={maSettings}
          onChange={setMASettings}
          onBack={() => setMAEditOpen(false)}
          onDelete={() => { toggleIndicator('moving-average'); setMAEditOpen(false) }}
        />
      )}

      {/* MACD settings panel */}
      {macdEditOpen && (
        <MACDSettingsPanel
          settings={macdSettings}
          onChange={setMACDSettings}
          onBack={() => setMACDEditOpen(false)}
          onDelete={() => { toggleIndicator('macd'); setMACDEditOpen(false) }}
        />
      )}

      {/* RSI settings panel */}
      {rsiEditOpen && (
        <RSISettingsPanel
          settings={rsiSettings}
          onChange={setRSISettings}
          onBack={() => setRSIEditOpen(false)}
          onDelete={() => { toggleIndicator('rsi'); setRSIEditOpen(false) }}
        />
      )}

      {/* ── Trade overlays estilo Quotex ─────────────────────────────────────── */}
      {activeTrades.map(trade => {
        const pos = tradePositions[trade.id]
        if (!pos) return null
        const isCall  = trade.direction === 'CALL'
        const color   = isCall ? '#26a69a' : '#ef5350'
        const { entryX, expiryX, entryY } = pos
        const segW    = Math.max(0, expiryX - entryX)

        // Zona P&L: entre preço de entrada e preço atual
        const currentY   = candleTimerY ?? entryY
        const isWinning  = isCall
          ? currentPrice > trade.entryPrice
          : currentPrice < trade.entryPrice
        const zoneColor  = isWinning ? '#26a69a' : '#ef5350'
        const zoneTop    = Math.min(entryY, currentY)
        const zoneHeight = Math.abs(currentY - entryY)

        return (
          <React.Fragment key={trade.id}>
            {/* Linha vertical tracejada — Abertura da negociação */}
            <div className="absolute pointer-events-none z-[4]"
              style={{
                left: entryX,
                top: 0,
                bottom: 0,
                width: 1,
                backgroundImage: `repeating-linear-gradient(to bottom, ${color}90 0px, ${color}90 6px, transparent 6px, transparent 12px)`,
              }} />
            {/* Label "Abertura da negociação" */}
            <div className="absolute pointer-events-none z-[8]"
              style={{ left: entryX + 6, top: 8 }}>
              <span className="text-[10px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded"
                style={{ color, backgroundColor: '#151822cc', border: `1px solid ${color}50` }}>
                Abertura da negociação
              </span>
            </div>

            {/* Linha vertical tracejada — Fechamento da negociação */}
            <div className="absolute pointer-events-none z-[4]"
              style={{
                left: expiryX,
                top: 0,
                bottom: 0,
                width: 1,
                backgroundImage: `repeating-linear-gradient(to bottom, ${color}90 0px, ${color}90 6px, transparent 6px, transparent 12px)`,
              }} />
            {/* Label "Fechamento da negociação" com countdown */}
            <div className="absolute pointer-events-none z-[8]"
              style={{ left: expiryX + 6, top: 8 }}>
              <TradeExpiryLabel expiryTime={trade.expiryTime} color={color} />
            </div>

            {/* Zona de P&L — faixa entre entrada e preço atual */}
            {zoneHeight > 0 && (
              <div className="absolute pointer-events-none z-[3]"
                style={{
                  left: entryX,
                  top: zoneTop,
                  width: segW,
                  height: zoneHeight,
                  backgroundColor: zoneColor,
                  opacity: 0.10,
                }} />
            )}

            {/* Linha horizontal da entrada até o vencimento */}
            <div className="absolute pointer-events-none z-[5]"
              style={{ left: entryX, top: entryY, width: segW, height: 1, backgroundColor: color, opacity: 0.85 }} />

            {/* Círculo de entrada com seta de direção */}
            <div className="absolute pointer-events-none z-[7] rounded-full flex items-center justify-center"
              style={{ left: entryX - 9, top: entryY - 9, width: 18, height: 18, backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
                {isCall
                  ? <polygon points="5,1 9,9 1,9" />
                  : <polygon points="5,9 9,1 1,1" />}
              </svg>
            </div>

            {/* Círculo de vencimento */}
            <div className="absolute pointer-events-none z-[7] rounded-full"
              style={{ left: expiryX - 6, top: entryY - 6, width: 12, height: 12, backgroundColor: color, border: '2px solid rgba(255,255,255,0.7)' }} />

            {/* Contador regressivo abaixo da linha de vencimento */}
            <TradeTimer expiryTime={trade.expiryTime} x={expiryX} y={entryY} color={color} />
          </React.Fragment>
        )
      })}

      {/* ── Drawing SVG overlay — interactive hit areas + visuals ─────────── */}
      {drawingPixels.length > 0 && (
        <svg
          className="absolute z-[6]"
          style={{ inset: 0, bottom: oscActive ? 130 : 0, overflow: 'visible', pointerEvents: activeTool ? 'none' : undefined }}
          width="100%" height="100%"
          onClick={() => { if (!draggingRef.current) setSelectedDrawingId(null) }}
        >
          {drawingPixels.map(dp => {
            const sel = dp.id === selectedDrawingId
            const dash = (() => {
              const orig = drawings.find(d => d.id === dp.id)
              return (orig?.style ?? 'dashed') === 'dashed' ? '5,4' : undefined
            })()
            const origDraw = drawings.find(d => d.id === dp.id)

            if (dp.type === 'hline') return (
              <g key={dp.id} style={{ pointerEvents: 'none' }}>
                {/* Hit area */}
                <line x1={0} y1={dp.y} x2="9999" y2={dp.y}
                  stroke="transparent" strokeWidth={14}
                  style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                />
                {/* Visible line */}
                <line x1={0} y1={dp.y} x2="9999" y2={dp.y}
                  stroke={sel ? '#ffffff' : dp.color}
                  strokeWidth={sel ? 1.5 : 1}
                  strokeDasharray={dash}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Price label */}
                <rect x={4} y={dp.y - 8} width={62} height={14} fill="#151822dd" rx={2} style={{ pointerEvents: 'none' }} />
                <text x={7} y={dp.y + 2} fill={sel ? '#ffffff' : dp.color} fontSize={9} fontFamily="monospace" style={{ pointerEvents: 'none' }}>
                  {dp.price.toFixed(5)}
                </text>
                {/* Selection circle handle */}
                {sel && <circle cx={200} cy={dp.y} r={5} fill={dp.color} stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />}
              </g>
            )

            if (dp.type === 'vline') return (
              <g key={dp.id} style={{ pointerEvents: 'none' }}>
                <line x1={dp.x} y1={0} x2={dp.x} y2="9999"
                  stroke="transparent" strokeWidth={14}
                  style={{ pointerEvents: 'stroke', cursor: 'ew-resize' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                />
                <line x1={dp.x} y1={0} x2={dp.x} y2="9999"
                  stroke={sel ? '#ffffff' : dp.color}
                  strokeWidth={sel ? 1.5 : 1}
                  strokeDasharray={dash}
                  style={{ pointerEvents: 'none' }}
                />
                {sel && <circle cx={dp.x} cy={80} r={5} fill={dp.color} stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />}
              </g>
            )

            if (dp.type === 'trendline') return (
              <g key={dp.id} style={{ pointerEvents: 'none' }}>
                {/* Body hit area */}
                <line x1={dp.x1} y1={dp.y1} x2={dp.x2} y2={dp.y2}
                  stroke="transparent" strokeWidth={14}
                  style={{ pointerEvents: 'stroke', cursor: 'move' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                />
                <line x1={dp.x1} y1={dp.y1} x2={dp.x2} y2={dp.y2}
                  stroke={sel ? '#ffffff' : dp.color}
                  strokeWidth={sel ? 2 : 1.5}
                  strokeDasharray={dash}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Endpoint handles */}
                <circle cx={dp.x1} cy={dp.y1} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                  stroke={dp.color} strokeWidth={sel ? 2 : 0}
                  style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'crosshair' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p1', e, origDraw)}
                />
                <circle cx={dp.x2} cy={dp.y2} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                  stroke={dp.color} strokeWidth={sel ? 2 : 0}
                  style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'crosshair' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p2', e, origDraw)}
                />
              </g>
            )

            if (dp.type === 'fib') {
              const xLeft  = Math.min(dp.x1, dp.x2)
              const xRight = Math.max(dp.x1, dp.x2)
              return (
                <g key={dp.id} style={{ pointerEvents: 'none' }}>
                  {/* Diagonal guide */}
                  <line x1={dp.x1} y1={dp.y1} x2={dp.x2} y2={dp.y2}
                    stroke={dp.color} strokeWidth={1} strokeDasharray="3,3" opacity={0.35}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Fib levels */}
                  {dp.levels.map((lv, i) => (
                    <g key={lv.ratio} style={{ pointerEvents: 'none' }}>
                      <line x1={xLeft} y1={lv.y} x2={xRight} y2={lv.y}
                        stroke="transparent" strokeWidth={12}
                        style={{ pointerEvents: 'stroke', cursor: 'move' }}
                        onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                      />
                      <line x1={xLeft} y1={lv.y} x2={xRight} y2={lv.y}
                        stroke={sel ? '#ffffff' : FIB_COLORS[i % FIB_COLORS.length]}
                        strokeWidth={1}
                        style={{ pointerEvents: 'none' }}
                      />
                      <rect x={xRight + 4} y={lv.y - 7} width={48} height={12} fill="#151822dd" rx={2} style={{ pointerEvents: 'none' }} />
                      <text x={xRight + 7} y={lv.y + 2}
                        fill={sel ? '#ffffff' : FIB_COLORS[i % FIB_COLORS.length]}
                        fontSize={9} fontFamily="monospace"
                        style={{ pointerEvents: 'none' }}
                      >
                        {(lv.ratio * 100).toFixed(1)}%
                      </text>
                    </g>
                  ))}
                  {/* Endpoint handles when selected */}
                  {sel && <>
                    <circle cx={dp.x1} cy={dp.y1} r={6} fill="#fff" stroke={dp.color} strokeWidth={2}
                      style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                      onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p1', e, origDraw)}
                    />
                    <circle cx={dp.x2} cy={dp.y2} r={6} fill="#fff" stroke={dp.color} strokeWidth={2}
                      style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                      onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p2', e, origDraw)}
                    />
                  </>}
                </g>
              )
            }
            return null
          })}
        </svg>
      )}

      {/* ── Inline toolbar for selected drawing ────────────────────────────── */}
      {selectedDrawingId && (() => {
        const dp = drawingPixels.find(p => p.id === selectedDrawingId)
        const draw = drawings.find(d => d.id === selectedDrawingId)
        if (!dp || !draw) return null
        const toolbarY = dp.type === 'hline' ? dp.y
          : dp.type === 'vline' ? 40
          : 'x1' in dp ? Math.min(dp.y1, dp.y2) - 8
          : 40
        const toolbarX = dp.type === 'vline' ? dp.x + 10
          : 'x1' in dp ? Math.min(dp.x1, dp.x2) + 10
          : 10
        const label = { hline: 'LINHA HORIZ.', vline: 'LINHA VERT.', trendline: 'TENDÊNCIA', fib: 'FIBONACCI' }[dp.type] ?? dp.type.toUpperCase()
        return (
          <div
            className="absolute z-[8] flex items-center gap-1 px-2 py-1 rounded"
            style={{
              left: toolbarX, top: toolbarY - 26,
              background: '#1a1e2e',
              border: '1px solid #2a2e3b',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              pointerEvents: 'auto',
              userSelect: 'none',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: draw.color }} />
            <span className="text-[10px] font-bold text-white tracking-wide">{label}</span>
            <div className="w-px h-3 bg-[#2a2e3b] mx-0.5" />
            <button
              onClick={() => { setDrawingsOpen(true); setSelectedDrawingId(selectedDrawingId) }}
              className="w-5 h-5 flex items-center justify-center text-[#8b8f9a] hover:text-white transition-colors text-[10px]"
              title="Configurações"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              onClick={() => deleteDrawing(selectedDrawingId)}
              className="w-5 h-5 flex items-center justify-center text-[#8b8f9a] hover:text-red-400 transition-colors"
              title="Remover"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )
      })()}

      {/* ── Live preview while drawing ──────────────────────────────────────── */}
      {activeTool && mousePx && (
        <svg
          className="absolute pointer-events-none z-[6]"
          style={{ inset: 0, bottom: oscActive ? 130 : 0, overflow: 'visible' }}
          width="100%" height="100%"
        >
          {activeTool === 'Linha horizontal' && (
            <line x1={0} y1={mousePx.y} x2="9999" y2={mousePx.y} stroke="#ffffff" strokeWidth={1} strokeDasharray="4,4" opacity={0.45} />
          )}
          {activeTool === 'Linha vertical' && (
            <line x1={mousePx.x} y1={0} x2={mousePx.x} y2="9999" stroke="#ffffff" strokeWidth={1} strokeDasharray="4,4" opacity={0.45} />
          )}
          {(activeTool === 'Linha de trend' || activeTool === 'Retração de Fibonacci') && pendingPoint && chartRef.current && seriesRef.current && (() => {
            const px1 = chartRef.current.timeScale().timeToCoordinate(pendingPoint.time) ?? mousePx.x
            const py1 = seriesRef.current.priceToCoordinate(pendingPoint.price) ?? mousePx.y
            return (
              <>
                <line x1={px1} y1={py1} x2={mousePx.x} y2={mousePx.y} stroke="#ffffff" strokeWidth={1} strokeDasharray="4,4" opacity={0.45} />
                <circle cx={px1} cy={py1} r={4} fill="#ffffff" opacity={0.6} />
              </>
            )
          })()}
        </svg>
      )}

      {/* ── Mouse capture layer (active only when a tool is selected) ────────── */}
      {activeTool && (
        <div
          className="absolute z-[15]"
          style={{ top: 0, left: 0, right: 0, bottom: oscActive ? 130 : 0, cursor: 'crosshair' }}
          onClick={(e) => {
            if (!chartRef.current || !seriesRef.current) return
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const ts = chartRef.current.timeScale()
            const time = ts.coordinateToTime(x) as number | null
            const price = seriesRef.current.coordinateToPrice(y) as number | null
            if (time == null || price == null) return
            const tool = activeToolRef.current!
            const isTwoPoint = tool === 'Linha de trend' || tool === 'Retração de Fibonacci'
            if (!isTwoPoint) {
              const color = nextDrawColor()
              const id = `d${Date.now()}`
              setDrawings(prev => [...prev, tool === 'Linha horizontal'
                ? { id, type: 'hline', price, color }
                : { id, type: 'vline', time, color }
              ])
              setActiveTool(null)
            } else {
              const pp = pendingPointRef.current
              if (!pp) {
                setPendingPoint({ price, time })
              } else {
                const color = nextDrawColor()
                const id = `d${Date.now()}`
                setDrawings(prev => [...prev, tool === 'Linha de trend'
                  ? { id, type: 'trendline', p1: pp, p2: { price, time }, color }
                  : { id, type: 'fib', p1: pp, p2: { price, time }, color }
                ])
                setPendingPoint(null)
                setActiveTool(null)
              }
            }
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            setMousePx({ x: e.clientX - rect.left, y: e.clientY - rect.top })
          }}
          onMouseLeave={() => setMousePx(null)}
        />
      )}

      {/* Chart — absolute so oscillator panel doesn't depend on flex shrink */}
      <div
        ref={chartContainerRef}
        className="absolute inset-0"
        style={{ bottom: oscActive ? 130 : 0 }}
      />

      {/* Oscillator sub-panel — absolute at the bottom */}
      {oscActive && (
        <div className="absolute bottom-0 left-0 right-0 border-t border-[#2a2e3b]" style={{ height: 130 }}>
          <div className="absolute top-1.5 left-3 z-10 pointer-events-none">
            <span className="text-[10px] font-bold text-[#8b8f9a] tracking-wide">
              {activeOsc === 'rsi'
                ? `RSI (${rsiSettings.period}) ${rsiSettings.overbought} ${rsiSettings.oversold}`
                : `MACD (${macdSettings.fastPeriod}, ${macdSettings.slowPeriod}, ${macdSettings.signalPeriod})`}
            </span>
          </div>
          <div ref={oscChartContainerRef} className="w-full h-full" />
        </div>
      )}

      {/* Bottom left toolbar — vertical column */}
      <div className="absolute left-3 flex flex-col items-start gap-1 z-10" style={{ bottom: oscActive ? 142 : 12 }}>
        {/* Pencil / Drawings */}
        <button
          onClick={() => setDrawingsOpen(v => !v)}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded border transition-colors',
            drawingsOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#1d2130] border-[#2a2e3b] text-[#8b8f9a] hover:text-white'
          )}
        >
          <Pencil size={12} />
        </button>

        {/* Timeframe selector */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setTfOpen(v => !v); setChartTypeOpen(false) }}
            className="w-7 h-7 flex items-center justify-center rounded bg-[#1d2130] border border-[#2a2e3b] text-white text-[10px] font-bold hover:border-blue-500/50 transition-colors"
          >
            {selectedTf.label}
          </button>
          {tfOpen && (
            <div
              className="absolute bottom-full mb-1 left-0 bg-[#1d2130] border border-[#2a2e3b] rounded-lg overflow-hidden shadow-xl z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-2 gap-px p-1 w-[100px]">
                {TIMEFRAMES.map((tf, i) => (
                  <button
                    key={tf.label}
                    onClick={() => { setTfIndex(i); setTfOpen(false) }}
                    className={cn('px-2 py-1.5 text-xs font-bold rounded transition-colors', i === tfIndex ? 'bg-blue-600 text-white' : 'text-[#8b8f9a] hover:text-white hover:bg-white/5')}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart type selector */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setChartTypeOpen(v => !v); setTfOpen(false) }}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded border transition-colors',
              chartTypeOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#1d2130] border-[#2a2e3b] text-[#8b8f9a] hover:text-white'
            )}
          >
            {selectedChartType.icon}
          </button>
          {chartTypeOpen && (
            <div
              className="absolute bottom-full mb-1 left-0 bg-[#1d2130] border border-[#2a2e3b] rounded-lg overflow-hidden shadow-xl z-50 w-[140px]"
              onClick={(e) => e.stopPropagation()}
            >
              {CHART_TYPES.map((ct) => (
                <button
                  key={ct.key}
                  onClick={() => { setChartType(ct.key); setChartTypeOpen(false) }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                    ct.key === chartType ? 'bg-blue-600/30 text-white' : 'text-[#8b8f9a] hover:bg-white/5 hover:text-white'
                  )}
                >
                  <span className={ct.key === chartType ? 'text-white' : 'text-[#8b8f9a]'}>{ct.icon}</span>
                  <span className="font-medium">{ct.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Indicators toggle */}
        <button
          onClick={() => { setIndicadoresOpen(v => !v); setDrawingsOpen(false) }}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded border transition-colors',
            indicadoresOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#1d2130] border-[#2a2e3b] text-[#8b8f9a] hover:text-white'
          )}
        >
          <Activity size={12} />
        </button>

        {/* Crosshair */}
        <button className="w-7 h-7 flex items-center justify-center rounded bg-[#1d2130] border border-[#2a2e3b] text-[#8b8f9a] hover:text-white transition-colors">
          <Crosshair size={12} />
        </button>

        {/* OHLC tooltip */}
        {ohlc && (
          <div className="flex flex-col gap-0.5 mt-0.5 text-[11px] text-[#8b8f9a] leading-relaxed">
            {candleTime && <span className="font-mono text-white/50 text-[10px]">{candleTime}</span>}
            <span>Abertura: <span className="text-white font-semibold">{fmt(ohlc.open)}</span></span>
            <span>Fechamento: <span className="text-white font-semibold">{fmt(ohlc.close)}</span></span>
            <span>Alto: <span className="text-green-400 font-semibold">{fmt(ohlc.high)}</span></span>
            <span>Baixo: <span className="text-red-400 font-semibold">{fmt(ohlc.low)}</span></span>
          </div>
        )}
      </div>

      {/* Bottom right zoom */}
      <div className="absolute right-3 flex items-center gap-1 z-10" style={{ bottom: oscActive ? 142 : 12 }}>
        <button
          onClick={() => chartRef.current?.timeScale().scrollToPosition((chartRef.current.timeScale().scrollPosition() ?? 0) - 5, true)}
          className="w-7 h-7 flex items-center justify-center rounded bg-[#1d2130] border border-[#2a2e3b] text-[#8b8f9a] hover:text-white transition-colors"
        >
          <ZoomOut size={12} />
        </button>
        <button
          onClick={() => chartRef.current?.timeScale().scrollToPosition((chartRef.current.timeScale().scrollPosition() ?? 0) + 5, true)}
          className="w-7 h-7 flex items-center justify-center rounded bg-[#1d2130] border border-[#2a2e3b] text-[#8b8f9a] hover:text-white transition-colors"
        >
          <ZoomIn size={12} />
        </button>
      </div>
    </div>
  )
}
