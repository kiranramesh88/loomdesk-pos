import { IndianRupee, ReceiptText, ShoppingCart, TrendingUp, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { MoneyValue } from '@/components/ui/MoneyValue'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useInventorySummary } from '@/features/inventory/api'
import { useReport } from '@/features/reports/api'
import { DateRangeBar } from '@/features/reports/components/DateRangeBar'
import { Trend } from '@/features/reports/components/Trend'
import { presetRange, rangeLabel } from '@/features/reports/dates'
import { rangeIsBackwards, readReportParams, writeReportParams } from '@/features/reports/reportParams'
import { useStore } from '@/features/store/api'
import { useRecentSales } from '@/features/transactions/api'
import { billsLabel, formatSaleTime, PAYMENT_LABELS } from '@/features/transactions/labels'
import { formatMoney } from '@/lib/money'
import type { Report } from '@/types/domain'

const RECENT_BILLS = 5
const STOCK_ROWS = 5

const metric = (report: Report | undefined, key: string) => report?.summary.find((m) => m.key === key)?.value ?? 0
const definition = (report: Report | undefined, term: string) => report?.definitions.find((d) => d.term === term)?.meaning

function Panel({ id, title, description, action, children }: { id: string; title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card aria-labelledby={id} className="flex min-w-0 flex-col">
      <CardHeader id={id} title={title} description={description} actions={action} />
      {children}
    </Card>
  )
}

const viewLink = (to: string, label: string) => (
  <Link to={to} className="type-helper font-strong text-primary hover:underline">
    {label}
  </Link>
)

function Kpis({ sales, range }: { sales: ReturnType<typeof useReport>; range: string }) {
  const stock = useInventorySummary()
  const data = sales.data
  const failed = sales.isError
  return (
    <section aria-label={`Figures for ${range}`} className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard
          label="Net sales"
          icon={IndianRupee}
          isLoading={sales.isPending}
          value={failed ? '—' : formatMoney(metric(data, 'net'))}
          footnote={failed ? 'Couldn’t load' : `Sales less refunds, ${range}`}
          definition={definition(data, 'Net sales')}
        />
        <KpiCard
          label="Bills completed"
          icon={ReceiptText}
          isLoading={sales.isPending}
          value={failed ? '—' : metric(data, 'bills').toLocaleString('en-IN')}
          footnote={failed ? 'Couldn’t load' : `Voided bills excluded, ${range}`}
          definition="Completed bills in the dates. A voided bill doesn’t count; a returned one still does, and its refund comes off net sales."
        />
        <KpiCard
          label="Average bill"
          icon={TrendingUp}
          isLoading={sales.isPending}
          value={failed ? '—' : formatMoney(metric(data, 'average'))}
          footnote={failed ? 'Couldn’t load' : 'Sales ÷ bills completed'}
          definition={definition(data, 'Average bill')}
        />
        <KpiCard
          label="Low-stock variants"
          icon={TriangleAlert}
          isLoading={stock.isPending}
          value={stock.isError ? '—' : stock.data?.low_stock.toLocaleString('en-IN')}
          footnote={stock.isError ? 'Couldn’t load' : `Now · ${stock.data?.out_of_stock.toLocaleString('en-IN') ?? 0} out of stock`}
          definition="Variants on sale with 1 to their reorder level in stock, right now (not affected by the dates)."
        />
      </div>
      {(failed || stock.isError) && (
        <p role="alert" className="type-helper text-danger">
          Some figures couldn’t load.{' '}
          <button
            type="button"
            className="font-strong text-primary underline"
            onClick={() => {
              if (failed) void sales.refetch()
              if (stock.isError) void stock.refetch()
            }}
          >
            Try again
          </button>
        </p>
      )}
    </section>
  )
}

function SalesTrend({ sales, linkSearch }: { sales: ReturnType<typeof useReport>; linkSearch: string }) {
  const rows = sales.data?.rows
  return (
    <Panel
      id="trend-heading"
      title="Net sales by day"
      description="Sales less refunds on each store date, GST included."
      action={viewLink(`/admin/reports/sales-summary${linkSearch}`, 'Sales summary')}
    >
      <CardBody>
        {sales.isError ? (
          <ErrorState message={sales.error.message} onRetry={() => void sales.refetch()} retrying={sales.isFetching} />
        ) : !rows ? (
          <Skeleton className="h-[240px] w-full" />
        ) : rows.length === 1 ? (
          <p className="type-body">
            {formatMoney(Number(rows[0]?.net ?? 0))} net on the day. Choose more than one day to see a trend.
          </p>
        ) : (
          <Trend label="Net sales" points={rows.map((r) => ({ date: String(r.date), value: Number(r.net) }))} />
        )}
      </CardBody>
    </Panel>
  )
}

function PaymentMethods({ params, linkSearch }: { params: Record<string, string>; linkSearch: string }) {
  const report = useReport('payment-methods', params, { enabled: !!params.date_from })
  const rows = report.data?.rows
  const total = rows?.reduce((sum, r) => sum + Math.max(Number(r.sales), 0), 0) ?? 0
  return (
    <Panel
      id="methods-heading"
      title="Payment methods"
      description="As recorded at the till; not verified with a gateway."
      action={viewLink(`/admin/reports/payment-methods${linkSearch}`, 'Report')}
    >
      <CardBody>
        {report.isError ? (
          <ErrorState message={report.error.message} onRetry={() => void report.refetch()} retrying={report.isFetching} />
        ) : !rows ? (
          <SkeletonText lines={4} />
        ) : (
          <ul className="grid gap-3.5">
            {rows.map((r, i) => {
              const sales = Number(r.sales)
              const share = total ? Math.round((sales / total) * 100) : 0
              return (
                <li key={String(r.method_label)} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="type-label">{String(r.method_label)}</span>
                    <span className="type-amount">{formatMoney(sales)}</span>
                  </div>
                  <div aria-hidden className="h-2 overflow-hidden rounded-control bg-chart-4">
                    <div className={i === 0 ? 'h-full bg-chart-1' : i === 1 ? 'h-full bg-chart-2' : 'h-full bg-chart-3'} style={{ width: `${share}%` }} />
                  </div>
                  <span className="type-caption">
                    {share}% of sales · {billsLabel(Number(r.bills))}
                    {Number(r.refunds) > 0 && ` · ${formatMoney(Number(r.refunds))} refunded`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Panel>
  )
}

function RecentBills({ sales }: { sales: ReturnType<typeof useRecentSales> }) {
  const rows = sales.data?.results
  return (
    <Panel id="bills-heading" title="Recent bills" description="The latest bills from the till, whatever the dates." action={viewLink('/admin/transactions', 'All transactions')}>
      {sales.isError ? (
        <ErrorState message={sales.error.message} onRetry={() => void sales.refetch()} retrying={sales.isFetching} />
      ) : !rows ? (
        <CardBody>
          <SkeletonText lines={5} />
        </CardBody>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ReceiptText />} title="No bills yet" description="Completed sales from the till appear here." />
      ) : (
        <ul aria-label="Recent bills" className="divide-y divide-line-soft border-t border-line-soft">
          {rows.map((s) => (
            <li key={s.invoice_no}>
              <Link to={`/admin/transactions/${s.invoice_no}`} className="flex items-center gap-3 px-4 py-3 transition-control hover:bg-surface-muted sm:px-5">
                <span className="grid min-w-0 flex-1">
                  <span className="tabular font-strong text-ink-2">{s.invoice_no}</span>
                  <span className="type-helper">
                    {formatSaleTime(s.created_at)} · {PAYMENT_LABELS[s.payment_method]} · {s.cashier_name}
                  </span>
                </span>
                {s.status === 'voided' && <StatusBadge tone="neutral">Voided</StatusBadge>}
                <MoneyValue paise={s.total_paise} className={s.status === 'voided' ? 'type-amount text-muted line-through' : 'type-amount'} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function StockAttention() {
  const report = useReport('low-stock', {})
  const rows = report.data?.rows.slice(0, STOCK_ROWS)
  const total = report.data?.rows.length ?? 0
  return (
    <Panel
      id="stock-heading"
      title="Needs restocking"
      description={report.data ? (total ? `${total} ${total === 1 ? 'variant' : 'variants'} at or below the reorder level, emptiest first.` : undefined) : undefined}
      action={viewLink('/admin/reports/low-stock', 'Low-stock report')}
    >
      {report.isError ? (
        <ErrorState message={report.error.message} onRetry={() => void report.refetch()} retrying={report.isFetching} />
      ) : !rows ? (
        <CardBody>
          <SkeletonText lines={5} />
        </CardBody>
      ) : rows.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-4 type-helper">Every item on sale is above its reorder level.</p>
      ) : (
        <ul aria-label="Variants that need restocking" className="divide-y divide-line-soft border-t border-line-soft">
          {rows.map((v) => (
            <li key={String(v.sku)}>
              <Link
                to={`/admin/inventory?q=${encodeURIComponent(String(v.sku))}`}
                className="flex items-center gap-3 px-4 py-3 transition-control hover:bg-surface-muted sm:px-5"
              >
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-strong text-ink-2">{String(v.product)}</span>
                  <span className="type-helper tabular">
                    {String(v.sku)} · {String(v.option)}
                  </span>
                </span>
                <span className="type-amount tabular">{Number(v.on_hand)} left</span>
                <StatusBadge tone={Number(v.on_hand) <= 0 ? 'danger' : 'warning'}>{String(v.state)}</StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** `/admin`: one date range (default the last 7 store days) drives the figures, the trend and payment methods. */
export function OverviewPage() {
  const [search, setSearch] = useSearchParams()
  const store = useStore()
  const today = store.data?.today ?? ''
  const chosen = readReportParams(search)
  const fallback = today ? presetRange('7d', today) : { from: '', to: '' }
  const from = chosen.from || fallback.from
  const to = chosen.to || fallback.to
  const backwards = rangeIsBackwards({ from, to })
  const params: Record<string, string> = from && to && !backwards ? { date_from: from, date_to: to } : {}
  // Wait for the store's date rather than ask for the server's default 30 days and then 7.
  const sales = useReport('sales-summary', params, { enabled: !!params.date_from })
  const recent = useRecentSales(RECENT_BILLS)
  const range = from && to ? rangeLabel(from, to) : 'the chosen dates'
  const linkSearch = from && to ? `?${writeReportParams({ from, to, filters: {} })}` : ''
  const firstUse = recent.data?.count === 0

  return (
    <>
      <PageHeader
        title="Overview"
        description="Sales, refunds and stock from the till’s saved records."
      />
      <div className="grid gap-4 lg:gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {today ? (
            <DateRangeBar today={today} from={from} to={to} onChange={(r) => setSearch(writeReportParams({ ...r, filters: {} }), { replace: true })} />
          ) : store.isError ? (
            <ErrorState title="The store’s date couldn’t load" message={store.error.message} onRetry={() => void store.refetch()} retrying={store.isFetching} className="py-4" />
          ) : (
            <Skeleton className="h-control w-[420px] max-w-full" />
          )}
          <p className="type-label" aria-live="polite">
            {backwards ? 'Choose a start date on or before the end date.' : `Showing ${range}`}
          </p>
        </div>
        {firstUse && (
          <Card>
            <EmptyState
              icon={<ReceiptText />}
              title="No sales yet"
              description="The overview fills in after the first sale at the till. Stock alerts below already work."
              action={
                <ButtonLink to="/billing" variant="primary" icon={<ShoppingCart />}>
                  Open billing
                </ButtonLink>
              }
            />
          </Card>
        )}
        <Kpis sales={sales} range={range} />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-5">
          <SalesTrend sales={sales} linkSearch={linkSearch} />
          <PaymentMethods params={params} linkSearch={linkSearch} />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
          <RecentBills sales={recent} />
          <StockAttention />
        </div>
      </div>
    </>
  )
}
