import { ClipboardList, SearchX } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { ApiError } from '@/lib/http'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'
import type { PurchaseStatus } from '@/types/domain'

import { useAllPurchases } from '../api'
import { PURCHASE_PAGE_SIZE } from '../supplierParams'
import { MobilePurchaseRows } from './MobilePurchaseRows'

type StatusChoice = PurchaseStatus | 'all'

const STATUS_CHIPS: ChipOption<StatusChoice>[] = [
  { value: 'ordered', label: 'Awaiting goods' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
]

interface PurchaseListParams {
  q: string
  status: StatusChoice
  page: number
}

// ?status= defaults to awaiting goods: on a phone the job is usually receiving a delivery.
function readListParams(search: URLSearchParams): PurchaseListParams {
  const status = search.get('status') as StatusChoice
  const page = Number(search.get('page'))
  return {
    q: search.get('q')?.trim() ?? '',
    status: STATUS_CHIPS.some((c) => c.value === status) ? status : 'ordered',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

function writeListParams(params: PurchaseListParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status !== 'ordered') search.set('status', params.status)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

/** `/admin/mobile/purchases`: purchases from every supplier, awaiting goods first. */
export function MobilePurchasesPage() {
  const [search, setSearch] = useSearchParams()
  const params = readListParams(search)
  const purchases = useAllPurchases({ q: params.q, status: params.status === 'all' ? '' : params.status, page: params.page })
  const update = useCallback(
    (next: Partial<PurchaseListParams>) =>
      setSearch((current) => writeListParams({ ...readListParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const query = useDebouncedSearch(params.q, (q) => update({ q }))
  const data = purchases.data
  const pageMissing = purchases.error instanceof ApiError && purchases.error.status === 404

  return (
    <>
      <MobilePageHeader
        title="Purchases"
        description="Receive goods when they arrive. Stock changes only then."
        back={{ to: mobilePath('more'), label: 'More' }}
      />
      <div className="mb-4 grid gap-3">
        <SearchInput label="Search purchases" size="lg" placeholder="Purchase no., supplier invoice or supplier…" value={query.value} onValueChange={query.type} />
        <ChipGroup label="Status" hideLabel columns={2} options={STATUS_CHIPS} value={params.status} onValueChange={(status) => update({ status })} />
      </div>
      <MobilePanel title="Purchases" description={data ? `${data.count.toLocaleString('en-IN')} found.` : undefined}>
        {pageMissing ? (
          <EmptyState icon={<SearchX />} title="That page doesn’t exist" action={<Button onClick={() => update({})}>Go to the first page</Button>} />
        ) : purchases.isError ? (
          <ErrorState message={purchases.error.message} onRetry={() => void purchases.refetch()} retrying={purchases.isRefetching} />
        ) : !data ? (
          <MobileRowsSkeleton rows={4} label="Loading purchases" />
        ) : data.results.length === 0 ? (
          params.q ? (
            <EmptyState icon={<SearchX />} title="No purchases match" description="Try another number, invoice or supplier name." />
          ) : (
            <EmptyState
              icon={<ClipboardList />}
              title={params.status === 'ordered' ? 'Nothing awaiting goods' : 'No purchases here'}
              description="Purchases are recorded against a supplier in the full admin."
            />
          )
        ) : (
          <MobilePurchaseRows purchases={data.results} showSupplier />
        )}
        {data && data.count > 0 && !purchases.isError && (
          <Pagination
            size="touch"
            page={params.page}
            pageSize={PURCHASE_PAGE_SIZE}
            count={data.count}
            busy={purchases.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Purchase pages"
            noun="purchases"
          />
        )}
      </MobilePanel>
    </>
  )
}
