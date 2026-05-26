# Vertex — Brand Assets

Logo final: **V-Reversal** (candles formando um V de reversão de mercado).

## Arquivos

```
design/logo-final/
├── svg/
│   ├── vertex-symbol.svg              # Símbolo isolado (1:1, full color)
│   ├── vertex-lockup-dark.svg         # Logo completa fundo escuro
│   ├── vertex-lockup-light.svg        # Logo completa fundo claro
│   ├── vertex-symbol-mono-white.svg   # Símbolo branco (overlays escuros)
│   └── vertex-symbol-mono-black.svg   # Símbolo preto (print, fax, etc)
├── png/                                # PNGs gerados via export.html
└── export.html                         # Gerador de PNGs no navegador
```

## Paleta

| Token              | Hex       | Uso                                  |
|--------------------|-----------|--------------------------------------|
| `--vx-bearish`     | `#ff4d6d` | Candles vermelhos (dark UI)          |
| `--vx-bearish-alt` | `#e63946` | Candles vermelhos (light UI)         |
| `--vx-pivot`       | `#7a8290` | Candle do pivô (neutro)              |
| `--vx-bull-start`  | `#00e0a4` | Gradiente bull · início (dark UI)    |
| `--vx-bull-end`    | `#00b3ff` | Gradiente bull · fim (dark UI)       |
| `--vx-bull-start-l`| `#00a878` | Gradiente bull · início (light UI)   |
| `--vx-bull-end-l`  | `#0089cc` | Gradiente bull · fim (light UI)      |
| `--vx-bg`          | `#0a0d12` | Background dark · texto sobre claro  |
| `--vx-fg`          | `#ffffff` | Texto sobre escuro                   |

## Tipografia

- **Wordmark "VERTEX"**: Inter / system sans-serif, weight 700, letter-spacing 0.07em
- **Tagline "WEB TRADING PLATFORM"**: Inter / system sans-serif, weight 500, letter-spacing 0.44em

## Regras de uso

- Espaço mínimo ao redor: altura de 1 candle do símbolo
- Tamanho mínimo do lockup: 120px de largura
- Tamanho mínimo do símbolo isolado: 16px
- Em fundos escuros: use `vertex-lockup-dark.svg`
- Em fundos claros: use `vertex-lockup-light.svg`
- Em fundos coloridos/fotos: use os mono (white ou black)

## Como exportar PNGs

1. Abra `export.html` no navegador (duplo-clique)
2. Clique em "Baixar PNG" no asset desejado, OU "Baixar todos PNGs"
3. PNGs vão pra pasta de Downloads do navegador — mova pra `design/logo-final/png/`
