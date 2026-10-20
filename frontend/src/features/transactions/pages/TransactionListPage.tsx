import { ArrowRight, ReceiptText, SearchX } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { SaleListItem } from '@/types/domain'

import { useSaleCashiers, useSalesSummary, useTransactions } from '../api'
import { SaleStatusBadges } from '../components/SaleStatus'
import { SummaryBreakdown, SummaryFigures } from '../components/SalesSummary'
import { TransactionToolbar } from '../components/TransactionToolbar'
import { formatSaleTime, isManuallyRecorded, itemsLabel, PAYMENT_LABELS } from '../labels'
import { hasFilters, PAGE_SIZE, rangeIsBackwards, readParams, writeParams, type TransactionParams } from '../transactionParams'

function InvoiceLink({ sale }: { sale: SaleListItem }) {
  return (
    <Link to={sale.invoice_no} className="font-strong text-ink-2 tabular hover:text-primary hover:underline">
      {sale.invoice_no}
    </Link>
  )
}

function Payment({ sale }: { sale: SaleListItem }) {
  return (
    <div className="min-w-0">
      <div className="text-ink-2">{PAYMENT_LABELS[sale.payment_method]}</div>
      {isManuallyRecorded(sale.payment_method) && <div className="type-caption">Not gateway-verified</div>}
    </div>
  )
}

const statusBadge = (sale: SaleListItem) => <SaleStatusBadges status={sale.status} returnState={sale.return_state} />

const COLUMNS: Column<SaleListItem>[] = [
  { id: 'invoice', header: 'Invoice', width: '130px', cell: (s) => <InvoiceLink sale={s} /> },
  { id: 'date', header: 'Date & time', width: '190px', cell: (s) => <span className="tabular">{formatSaleTime(s.created_at)}</span> },
  { id: 'cashier', header: 'Cashier', cell: (s) => <span className="break-words">{s.cashier_name}</span> },
  { id: 'items', header: 'Items', align: 'right', width: '90px', cell: (s) => <span className="tabular">{itemsLabel(s.item_count)}</span> },
  { id: 'payment', header: 'Payment', width: '150px', cell: (s) => <Payment sale={s} /> },
  {
    id: 'total',
    header: 'Total',
    align: 'right',
    width: '140px',
    cell: (s) => <span className="type-amount">{formatMoney(s.total_paise)}</span>,
  },
  // The invoice number is the row's link; a separate "View" button would only repeat it.
  { id: 'status', header: 'Status', width: '170px', cell: statusBadge },
]

/** Phone and tablet layout: one card per bill, the detail page holding the rest (spec §4 "Data tables"). */
function TransactionCards({ rows }: { rows: SaleListItem[] }) {
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {rows.map((s) => (
        <li key={s.invoice_no}>
          <Link
            to={s.invoice_no}
            className="flex items-center gap-3 px-4 py-3.5 transition-control hover:bg-surface-muted focus-visible:bg-surface-muted"
            aria-label={`${s.invoice_no}, ${formatMoney(s.total_paise)}, ${formatSaleTime(s.created_at)}`}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-strong text-ink-2 tabular">{s.invoice_no}</span>
                <span className="type-amount">{formatMoney(s.total_paise)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-helper">
                <span className="tabular">{formatSaleTime(s.created_at)}</span>
                <span>{s.cashier_name}</span>
                <span className="tabular">{itemsLabel(s.item_count)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 type-helper">
                {statusBadge(s)}
                <span>
                  {PAYMENT_LABELS[s.payment_method]}
                  {isManuallyRecorded(s.payment_method) && ' · not gateway-verified'}
                </span>
              </div>
            </div>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function CardsSkeleton() {
  return (
    <div aria-hidden className="divide-y divide-line-soft border-t border-line-soft">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-4">
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  )
}

export function TransactionListPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const transactions = useTransactions(params)
  const summary = useSalesSummary(params)
  const cashiers = useSaleCashiers()
  // The eight-column table needs the lg content width; tablets get the cards instead of a sideways scroll.
  const wide = useMediaQuery(MEDIA.wide)

  const update = useCallback(
    (next: Partial<TransactionParams>) =>
      setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])

  const backwards = rangeIsBackwards(params)
  const data = transactions.data
  const empty = hasFilters(params) ? (
    <EmptyState
      icon={<SearchX />}
      title="No transactions match"
      description="Try another invoice number, date range or status, or clear the filters to see every bill."
      action={<Button onClick={clear}>Clear filters</Button>}
    />
  ) : (
    <EmptyState
      icon={<ReceiptText />}
      title="No transactions yet"
      description="Bills appear here as soon as they’re completed at the till."
      action={<ButtonLink to="/billing">Open billing</ButtonLink>}
    />
  )
  // A page number past the end (e.g. after a filter change elsewhere) comes back as a 404.
  const pageMissing = transactions.error instanceof ApiError && transactions.error.status === 404

  return (
    <>
      <PageHeader title="Transactions" description="Find a completed bill, see what was sold and reprint its receipt." />
      {backwards ? (
        <InlineAlert tone="warning" className="mb-5">
          The end date is before the start date. Change one of them to see transactions.
        </InlineAlert>
      ) : (
        <SummaryFigures
          summary={summary.data}
          error={summary.error}
          onRetry={() => void summary.refetch()}
          retrying={summary.isRefetching}
        />
      )}
      <Card aria-label="Transactions">
        <TransactionToolbar params={params} cashiers={cashiers.data} onChange={update} onClear={clear} />
        {backwards ? null : pageMissing ? (
          <EmptyState
            icon={<SearchX />}
            title="That page doesn’t exist"
            description="There are fewer pages of transactions now."
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : wide ? (
          <DataTable
            caption="Transactions"
            columns={COLUMNS}
            rows={data?.results}
            getRowId={(s) => s.invoice_no}
            isLoading={transactions.isPending}
            error={transactions.error}
            onRetry={() => void transactions.refetch()}
            retrying={transactions.isRefetching}
            empty={empty}
            minWidth="950px"
          />
        ) : transactions.error ? (
          <ErrorState
            message={transactions.error.message}
            onRetry={() => void transactions.refetch()}
            retrying={transactions.isRefetching}
          />
        ) : !data ? (
          <CardsSkeleton />
        ) : data.results.length === 0 ? (
          empty
        ) : (
          <TransactionCards rows={data.results} />
        )}
        {!backwards && data && data.count > 0 && !transactions.error && (
          <Pagination
            page={params.page}
            count={data.count}
            busy={transactions.isPlaceholderData}
            onPage={(page) => update({ page })}
            pageSize={PAGE_SIZE}
            label="Transaction pages"
            noun="transactions"
          />
        )}
      </Card>
      {!backwards && (
        <SummaryBreakdown summary={summary.data} error={summary.error} />
      )}
    </>
  )
}
