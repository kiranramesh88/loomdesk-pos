import { formatWhen } from '@/features/inventory/labels'
import { formatDay } from '@/features/suppliers/labels'
import { formatMoney } from '@/lib/money'
import type { ReportColumn, ReportMetric } from '@/types/domain'

const NUMERIC = new Set<ReportColumn['kind']>(['money', 'count', 'percent'])

export const isNumeric = (kind: ReportColumn['kind']) => NUMERIC.has(kind)

/** A report value as text, for summaries and chart descriptions. */
export function formatValue(kind: ReportColumn['kind'] | ReportMetric['kind'], value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (kind) {
    case 'money':
      return formatMoney(value as number)
    case 'count':
      return (value as number).toLocaleString('en-IN')
    case 'percent':
      return `${(value as number) / 100}%`
    case 'date':
      return formatDay(value as string)
    case 'datetime':
      return formatWhen(value as string)
    default:
      return String(value)
  }
}
