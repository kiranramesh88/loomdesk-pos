import { ReceiptText, SearchX } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { TextField } from '@/components/ui/TextField'
import { useStore } from '@/features/store/api'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileList, MobilePageHeader, MobilePanel, MobileRow } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'
import type { PaymentMethod } from '@/types/domain'

import { useSalesSummary, useTransactions } from '../api'
import { billsLabel, formatSaleTime, isManuallyRecorded, itemsLabel, PAYMENT_LABELS } from '../labels'
import { hasFilters, METHODS, PAGE_SIZE, rangeIsBackwards, readParams, writeParams, type TransactionParams } from '../transactionParams'

type MethodChoice = PaymentMethod | 'all'

const METHOD_CHIPS: ChipOption<MethodChoice>[] = [
  { value: 'all', label: 'All' },
  ...METHODS.map((m) => ({ value: m, label: PAYMENT_LABELS[m] })),
]

/** `/admin/mobile/bills`: saved bills, newest first, searchable by invoice number, date and payment method. */
export function MobileBillsPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const bills = useTransactions(params)
  const summary = useSalesSummary(params)
  const today = useStore().data?.today
  const update = useCallback(
    (next: Partial<TransactionParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])
  const query = useDebouncedSearch(params.q, (q) => update({ q }))
  const data = bills.data
  const backwards = rangeIsBackwards(params)
  const pageMissing = bills.error instanceof ApiError && bills.error.status === 404
  const onlyToday = !!today && params.from === today && params.to === today

  return (
    <>
      <MobilePageHeader title="Bills" description="Saved sales. Opening or reprinting one never changes it." />
      <div className="mb-4 grid gap-3">
        <SearchInput label="Search bills" size="lg" placeholder="Invoice number, e.g. LD-000123" value={query.value} onValueChange={query.type} />
        <div className="grid grid-cols-2 gap-2.5">
          <TextField label="From" type="date" size="lg" max={params.to || today} value={params.from} onChange={(e) => update({ from: e.target.value })} />
          <TextField label="To" type="date" size="lg" min={params.from || undefined} max={today} value={params.to} onChange={(e) => update({ to: e.target.value })} />
        </div>
        {today && !onlyToday && (
          <Button size="lg" variant="ghost" onClick={() => update({ from: today, to: today })}>
            Show today’s bills
          </Button>
        )}
        <ChipGroup
          label="Payment method"
          hideLabel
          options={METHOD_CHIPS}
          value={params.method || 'all'}
          onValueChange={(v) => update({ method: v === 'all' ? '' : v })}
        />
        {hasFilters(params) && (
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              query.cancel()
              clear()
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {backwards ? (
        <InlineAlert tone="warning">The start date is after the end date. Change one of them to see bills.</InlineAlert>
      ) : (
        <MobilePanel
          title={hasFilters(params) ? 'Matching bills' : 'All bills'}
          description={
            summary.data
              ? `${billsLabel(summary.data.sale_count)} · ${formatMoney(summary.data.total_paise)} (saved totals, GST incl.)`
              : undefined
          }
        >
          {pageMissing ? (
            <EmptyState
              icon={<SearchX />}
              title="That page doesn’t exist"
              action={<Button onClick={() => update({})}>Go to the first page</Button>}
            />
          ) : bills.isError ? (
            <ErrorState message={bills.error.message} onRetry={() => void bills.refetch()} retrying={bills.isRefetching} />
          ) : !data ? (
            <MobileRowsSkeleton rows={5} label="Loading bills" />
          ) : data.results.length === 0 ? (
            hasFilters(params) ? (
              <EmptyState icon={<SearchX />} title="No bills match" description="Try another invoice number or date, or clear the filters." />
            ) : (
              <EmptyState icon={<ReceiptText />} title="No bills yet" description="Completed sales from the till appear here." />
            )
          ) : (
            <MobileList label="Bills">
              {data.results.map((s) => (
                <MobileRow
                  key={s.invoice_no}
                  to={mobilePath(`bills/${s.invoice_no}`)}
                  title={<span className="tabular">{s.invoice_no}</span>}
                  meta={
                    <>
                      <span>{formatSaleTime(s.created_at)}</span>
                      <span>{s.cashier_name}</span>
                      <span className="tabular">{itemsLabel(s.item_count)}</span>
                    </>
                  }
                  aside={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="type-amount">{formatMoney(s.total_paise)}</span>
                      <span className="type-caption">{PAYMENT_LABELS[s.payment_method]}</span>
                      {isManuallyRecorded(s.payment_method) && <span className="type-caption">Not verified</span>}
                    </div>
                  }
                />
              ))}
            </MobileList>
          )}
          {data && data.count > 0 && !bills.isError && (
            <Pagination
              size="touch"
              page={params.page}
              pageSize={PAGE_SIZE}
              count={data.count}
              busy={bills.isPlaceholderData}
              onPage={(page) => update({ page })}
              label="Bill pages"
              noun="bills"
            />
          )}
        </MobilePanel>
      )}
    </>
  )
}
