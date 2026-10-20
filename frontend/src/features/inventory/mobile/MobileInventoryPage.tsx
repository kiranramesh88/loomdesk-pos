import { History, PackageSearch, SearchX } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileList, MobilePageHeader, MobilePanel, MobileRow } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { ApiError } from '@/lib/http'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'
import type { StockState } from '@/types/domain'

import { useInventory } from '../api'
import { hasFilters, PAGE_SIZE, readParams, SORTS, writeParams, type InventoryParams } from '../inventoryParams'
import { STOCK_LABELS } from '../labels'

type StateChoice = StockState | 'all'

const STATE_CHIPS: ChipOption<StateChoice>[] = [
  { value: 'all', label: 'All' },
  { value: 'low_stock', label: 'Low' },
  { value: 'out_of_stock', label: 'Out' },
  { value: 'in_stock', label: 'In stock' },
]

/** `/admin/mobile/inventory`: find a product, size or colour and see its stock. Filters live in the URL. */
export function MobileInventoryPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const inventory = useInventory(params)
  const update = useCallback(
    (next: Partial<InventoryParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])
  const query = useDebouncedSearch(params.q, (q) => update({ q }))
  const data = inventory.data
  const pageMissing = inventory.error instanceof ApiError && inventory.error.status === 404

  return (
    <>
      <MobilePageHeader
        title="Inventory"
        description="Stock for every size and colour."
        actions={
          <ButtonLink to={mobilePath('inventory/movements')} size="lg" icon={<History />}>
            Stock movements
          </ButtonLink>
        }
      />
      <div className="mb-4 grid gap-3">
        <SearchInput
          label="Search stock"
          size="lg"
          placeholder="Product, SKU or barcode…"
          value={query.value}
          onValueChange={query.type}
        />
        <ChipGroup
          label="Stock level"
          hideLabel
          options={STATE_CHIPS}
          value={params.state || 'all'}
          onValueChange={(v) => update({ state: v === 'all' ? '' : v })}
        />
        <Select
          label="Sort by"
          hideLabel
          options={SORTS}
          value={params.sort}
          onValueChange={(v) => update({ sort: v as InventoryParams['sort'] })}
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

      <MobilePanel title="Stock" description={data ? `${data.count.toLocaleString('en-IN')} matching variants.` : undefined}>
        {pageMissing ? (
          <EmptyState
            icon={<SearchX />}
            title="That page doesn’t exist"
            description="There are fewer pages now."
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : inventory.isError ? (
          <ErrorState message={inventory.error.message} onRetry={() => void inventory.refetch()} retrying={inventory.isRefetching} />
        ) : !data ? (
          <MobileRowsSkeleton rows={5} label="Loading stock" />
        ) : data.results.length === 0 ? (
          hasFilters(params) ? (
            <EmptyState icon={<SearchX />} title="Nothing matches" description="Try another name, SKU or barcode, or clear the filters." />
          ) : (
            <EmptyState icon={<PackageSearch />} title="No stock tracked yet" description="Products added in the full admin appear here." />
          )
        ) : (
          <MobileList label="Stock by variant">
            {data.results.map((v) => {
              const state = STOCK_LABELS[v.stock_state]
              return (
                <MobileRow
                  key={v.id}
                  to={mobilePath(`inventory/${v.id}`)}
                  title={v.product.name}
                  meta={
                    <>
                      <span>
                        {v.size} / {v.colour}
                      </span>
                      <span className="tabular break-all">{v.sku}</span>
                      {!v.sellable && <StatusBadge tone="neutral">Not on sale</StatusBadge>}
                    </>
                  }
                  aside={
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-price font-bold tabular text-ink">{v.on_hand}</span>
                      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    </div>
                  }
                />
              )
            })}
          </MobileList>
        )}
        {data && data.count > 0 && !inventory.isError && (
          <Pagination
            size="touch"
            page={params.page}
            pageSize={PAGE_SIZE}
            count={data.count}
            busy={inventory.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Stock pages"
            noun="variants"
          />
        )}
      </MobilePanel>
    </>
  )
}
