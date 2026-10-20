import { createElement } from 'react'

import type { Column } from '@/components/ui/DataTable'
import type { ReportColumn, ReportRow } from '@/types/domain'

import { ReportCell } from './components/ReportCell'
import { isNumeric } from './format'

/** Table columns for a report, each sortable by its raw value (paise, counts, ISO dates). */
export function reportColumns(columns: readonly ReportColumn[], mobile = false): Column<ReportRow>[] {
  return columns.map((column) => ({
    id: column.key,
    header: column.label,
    align: isNumeric(column.kind) ? 'right' : 'left',
    cell: (row) => createElement(ReportCell, { column, value: row[column.key], mobile }),
    sortValue: (row) => {
      const value = row[column.key]
      return typeof value === 'number' || typeof value === 'string' ? value : null
    },
  }))
}
