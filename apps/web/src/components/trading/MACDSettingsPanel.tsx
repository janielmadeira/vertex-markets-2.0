'use client'

import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MACDSettings {
  fastPeriod: number
  slowPeriod: number
  signalPeriod: number
  colorHistogram: string
  colorMACD: string
  colorSignal: string
}

export const MACD_DEFAULTS: MACDSettings = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  colorHistogram: '#26a69a',
  colorMACD: '#60a5fa',
  colorSignal: '#ef4444',
}

const COLOR_PRESETS = [
  '#f97316', '#ef4444', '#facc15', '#4ade80', '#22d3ee', '#26a69a',
  '#c084fc', '#f472b6', '#e879f9', '#b91c1c', '#a78bfa', '#60a5fa',
  '#fb923c', '#86efac', '#67e8f9', '#818cf8', '#f9a8d4', '#38bdf8',
]

function NumberField({ label, value, onChange, min = 1, max = 500 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number
}) {
  return (
    <div className="px-4 py-3 border-b border-[#2a2e3b]">
      <span className="text-[11px] text-[#8b8f9a] uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-7 h-7 flex items-center justify-center rounded bg-[#252a3a] text-white hover:bg-[#2d3347] transition-colors"
        >
          <Minus size={12} />
        </button>
        <span className="flex-1 text-center text-white font-bold text-lg tabular-nums">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-7 h-7 flex items-center justify-center rounded bg-[#252a3a] text-white hover:bg-[#2d3347] transition-colors"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div className="px-4 py-3 border-b border-[#2a2e3b]">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-5 h-5 rounded-full flex-shrink-0 border border-white/20" style={{ backgroundColor: value }} />
        <span className="text-[13px] text-white">{label}</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {COLOR_PRESETS.map(color => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={cn(
              'w-7 h-7 rounded-full border-2 transition-all',
              value === color ? 'border-white scale-110' : 'border-transparent hover:border-white/40'
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}

interface MACDSettingsPanelProps {
  settings: MACDSettings
  onChange: (s: MACDSettings) => void
  onBack: () => void
  onDelete: () => void
}

export function MACDSettingsPanel({ settings, onChange, onBack, onDelete }: MACDSettingsPanelProps) {
  const set = (patch: Partial<MACDSettings>) => onChange({ ...settings, ...patch })

  return (
    <div className="absolute top-0 left-0 h-full z-30 flex" style={{ width: 200 }}>
      <div className="flex flex-col w-full bg-[#1a1e2e] border-r border-[#2a2e3b] shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-[#2a2e3b] flex-shrink-0">
          <button
            onClick={onBack}
            className="w-6 h-6 flex items-center justify-center text-[#8b8f9a] hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-bold text-white">MACD</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          <NumberField label="Período rápido"  value={settings.fastPeriod}   onChange={v => set({ fastPeriod: v })}   min={1} max={200} />
          <NumberField label="Período lento"   value={settings.slowPeriod}   onChange={v => set({ slowPeriod: v })}   min={1} max={500} />
          <NumberField label="Período de sinal" value={settings.signalPeriod} onChange={v => set({ signalPeriod: v })} min={1} max={200} />
          <ColorPicker label="histogram" value={settings.colorHistogram} onChange={v => set({ colorHistogram: v })} />
          <ColorPicker label="macd"      value={settings.colorMACD}      onChange={v => set({ colorMACD: v })} />
          <ColorPicker label="signal"    value={settings.colorSignal}    onChange={v => set({ colorSignal: v })} />
        </div>

        <div className="border-t border-[#2a2e3b] p-3 flex-shrink-0">
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-sm font-semibold"
          >
            <Trash2 size={13} />
            Excluir
          </button>
        </div>
      </div>
    </div>
  )
}
