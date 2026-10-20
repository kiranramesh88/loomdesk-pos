import { History, SearchX, X } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { ApiError } from '@/lib/http'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'

import { useInventoryVariant, useMovements } from '../api'
import {
  hasMovementFilters,
  MOVEMENT_PAGE_SIZE,
  MOVEMENT_TYPES,
  rangeIsBackwards,
  readMovementParams,
  writeMovementParams,
  type MovementParams,
} from '../inventoryParams'
import { MOVEMENT_LABELS, variantName } from '../labels'
import { MobileMovementRows } from './MobileMovementRows'

const ALL = 'all'
const TYPE_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'All movement types' },
  ...MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABELS[t].label })),
]

/** `/admin/mobile/inventory/movements`: the append-only stock ledger, newest first. `?variant=` narrows it to one item. */
export function MobileMovementsPage() {
  const [search, setSearch] = useSearchParams()
  const params = readMovementParams(search)
  const movements = useMovements(params)
  const variant = useInventoryVariant(params.variant)
  const update = useCallback(
    (next: Partial<MovementParams>) =>
      setSearch((current) => writeMovementParams({ ...readMovementParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const query = useDebouncedSearch(params.q, (q) => update({ q }))
  const data = movements.data
  const backwards = rangeIsBackwards(params)
  const pageMissing = movements.error instanceof ApiError && movements.error.status === 404

  return (
    <>
      <MobilePageHeader
        title="Stock movements"
        description="Every stock change, newest first. Movements can’t be edited or deleted."
        back={params.variant ? { to: mobilePath(`inventory/${params.variant}`), label: 'Item' } : { to: mobilePath('inventory'), label: 'Inventory' }}
      />
      <div className="mb-4 grid gap-3">
        {params.variant && (
          <div className="flex items-center justify-between gap-2 rounded-control border border-primary-border bg-primary-soft py-1 pr-1 pl-3.5">
            <span className="min-w-0 type-body font-strong break-words text-primary">
              {variant.data ? variantName(variant.data) : 'One item'}
            </span>
            <Button variant="ghost" size="lg" icon={<X />} onClick={() => update({ variant: '' })}>
              All items
            </Button>
          </div>
        )}
        <SearchInput label="Search movements" size="lg" placeholder="Product, SKU or reference…" value={query.value} onValueChange={query.type} />
        <Select
          label="Movement type"
          hideLabel
          options={TYPE_OPTIONS}
          value={params.type || ALL}
          onValueChange={(v) => update({ type: v === ALL ? '' : (v as MovementParams['type']) })}
        />
      </div>
      {backwards && (
        <InlineAlert tone="warning" className="mb-4">
          The start date is after the end date.
        </InlineAlert>
      )}
      <MobilePanel title="Movements" description={data ? `${data.count.toLocaleString('en-IN')} recorded.` : undefined}>
        {pageMissing ? (
          <EmptyState
            icon={<SearchX />}
            title="That page doesn’t exist"
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : movements.isError ? (
          <ErrorState message={movements.error.message} onRetry={() => void movements.refetch()} retrying={movements.isRefetching} />
        ) : !data ? (
          <MobileRowsSkeleton rows={5} label="Loading movements" />
        ) : data.results.length === 0 ? (
          hasMovementFilters(params) ? (
            <EmptyState icon={<SearchX />} title="No movements match" description="Try another search or type." />
          ) : (
            <EmptyState icon={<History />} title="No movements yet" />
          )
        ) : (
          <MobileMovementRows movements={data.results} showVariant={!params.variant} />
        )}
        {data && data.count > 0 && !movements.isError && (
          <Pagination
            size="touch"
            page={params.page}
            pageSize={MOVEMENT_PAGE_SIZE}
            count={data.count}
            busy={movements.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Movement pages"
            noun="movements"
          />
        )}
      </MobilePanel>
    </>
  )
}
