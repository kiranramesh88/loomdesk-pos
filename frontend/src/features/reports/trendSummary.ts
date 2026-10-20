import { formatDay } from '@/features/suppliers/labels'
import { formatMoney } from '@/lib/money'

import type { TrendPoint } from './components/TrendChart'

/** "Net sales totalled ₹12,400.00 over 7 days. Highest ₹4,100.00 on 18 Oct 2026; lowest ₹0.00 on 14 Oct 2026." */
export function trendSummary(points: readonly TrendPoint[], label: string): string {
  if (!points.length) return `No ${label.toLowerCase()} in these dates.`
  const total = points.reduce((sum, p) => sum + p.value, 0)
  const high = points.reduce((best, p) => (p.value > best.value ? p : best))
  const low = points.reduce((worst, p) => (p.value < worst.value ? p : worst))
  const days = `${points.length} ${points.length === 1 ? 'day' : 'days'}`
  return (
    `${label} totalled ${formatMoney(total)} over ${days}. ` +
    `Highest ${formatMoney(high.value)} on ${formatDay(high.date)}; lowest ${formatMoney(low.value)} on ${formatDay(low.date)}.`
  )
}
