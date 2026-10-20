import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

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
  /** Makes the column sortable (in the browser, over the rows given): the value to order by. */
  sortValue?: (row: T) => string | number | null | undefined
}

export interface SortState {
  column: string
  direction: 'ascending' | 'descending'
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
  /** Render only the first `limit` rows of the current order. Sorting still covers every row. */
  limit?: number
  /** Initial order for sortable columns; rows keep the order given until a header is chosen. */
  defaultSort?: SortState
}

const collator = new Intl.Collator('en-IN', { numeric: true, sensitivity: 'base' })

/** Empty values go last in both directions. */
function compare(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1
  if (b == null || b === '') return -1
  return typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b))
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
  defaultSort,
  limit,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | undefined>(defaultSort)
  const sorted = useMemo(() => {
    const by = sort && columns.find((c) => c.id === sort.column)?.sortValue
    if (!rows || !sort || !by) return rows
    const sign = sort.direction === 'ascending' ? 1 : -1
    // Stable: equal values keep the order the rows came in.
    return rows
      .map((row, index) => ({ row, index, value: by(row) }))
      .sort((a, b) => {
        const empty = (v: unknown) => v == null || v === ''
        if (empty(a.value) || empty(b.value)) return compare(a.value, b.value) || a.index - b.index
        return sign * compare(a.value, b.value) || a.index - b.index
      })
      .map((x) => x.row)
  }, [rows, sort, columns])
  const toggle = (column: string) =>
    setSort((current) =>
      current?.column === column && current.direction === 'ascending' ? { column, direction: 'descending' } : { column, direction: 'ascending' },
    )

  const fullRow = (content: ReactNode) => (
    <tr>
      <td colSpan={columns.length}>{content}</td>
    </tr>
  )

  let body: ReactNode
  if (error) {
    body = fullRow(<ErrorState message={error.message} onRetry={onRetry} retrying={retrying} />)
  } else if (isLoading || !sorted) {
    body = Array.from({ length: skeletonRows }, (_, r) => (
      <tr key={r} className="border-b border-line-soft last:border-b-0">
        {columns.map((column) => (
          <td key={column.id} className="px-4 py-[15px] sm:px-5">
            <Skeleton className={cx('h-3', column.align === 'right' ? 'ml-auto w-16' : 'w-4/5')} />
          </td>
        ))}
      </tr>
    ))
  } else if (sorted.length === 0) {
    body = fullRow(empty)
  } else {
    body = (limit === undefined ? sorted : sorted.slice(0, limit)).map((row) => (
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
            {columns.map((column) => {
              const active = sort?.column === column.id ? sort.direction : undefined
              const SortIcon = active === 'ascending' ? ArrowUp : active === 'descending' ? ArrowDown : ChevronsUpDown
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={column.sortValue ? (active ?? 'none') : undefined}
                  style={column.width ? { width: column.width } : undefined}
                  className={cx('px-4 py-2.5 type-eyebrow whitespace-nowrap sm:px-5', ALIGN[column.align ?? 'left'])}
                >
                  {column.hideHeader ? (
                    <span className="sr-only">{column.header}</span>
                  ) : column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(column.id)}
                      className={cx(
                        '-mx-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 uppercase transition-control hover:text-ink-2',
                        column.align === 'right' && 'flex-row-reverse',
                        active && 'text-ink-2',
                      )}
                    >
                      {column.header}
                      <SortIcon aria-hidden className={cx('size-3.5 shrink-0', !active && 'opacity-60')} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
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
