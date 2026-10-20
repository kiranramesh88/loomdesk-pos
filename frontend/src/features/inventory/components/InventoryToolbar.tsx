import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'
import type { Category } from '@/types/domain'

import { hasFilters, SORTS, STOCK_STATES, type InventoryParams } from '../inventoryParams'
import { STOCK_LABELS } from '../labels'

const ALL = 'all'

const STATE_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'All stock levels' },
  ...STOCK_STATES.map((s) => ({ value: s, label: STOCK_LABELS[s].label })),
]
const STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'Sellable and inactive' },
  { value: 'active', label: 'Sellable only' },
  { value: 'inactive', label: 'Inactive only' },
]

interface InventoryToolbarProps {
  params: InventoryParams
  categories: Category[] | undefined
  /** Any filter change returns to page 1. */
  onChange: (next: Partial<InventoryParams>) => void
  onClear: () => void
}

export function InventoryToolbar({ params, categories, onChange, onClear }: InventoryToolbarProps) {
  const search = useDebouncedSearch(params.q, (q) => onChange({ q }))
  const fromSelect = (value: string) => (value === ALL ? '' : value)
  const clear = () => {
    search.cancel()
    onClear()
  }
  const categoryOptions: SelectOption[] = [
    { value: ALL, label: 'All categories' },
    ...(categories ?? []).map((c) => ({ value: String(c.id), label: c.name })),
  ]

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(200px,1fr)_repeat(4,minmax(0,170px))]">
        <SearchInput
          label="Search stock"
          placeholder="Search product, SKU or barcode…"
          value={search.value}
          onValueChange={search.type}
          className="col-span-2 lg:col-span-1"
        />
        <Select
          label="Category"
          hideLabel
          options={categoryOptions}
          value={params.category || ALL}
          onValueChange={(v) => onChange({ category: fromSelect(v) })}
          disabled={!categories}
        />
        <Select
          label="Stock level"
          hideLabel
          options={STATE_OPTIONS}
          value={params.state || ALL}
          onValueChange={(v) => onChange({ state: fromSelect(v) as InventoryParams['state'] })}
        />
        <Select
          label="Item status"
          hideLabel
          options={STATUS_OPTIONS}
          value={params.status || ALL}
          onValueChange={(v) => onChange({ status: fromSelect(v) as InventoryParams['status'] })}
        />
        <Select
          label="Sort by"
          hideLabel
          options={SORTS}
          value={params.sort}
          onValueChange={(v) => onChange({ sort: v as InventoryParams['sort'] })}
        />
      </div>
      {hasFilters(params) && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="type-helper">
            <span className="font-strong text-ink-3">Filtered by:</span>{' '}
            {[
              params.q && `“${params.q}”`,
              params.category && (categories?.find((c) => String(c.id) === params.category)?.name ?? 'Selected category'),
              params.state && STOCK_LABELS[params.state].label,
              params.status && (params.status === 'active' ? 'Sellable only' : 'Inactive only'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}
