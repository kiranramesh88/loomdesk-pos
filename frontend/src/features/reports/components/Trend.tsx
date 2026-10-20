import { lazy, Suspense, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MoneyValue } from '@/components/ui/MoneyValue'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDay } from '@/features/suppliers/labels'

import { trendSummary } from '../trendSummary'
import type { TrendPoint } from './TrendChart'

const TrendChart = lazy(() => import('./TrendChart'))

/**
 * The trend line plus what a screen reader or keyboard user gets instead: a text summary, and the same
 * points as a table on request (plan §7, Overview).
 */
export function Trend({ points, label }: { points: TrendPoint[]; label: string }) {
  const [asTable, setAsTable] = useState(false)
  const columns: Column<TrendPoint>[] = [
    { id: 'date', header: 'Date', cell: (p) => formatDay(p.date), sortValue: (p) => p.date },
    { id: 'value', header: label, align: 'right', cell: (p) => <MoneyValue paise={p.value} />, sortValue: (p) => p.value },
  ]
  return (
    <div className="grid gap-3">
      {asTable ? (
        <DataTable caption={`${label} by day`} columns={columns} rows={points} getRowId={(p) => p.date} empty={null} minWidth="280px" />
      ) : (
        <Suspense fallback={<Skeleton className="h-[240px] w-full" />}>
          <TrendChart points={points} label={label} />
        </Suspense>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="type-helper">{trendSummary(points, label)}</p>
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show as table'}
        </Button>
      </div>
    </div>
  )
}
