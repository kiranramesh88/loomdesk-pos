import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/Skeleton'
import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/money'
import type { Quote } from '@/types/domain'

import { formatRate as pct, gstSplitLabel } from '../receipt'

/**
 * The bill's figures in plan §7's order: subtotal, discount, taxable value, GST, total.
 * Every amount is the server's; nothing here is calculated in the browser.
 */
export function BillSummary({ quote, stale, className }: { quote: Quote | undefined; stale?: boolean; className?: string }) {
  if (!quote) {
    return (
      <div aria-hidden className={cx('grid gap-2.5', className)}>
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="mt-2 h-7 w-full" />
      </div>
    )
  }
  return (
    <div className={cx('transition-opacity', stale && 'opacity-60', className)}>
      <dl className="grid gap-1.5 type-body">
        <Row label="Subtotal" value={formatMoney(quote.subtotal_paise)} />
        {quote.discount_paise > 0 && <Row label="Discount" value={`−${formatMoney(quote.discount_paise)}`} tone="text-success" />}
        <Row label="Taxable value" value={formatMoney(quote.taxable_paise)} />
        {quote.tax_breakdown.map((row) => (
          <Row
            key={row.rate_bp}
            label={
              <>
                GST {pct(row.rate_bp)}
                <span className="block type-caption">{gstSplitLabel(row)}</span>
              </>
            }
            value={formatMoney(row.tax_paise)}
          />
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <span className="text-panel font-semibold text-ink-2">Total</span>
        <span className="type-figure">{formatMoney(quote.total_paise)}</span>
      </div>
      <p className="mt-1 type-caption">
        {quote.prices_include_tax ? 'Prices include GST.' : 'Prices exclude GST; it is added above.'}
      </p>
    </div>
  )
}

function Row({ label, value, tone }: { label: ReactNode; value: string; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="min-w-0">{label}</dt>
      <dd className={cx('tabular font-strong text-ink-2', tone)}>{value}</dd>
    </div>
  )
}
