import { ArrowLeftRight, SearchX } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileList, MobilePageHeader, MobilePanel, MobileRow } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'
import type { ReturnDisposition } from '@/types/domain'

import { useReturns } from '../api'
import { DISPOSITION_LABELS, formatSaleTime, PAYMENT_LABELS, unitsLabel } from '../labels'
import { DISPOSITIONS, hasFilters, PAGE_SIZE, readParams, writeParams, type ReturnParams } from '../returnParams'

type Choice = ReturnDisposition | 'all'

const CHIPS: ChipOption<Choice>[] = [{ value: 'all', label: 'All' }, ...DISPOSITIONS.map((d) => ({ value: d, label: DISPOSITION_LABELS[d].label }))]

/** `/admin/mobile/returns`: recorded returns, newest first. Read-only; returns are recorded in the full admin. */
export function MobileReturnsPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const returns = useReturns(params)
  const update = useCallback(
    (next: Partial<ReturnParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const query = useDebouncedSearch(params.q, (q) => update({ q }))
  const data = returns.data
  const pageMissing = returns.error instanceof ApiError && returns.error.status === 404

  return (
    <>
      <MobilePageHeader
        title="Returns"
        description="Refunds are worked out from the original bill. Record a return in the full admin."
        back={{ to: mobilePath('more'), label: 'More' }}
      />
      <div className="mb-4 grid gap-3">
        <SearchInput label="Search returns" size="lg" placeholder="Return or invoice number…" value={query.value} onValueChange={query.type} />
        <ChipGroup label="Where items went" hideLabel options={CHIPS} value={params.disposition || 'all'} onValueChange={(v) => update({ disposition: v === 'all' ? '' : v })} />
      </div>
      <MobilePanel title="Returns" description={data ? `${data.count.toLocaleString('en-IN')} found.` : undefined}>
        {pageMissing ? (
          <EmptyState icon={<SearchX />} title="That page doesn’t exist" action={<Button onClick={() => update({})}>Go to the first page</Button>} />
        ) : returns.isError ? (
          <ErrorState message={returns.error.message} onRetry={() => void returns.refetch()} retrying={returns.isRefetching} />
        ) : !data ? (
          <MobileRowsSkeleton rows={4} label="Loading returns" />
        ) : data.results.length === 0 ? (
          hasFilters(params) ? (
            <EmptyState icon={<SearchX />} title="No returns match" description="Try another number, or clear the filter." />
          ) : (
            <EmptyState icon={<ArrowLeftRight />} title="No returns yet" description="Returns recorded in the full admin appear here." />
          )
        ) : (
          <MobileList label="Returns">
            {data.results.map((r) => (
              <MobileRow
                key={r.number}
                to={mobilePath(`returns/${r.number}`)}
                title={<span className="tabular">{r.number}</span>}
                meta={
                  <>
                    <span className="tabular">{r.invoice_no}</span>
                    <span>{formatSaleTime(r.created_at)}</span>
                    <span>{unitsLabel(r.units)}</span>
                  </>
                }
                aside={
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="type-amount">{formatMoney(r.total_paise)}</span>
                    <span className="type-caption">by {PAYMENT_LABELS[r.refund_method]}</span>
                  </div>
                }
              />
            ))}
          </MobileList>
        )}
        {data && data.count > 0 && !returns.isError && (
          <Pagination
            size="touch"
            page={params.page}
            pageSize={PAGE_SIZE}
            count={data.count}
            busy={returns.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Return pages"
            noun="returns"
          />
        )}
      </MobilePanel>
    </>
  )
}
