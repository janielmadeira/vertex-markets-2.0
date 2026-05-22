'use client'

import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RSISettings {
  period: number
  overbought: number
  oversold: number
  colorOverbought: string
  colorOversold: string
  colorMain: string
}

export const RSI_DEFAULTS: RSISettings = {
  period: 14,
  overbought: 70,
  oversold: 30,
  colorOverbought: '#ef4444',
  colorOversold: '#ef4444',
  colorMain: '#22c55e',
}

const COLOR_PRESETS = [
  '#f97316', '#eab308', '#4ade80', '#22c55e', '#06b6d4', '#26a69a',
  '#60a5fa', '#8b5cf6', '#c084fc', '#f472b6', '#ec4899', '#ef4444',
  '#fb923c', '#86efac', '#67e8f9', '#818cf8', '#f9a8d4', '#b91c1c',
]

function NumberField({ label, value, onChange, min = 1, max = 100 }: {
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

interface RSISettingsPanelProps {
  settings: RSISettings
  onChange: (s: RSISettings) => void
  onBack: () => void
  onDelete: () => void
}

export function RSISettingsPanel({ settings, onChange, onBack, onDelete }: RSISettingsPanelProps) {
  const set = (patch: Partial<RSISettings>) => onChange({ ...settings, ...patch })

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
          <h2 className="text-sm font-bold text-white">RSI</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          <NumberField label="Período"              value={settings.period}     onChange={v => set({ period: v })}     min={2}  max={200} />
          <NumberField label="Nível de sobrecompra" value={settings.overbought} onChange={v => set({ overbought: v })} min={51} max={99}  />
          <NumberField label="Nível de sobrevenda"  value={settings.oversold}   onChange={v => set({ oversold: v })}   min={1}  max={49}  />
          <ColorPicker label="overbought" value={settings.colorOverbought} onChange={v => set({ colorOverbought: v })} />
          <ColorPicker label="oversold"   value={settings.colorOversold}   onChange={v => set({ colorOversold: v })} />
          <ColorPicker label="main"       value={settings.colorMain}       onChange={v => set({ colorMain: v })} />
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
