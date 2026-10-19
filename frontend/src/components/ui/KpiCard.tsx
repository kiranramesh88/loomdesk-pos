import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

import { Skeleton } from './Skeleton'

export interface KpiTrend {
  direction: 'up' | 'down'
  /** e.g. "12.8% vs last week". Only pass a trend when comparison data exists (spec §5.1). */
  label: string
  /** Whether this movement is good news; colours the trend, defaults to up = good. */
  favourable?: boolean
}

export interface KpiCardProps {
  label: string
  value: ReactNode
  icon: LucideIcon
  /** Short definition or context, e.g. "Paid bills, today". */
  footnote?: string
  trend?: KpiTrend
  isLoading?: boolean
}

/** Summary figure card (prototype `.kpi-card`): label + icon, large tabular value, one footnote line. */
export function KpiCard({ label, value, icon: Icon, footnote, trend, isLoading }: KpiCardProps) {
  const favourable = trend?.favourable ?? trend?.direction === 'up'
  const TrendIcon = trend?.direction === 'down' ? ArrowDownRight : ArrowUpRight

  return (
    <div className="flex min-h-[118px] min-w-0 flex-col rounded-card border border-line bg-surface px-4 pt-4 pb-3.5 shadow-card sm:px-[17px]">
      <div className="flex items-start justify-between gap-3">
        <span className="type-helper font-medium">{label}</span>
        <span aria-hidden className="grid size-[33px] shrink-0 place-items-center rounded-mark bg-primary-soft text-primary">
          <Icon className="size-[18px]" />
        </span>
      </div>
      {isLoading ? (
        <span role="status" aria-label={`Loading ${label}`} className="mt-2 flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </span>
      ) : (
        <>
          <div className="mt-1.5 type-figure">{value}</div>
          {(trend || footnote) && (
            <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-2 type-caption">
              {trend && (
                <span className={cx('inline-flex items-center gap-0.5 font-strong', favourable ? 'text-success' : 'text-danger')}>
                  <TrendIcon aria-hidden className="size-3.5" />
                  {trend.label}
                </span>
              )}
              {footnote && <span>{footnote}</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
