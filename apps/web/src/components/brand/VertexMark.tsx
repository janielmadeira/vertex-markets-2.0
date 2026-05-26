interface VertexMarkProps {
  size?: number
  className?: string
}

export function VertexMark({ size = 28, className }: VertexMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Vertex"
    >
      <defs>
        <linearGradient id="vx-mark-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#00e0a4" />
          <stop offset="100%" stopColor="#00b3ff" />
        </linearGradient>
      </defs>
      <rect x="5"  y="14" width="8" height="72" rx="1.5" fill="#ff4d6d" />
      <rect x="18" y="26" width="8" height="56" rx="1.5" fill="#ff4d6d" />
      <rect x="31" y="38" width="8" height="40" rx="1.5" fill="#ff4d6d" />
      <rect x="44" y="60" width="8" height="22" rx="1.5" fill="#7a8290" />
      <rect x="57" y="44" width="8" height="38" rx="1.5" fill="url(#vx-mark-grad)" />
      <rect x="70" y="30" width="8" height="52" rx="1.5" fill="url(#vx-mark-grad)" />
      <rect x="83" y="14" width="8" height="72" rx="1.5" fill="url(#vx-mark-grad)" />
    </svg>
  )
}
