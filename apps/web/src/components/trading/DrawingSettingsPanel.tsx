'use client'

import { ChevronLeft, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESET_COLORS = [
  '#ef5350', '#f7931a', '#f1c40f',
  '#26a69a', '#42a5f5', '#ab47bc',
  '#ffffff', '#ff69b4', '#2196f3',
]

export const DRAWING_NAMES: Record<string, string> = {
  hline:     'Linha horizontal',
  vline:     'Linha vertical',
  trendline: 'Linha de trend',
  fib:       'Retração de Fibonacci',
}

interface DrawingSettingsPanelProps {
  drawingType: string
  color: string
  style: 'solid' | 'dashed'
  onColorChange: (c: string) => void
  onStyleChange: (s: 'solid' | 'dashed') => void
  onDelete: () => void
  onBack: () => void
}

export function DrawingSettingsPanel({
  drawingType, color, style,
  onColorChange, onStyleChange,
  onDelete, onBack,
}: DrawingSettingsPanelProps) {
  return (
    <div className="absolute top-0 left-0 h-full z-30 flex" style={{ width: 220 }}>
      <div className="flex flex-col w-full bg-[#1a1e2e] border-r border-[#2a2e3b] shadow-2xl">

        {/* Breadcrumb header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-[#2a2e3b] flex-shrink-0">
          <button
            onClick={onBack}
            className="text-[#8b8f9a] hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[11px] text-[#8b8f9a] font-medium">Desenhos</span>
        </div>

        {/* Drawing name */}
        <div className="px-4 py-3 border-b border-[#2a2e3b]">
          <span className="text-sm font-bold text-white">{DRAWING_NAMES[drawingType] ?? drawingType}</span>
        </div>

        {/* Color section */}
        <div className="px-4 py-3">
          <span className="text-[10px] font-bold text-[#8b8f9a] tracking-widest block mb-3">COR</span>
          {/* Active color preview */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-full border-2 border-white/30 shadow-lg"
              style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}60` }}
            />
            <span className="text-[11px] font-mono text-[#8b8f9a]">{color.toUpperCase()}</span>
          </div>

          {/* Color grid */}
          <div className="grid grid-cols-5 gap-1.5">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => onColorChange(c)}
                className="w-8 h-8 rounded transition-transform hover:scale-110 active:scale-95"
                style={{
                  backgroundColor: c,
                  border: color === c ? '2.5px solid white' : '2px solid transparent',
                  outline: color === c ? `2px solid ${c}80` : undefined,
                  boxShadow: color === c ? `0 0 8px ${c}` : undefined,
                }}
              />
            ))}
          </div>
        </div>

        {/* Style section */}
        <div className="px-4 py-3 border-t border-[#2a2e3b]">
          <span className="text-[10px] font-bold text-[#8b8f9a] tracking-widest block mb-2">ESTILO DA LINHA</span>
          <div className="flex gap-2">
            {(['solid', 'dashed'] as const).map(s => (
              <button
                key={s}
                onClick={() => onStyleChange(s)}
                className={cn(
                  'flex-1 py-1.5 rounded text-[11px] font-medium transition-colors border',
                  style === s
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[#1d2130] border-[#2a2e3b] text-[#8b8f9a] hover:text-white hover:border-[#3a3e4b]'
                )}
              >
                {s === 'solid' ? 'Contínuo' : 'Tracejado'}
              </button>
            ))}
          </div>
        </div>

        {/* Delete */}
        <div className="mt-auto px-4 py-4 border-t border-[#2a2e3b]">
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-2 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-[13px] border border-red-500/20"
          >
            <Trash2 size={13} />
            Remover desenho
          </button>
        </div>
      </div>
    </div>
  )
}
