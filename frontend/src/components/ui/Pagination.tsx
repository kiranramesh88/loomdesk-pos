import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from './Button'

export interface PaginationProps {
  page: number
  pageSize: number
  count: number
  /** True while the next page loads; the previous page stays on screen. */
  busy: boolean
  onPage: (page: number) => void
  /** Names the nav landmark, e.g. "Catalogue pages". */
  label: string
  /** Plural noun for the range line: "Showing 1–25 of 140 products". */
  noun: string
}

/** Footer for a server-paginated list card: the visible range, page position, previous and next. */
export function Pagination({ page, pageSize, count, busy, onPage, label, noun }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, count)
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3 sm:px-5">
      <p className="type-helper tabular" aria-live="polite">
        {busy ? 'Loading…' : `Showing ${first}–${last} of ${count.toLocaleString('en-IN')} ${noun}`}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <span className="type-helper tabular">
            Page {page} of {pages}
          </span>
          <Button size="sm" icon={<ChevronLeft />} disabled={page <= 1 || busy} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" disabled={page >= pages || busy} onClick={() => onPage(page + 1)}>
            Next
            <ChevronRight />
          </Button>
        </div>
      )}
    </nav>
  )
}
