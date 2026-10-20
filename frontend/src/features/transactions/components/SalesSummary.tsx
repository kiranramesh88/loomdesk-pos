import { BadgePercent, Landmark, ReceiptText, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import { ErrorState } from '@/components/feedback/ErrorState'
import { Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { SkeletonText } from '@/components/ui/Skeleton'
import { formatMoney } from '@/lib/money'
import type { SalesSummary } from '@/types/domain'

import { billsLabel, formatStoreDate, isManuallyRecorded, PAYMENT_LABELS } from '../labels'

interface SummaryProps {
  summary: SalesSummary | undefined
  error: Error | null
  onRetry: () => void
  retrying: boolean
}

/** Headline figures for the filtered bills. Each card's footnote is its definition. */
export function SummaryFigures({ summary, error, onRetry, retrying }: SummaryProps) {
  if (error) {
    return (
      <Card aria-label="Sales summary" className="mb-5">
        <ErrorState title="The sales summary couldn’t load" message={error.message} onRetry={onRetry} retrying={retrying} />
      </Card>
    )
  }
  const loading = !summary
  return (
    <section aria-label="Sales summary" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard
        label="Completed sales"
        icon={ReceiptText}
        isLoading={loading}
        value={summary?.sale_count.toLocaleString('en-IN')}
        footnote="Bills completed at the till, in these filters"
      />
      <KpiCard
        label="Recorded sales total"
        icon={Wallet}
        isLoading={loading}
        value={summary && formatMoney(summary.total_paise)}
        footnote="Saved bill totals, after discounts, GST included"
      />
      <KpiCard
        label="GST on these bills"
        icon={Landmark}
        isLoading={loading}
        value={summary && formatMoney(summary.tax_paise)}
        footnote="CGST + SGST, as saved on each bill"
      />
      <KpiCard
        label="Discounts given"
        icon={BadgePercent}
        isLoading={loading}
        value={summary && formatMoney(summary.discount_paise)}
        footnote="Bill discounts, taken off before GST"
      />
    </section>
  )
}

const DAYS_SHOWN = 14

/** Totals grouped by payment method, day and cashier. Every group adds up to the headline total. */
export function SummaryBreakdown({ summary, error }: Pick<SummaryProps, 'summary' | 'error'>) {
  if (error) return null // SummaryFigures already shows the error and its retry.
  return (
    <section aria-labelledby="breakdown-heading" className="mt-5">
      <h2 id="breakdown-heading" className="sr-only">
        Breakdown of these bills
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By payment method" description="How each bill was recorded as paid.">
          {summary && (
            <Rows
              label="Payment methods"
              rows={summary.by_method.map((row) => ({
                key: row.method,
                name: PAYMENT_LABELS[row.method],
                note: isManuallyRecorded(row.method) ? 'Entered by cashier, not gateway-verified' : 'Counted at the till',
                count: row.sale_count,
                total: row.total_paise,
              }))}
            />
          )}
        </Panel>
        <Panel title="Daily sales" description="Store dates with at least one sale, newest first.">
          {summary &&
            (summary.by_day.length === 0 ? (
              <None />
            ) : (
              <>
                <Rows
                  label="Daily sales"
                  rows={summary.by_day.slice(0, DAYS_SHOWN).map((row) => ({
                    key: row.date,
                    name: formatStoreDate(row.date),
                    count: row.sale_count,
                    total: row.total_paise,
                  }))}
                />
                {summary.by_day.length > DAYS_SHOWN && (
                  <p className="border-t border-line-soft px-5 py-3 type-helper">
                    Showing the latest {DAYS_SHOWN} of {summary.by_day.length} days. Set a date range to see earlier days.
                  </p>
                )}
              </>
            ))}
        </Panel>
        <Panel title="By cashier" description="Who completed the bills, highest total first.">
          {summary &&
            (summary.by_cashier.length === 0 ? (
              <None />
            ) : (
              <Rows
                label="Sales by cashier"
                rows={summary.by_cashier.map((row) => ({
                  key: String(row.cashier),
                  name: row.cashier_name,
                  count: row.sale_count,
                  total: row.total_paise,
                }))}
              />
            ))}
        </Panel>
      </div>
      <p className="mt-3 max-w-[760px] type-helper">
        Figures are the totals saved on each bill at checkout, never recalculated from today’s prices or tax rules.
        UPI and card amounts are references typed in by the cashier and haven’t been confirmed with a bank, so these
        are recorded sales, not settled payments. Returns aren’t deducted yet.
      </p>
    </section>
  )
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} as="h3" />
      {children ?? (
        <div role="status" aria-label={`Loading ${title.toLowerCase()}`} className="px-5 pb-5">
          <SkeletonText lines={3} />
        </div>
      )}
    </Card>
  )
}

function None() {
  return <p className="border-t border-line-soft px-5 py-4 type-helper">No sales in these filters.</p>
}

interface Row {
  key: string
  name: string
  note?: string
  count: number
  total: number
}

function Rows({ label, rows }: { label: string; rows: Row[] }) {
  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">{label}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Group</th>
          <th scope="col">Bills</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-line-soft">
            <th scope="row" className="px-5 py-2.5 text-left align-baseline font-regular">
              <span className="block type-body font-strong text-ink-2">{row.name}</span>
              {row.note && <span className="block type-caption">{row.note}</span>}
            </th>
            <td className="py-2.5 text-right align-baseline type-helper tabular whitespace-nowrap">{billsLabel(row.count)}</td>
            <td className="px-5 py-2.5 text-right align-baseline type-amount whitespace-nowrap">{formatMoney(row.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
