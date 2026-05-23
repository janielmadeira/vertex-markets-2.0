/**
 * Horário de funcionamento dos mercados.
 *
 * Regras:
 * - Forex / Matérias-Primas / Ações: abre Domingo 22:00 UTC, fecha Sexta 22:00 UTC
 *   (= 17:00 NY time / 19:00 BRT inverno)
 * - Crypto: 24/7
 * - OTC: 24/7 (mock interno, sempre operável)
 *
 * Referência: Forex segue horário do mercado de Nova York. O mercado fica fechado
 * de Sexta-feira 17:00 EST até Domingo 17:00 EST.
 */

import type { Asset } from '@/lib/mockData'

export type MarketStatus = 'open' | 'closed'

/**
 * Retorna se o mercado de um determinado ativo está aberto agora.
 */
export function isMarketOpen(asset: Asset, now: Date = new Date()): boolean {
  // OTC e Crypto operam 24/7
  if (asset.type === 'OTC' || asset.type === 'Crypto') return true

  // Forex / Commodities / Stocks → checa janela de funcionamento
  return isForexOpen(now)
}

/**
 * Forex/Stock/Commodity:
 *   Aberto:  Domingo 22:00 UTC  →  Sexta-feira 22:00 UTC
 *   Fechado: Sexta 22:00 UTC    →  Domingo 22:00 UTC
 */
export function isForexOpen(now: Date = new Date()): boolean {
  const day  = now.getUTCDay()    // 0 = Domingo, 1..5 = Seg..Sex, 6 = Sábado
  const hour = now.getUTCHours()

  // Sábado: sempre fechado
  if (day === 6) return false

  // Domingo: fechado antes das 22:00 UTC, aberto depois
  if (day === 0) return hour >= 22

  // Sexta: aberto antes das 22:00 UTC, fechado depois
  if (day === 5) return hour < 22

  // Segunda a Quinta: sempre aberto
  return true
}

/**
 * Próximo horário em que o mercado abre (para countdown).
 * Retorna null se o mercado já está aberto.
 */
export function nextOpenAt(asset: Asset, now: Date = new Date()): Date | null {
  if (isMarketOpen(asset, now)) return null
  return nextForexOpenAt(now)
}

export function nextForexOpenAt(now: Date = new Date()): Date {
  // Sempre aponta para o próximo Domingo 22:00 UTC
  const result = new Date(now)
  const day = result.getUTCDay()

  // Se hoje é Domingo antes das 22:00, abre hoje mesmo às 22:00
  if (day === 0 && result.getUTCHours() < 22) {
    result.setUTCHours(22, 0, 0, 0)
    return result
  }

  // Caso contrário, avança até o próximo Domingo
  const daysUntilSunday = (7 - day) % 7 || 7  // se hoje é Dom > 22:00, próximo Dom
  result.setUTCDate(result.getUTCDate() + daysUntilSunday)
  result.setUTCHours(22, 0, 0, 0)
  return result
}

/**
 * Formata "tempo restante até abertura" em pt-BR.
 *   "abre em 2d 14h"
 *   "abre em 3h 22min"
 *   "abre em 45min"
 */
export function formatTimeUntil(target: Date, now: Date = new Date()): string {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return 'abrindo...'
  const totalMinutes = Math.floor(ms / 60000)
  const days  = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const mins  = totalMinutes % 60

  if (days  > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}min`
  return `${mins}min`
}
