import { Link } from 'react-router'

import { MoneyValue } from '@/components/ui/MoneyValue'
import { referencePath } from '@/features/inventory/labels'
import type { ReportColumn } from '@/types/domain'

import { formatValue, isNumeric } from '../format'

export function ReportCell({ column, value, mobile }: { column: ReportColumn; value: unknown; mobile: boolean }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>
  if (column.kind === 'money') return <MoneyValue paise={value as number} className={(value as number) < 0 ? 'text-danger' : undefined} />
  if (column.kind === 'reference') {
    const to = referencePath(String(value), mobile)
    return to ? (
      <Link to={to} className="tabular font-strong text-primary hover:underline">
        {String(value)}
      </Link>
    ) : (
      <span className="tabular">{String(value)}</span>
    )
  }
  const text = formatValue(column.kind, value)
  return <span className={isNumeric(column.kind) ? 'tabular' : 'break-words'}>{text}</span>
}
