import type { ReactNode } from 'react'

import { ErrorState } from '@/components/feedback/ErrorState'
import { cx } from '@/lib/cx'

import { Skeleton } from './Skeleton'

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  /** Money and quantities are right-aligned. */
  align?: 'left' | 'right' | 'center'
  /** CSS width, e.g. "120px" or "30%". */
  width?: string
  /** For icon/action columns: header stays readable to screen readers only. */
  hideHeader?: boolean
}

export interface DataTableProps<T> {
  /** Describes the table for screen readers (visually hidden). */
  caption: string
  columns: readonly Column<T>[]
  rows: readonly T[] | undefined
  getRowId: (row: T) => string | number
  isLoading?: boolean
  error?: Error | null
  onRetry?: () => void
  retrying?: boolean
  /** Rendered when there are no rows, e.g. an EmptyState with a "Clear filters" action. */
  empty: ReactNode
  skeletonRows?: number
  /** Minimum table width before the wrapper scrolls horizontally (the page itself never does). */
  minWidth?: string
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  isLoading,
  error,
  onRetry,
  retrying,
  empty,
  skeletonRows = 5,
  minWidth = '640px',
}: DataTableProps<T>) {
  const fullRow = (content: ReactNode) => (
    <tr>
      <td colSpan={columns.length}>{content}</td>
    </tr>
  )

  let body: ReactNode
  if (error) {
    body = fullRow(<ErrorState message={error.message} onRetry={onRetry} retrying={retrying} />)
  } else if (isLoading || !rows) {
    body = Array.from({ length: skeletonRows }, (_, r) => (
      <tr key={r} className="border-b border-line-soft last:border-b-0">
        {columns.map((column) => (
          <td key={column.id} className="px-4 py-[15px] sm:px-5">
            <Skeleton className={cx('h-3', column.align === 'right' ? 'ml-auto w-16' : 'w-4/5')} />
          </td>
        ))}
      </tr>
    ))
  } else if (rows.length === 0) {
    body = fullRow(empty)
  } else {
    body = rows.map((row) => (
      <tr key={getRowId(row)} className="border-b border-line-soft transition-control last:border-b-0 hover:bg-surface-muted">
        {columns.map((column) => (
          <td key={column.id} className={cx('px-4 py-3 align-middle type-body sm:px-5', ALIGN[column.align ?? 'left'])}>
            {column.cell(row)}
          </td>
        ))}
      </tr>
    ))
  }

  return (
    // `relative` contains the sr-only caption/headers; without it they escape the scroll box and widen the page.
    <div className="relative w-full overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth }} aria-busy={isLoading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-y border-line-soft bg-surface-muted">
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cx('px-4 py-2.5 type-eyebrow whitespace-nowrap sm:px-5', ALIGN[column.align ?? 'left'])}
              >
                {column.hideHeader ? <span className="sr-only">{column.header}</span> : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  )
}

/** Two-line cell: a primary label with secondary metadata underneath (prototype `.cell-main/.cell-sub`). */
export function CellStack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-strong text-ink-2">{primary}</div>
      {secondary && <div className="truncate type-helper">{secondary}</div>}
    </div>
  )
}
