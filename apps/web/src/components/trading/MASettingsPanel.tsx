'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronDown, Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MAType = 'SMA' | 'EMA' | 'WMA' | 'SMMA'

export interface MASettings {
  period: number
  type: MAType
  color: string
}

export const MA_DEFAULTS: MASettings = {
  period: 20,
  type: 'SMA',
  color: '#ef4444',
}

const MA_TYPES: { value: MAType; label: string }[] = [
  { value: 'SMA',  label: 'SMA'  },
  { value: 'EMA',  label: 'EMA'  },
  { value: 'WMA',  label: 'WMA'  },
  { value: 'SMMA', label: 'SMMA' },
]

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

function TypeDropdown({ value, onChange }: { value: MAType; onChange: (t: MAType) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-4 py-3 border-b border-[#2a2e3b]">
      <span className="text-[11px] text-[#8b8f9a] uppercase tracking-wider">Moving average</span>
      <div className="relative mt-2">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded bg-[#252a3a] border border-[#2a2e3b] text-white text-sm hover:border-[#3a3f52] transition-colors"
        >
          <span className="font-medium">{value}</span>
          <ChevronDown size={14} className={cn('text-[#8b8f9a] transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-[#1a1e2e] border border-[#2a2e3b] rounded shadow-xl z-50 overflow-hidden">
            {MA_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => { onChange(t.value); setOpen(false) }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors',
                  t.value === value ? 'bg-blue-600/30 text-white' : 'text-[#8b8f9a] hover:bg-white/5 hover:text-white'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
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

interface MASettingsPanelProps {
  settings: MASettings
  onChange: (s: MASettings) => void
  onBack: () => void
  onDelete: () => void
}

export function MASettingsPanel({ settings, onChange, onBack, onDelete }: MASettingsPanelProps) {
  const set = (patch: Partial<MASettings>) => onChange({ ...settings, ...patch })

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
          <h2 className="text-sm font-bold text-white">Moving Average</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          <NumberField label="Período" value={settings.period} onChange={v => set({ period: v })} />
          <TypeDropdown value={settings.type} onChange={v => set({ type: v })} />
          <ColorPicker label="main" value={settings.color} onChange={v => set({ color: v })} />
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
