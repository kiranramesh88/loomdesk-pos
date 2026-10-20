import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'

import { SUPPLIER_STATUS_LABELS } from '../labels'
import { hasFilters, SORTS, STATUSES, type SupplierParams } from '../supplierParams'

const ALL = 'all'

const STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'All statuses' },
  ...STATUSES.map((s) => ({ value: s, label: SUPPLIER_STATUS_LABELS[s].label })),
]

interface SupplierToolbarProps {
  params: SupplierParams
  categories: string[] | undefined
  /** Any filter change returns to page 1. */
  onChange: (next: Partial<SupplierParams>) => void
  onClear: () => void
}

export function SupplierToolbar({ params, categories, onChange, onClear }: SupplierToolbarProps) {
  const search = useDebouncedSearch(params.q, (q) => onChange({ q }))
  const clear = () => {
    search.cancel()
    onClear()
  }
  const categoryOptions: SelectOption[] = [
    { value: ALL, label: 'All categories' },
    ...(categories ?? []).map((c) => ({ value: c, label: c })),
  ]

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(200px,1fr)_repeat(3,minmax(0,190px))]">
        <SearchInput
          label="Search suppliers"
          placeholder="Search name, contact, phone or GSTIN…"
          value={search.value}
          onValueChange={search.type}
          className="col-span-2 lg:col-span-1"
        />
        <Select
          label="Category"
          hideLabel
          options={categoryOptions}
          value={params.category || ALL}
          onValueChange={(v) => onChange({ category: v === ALL ? '' : v })}
          disabled={!categories}
        />
        <Select
          label="Status"
          hideLabel
          options={STATUS_OPTIONS}
          value={params.status || ALL}
          onValueChange={(v) => onChange({ status: (v === ALL ? '' : v) as SupplierParams['status'] })}
        />
        <Select
          label="Sort by"
          hideLabel
          className="col-span-2 lg:col-span-1"
          options={SORTS}
          value={params.sort}
          onValueChange={(v) => onChange({ sort: v as SupplierParams['sort'] })}
        />
      </div>
      {hasFilters(params) && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="type-helper">
            <span className="font-strong text-ink-3">Filtered by:</span>{' '}
            {[params.q && `“${params.q}”`, params.category, params.status && SUPPLIER_STATUS_LABELS[params.status].label]
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
