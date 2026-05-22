'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Pencil, ZoomIn, ZoomOut, Crosshair, ChevronDown, Eye, Pen, X, Activity, Bell } from 'lucide-react'
import { generateMockCandles, getOTCPrice, getAssetDecimals, type Asset, type Candle, type ActiveTrade } from '@/lib/mockData'
import { REAL_ASSETS, tfToBinanceInterval } from '@/lib/marketSymbols'
import { cn } from '@/lib/utils'
import { DrawingsPanel } from './DrawingsPanel'
import { IndicadoresPanel } from './IndicadoresPanel'
import { BBSettingsPanel, type BBSettings, BB_DEFAULTS } from './BBSettingsPanel'
import { MASettingsPanel, type MASettings, type MAType, MA_DEFAULTS } from './MASettingsPanel'
import { MACDSettingsPanel, type MACDSettings, MACD_DEFAULTS } from './MACDSettingsPanel'
import { RSISettingsPanel, type RSISettings, RSI_DEFAULTS } from './RSISettingsPanel'

type ChartTheme = 'diurno' | 'crepusculo' | 'noite'
type ChartType = 'velas' | 'area' | 'barras' | 'heiken-ashi'

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

  useEffect(() => {
    let chart: any = null
    let priceInterval: ReturnType<typeof setInterval>
    let realPriceInterval: ReturnType<typeof setInterval> | null = null
    let rafId: number | null = null

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

      // Real data for configured assets; OTC engine for everything else
      const realConfig = REAL_ASSETS[asset.id] ?? null
      const isBinance  = realConfig?.source === 'binance'
      const interval   = realConfig
        ? (isBinance ? tfToBinanceInterval(selectedTf.seconds) : String(selectedTf.seconds))
        : null

      const candleLimit = 300
      const cacheKey = `${asset.id}:${selectedTf.seconds}`
      const cached = candleCache.get(cacheKey)

      // Usa cache se existir e ainda estiver dentro do TTL — garante que
      // ao voltar para um par o gráfico histórico seja idêntico ao anterior.
      let candles: Candle[]
      if (cached && Date.now() - cached.ts < CANDLE_CACHE_TTL) {
        candles = cached.candles
      } else {
        candles = generateMockCandles(asset.price, candleLimit, selectedTf.seconds, cacheKey)
        candleCache.set(cacheKey, { candles, ts: Date.now() })
      }

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
            candles = json.candles
            candleCache.set(cacheKey, { candles, ts: Date.now() })
          }
        } catch {}
      }

      // Fetch initial real price — used by live engine below
      let realPrice: number | null = null
      if (realConfig) {
        const priceParams = new URLSearchParams({ symbol: realConfig.symbol, source: realConfig.source })
        try {
          const res = await fetch(`/api/market/price?${priceParams}`)
          const json = await res.json()
          if (json.price) realPrice = json.price
        } catch {}
        // Poll every 12s — server cache 10s → máx 5 req/min (Basic: 8/min)
        realPriceInterval = setInterval(async () => {
          try {
            const r = await fetch(`/api/market/price?${priceParams}`)
            const j = await r.json()
            if (j.price) realPrice = j.price
          } catch {}
        }, 12_000)
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

      {/* Drawings panel overlay */}
      {drawingsOpen && <DrawingsPanel onClose={() => setDrawingsOpen(false)} />}

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
            {/* Zona de P&L — faixa entre entrada e preço atual */}
            {zoneHeight > 0 && (
              <div className="absolute pointer-events-none z-[3]"
                style={{
                  left: entryX,
                  top: zoneTop,
                  width: segW,
                  height: zoneHeight,
                  backgroundColor: zoneColor,
                  opacity: 0.12,
                }} />
            )}

            {/* Linha horizontal da entrada até o vencimento */}
            <div className="absolute pointer-events-none z-[5]"
              style={{ left: entryX, top: entryY, width: segW, height: 1, backgroundColor: color, opacity: 0.9 }} />

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
