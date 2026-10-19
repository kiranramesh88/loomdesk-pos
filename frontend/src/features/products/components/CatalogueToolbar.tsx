import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import type { Category } from '@/types/domain'

import { SORTS, hasFilters, type CatalogueParams } from '../catalogueParams'

const ALL = 'all'

const STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const STOCK_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'Any stock level' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
]

interface CatalogueToolbarProps {
  params: CatalogueParams
  categories: Category[] | undefined
  /** Any filter change returns to page 1. */
  onChange: (next: Partial<CatalogueParams>) => void
  onClear: () => void
}

const SEARCH_DELAY_MS = 300

export function CatalogueToolbar({ params, categories, onChange, onClear }: CatalogueToolbarProps) {
  // Typing stays local; the URL (and the request) follow once typing pauses. The commit is
  // scheduled by typing itself, so a URL change from elsewhere can never write an old query back.
  const [search, setSearch] = useState(params.q)
  const [synced, setSynced] = useState(params.q)
  const pending = useRef<number | undefined>(undefined)
  const committed = useRef(params.q)
  if (params.q !== synced) {
    // The URL changed elsewhere (Clear, back button): show its value.
    setSynced(params.q)
    setSearch(params.q)
  }
  useEffect(() => {
    // Not our own commit, so any typing still waiting to commit is out of date.
    if (params.q !== committed.current) window.clearTimeout(pending.current)
    committed.current = params.q
  }, [params.q])
  useEffect(() => () => window.clearTimeout(pending.current), [])

  const type = (value: string) => {
    setSearch(value)
    window.clearTimeout(pending.current)
    pending.current = window.setTimeout(() => {
      committed.current = value.trim()
      onChange({ q: value.trim() })
    }, SEARCH_DELAY_MS)
  }
  const clear = () => {
    window.clearTimeout(pending.current)
    setSearch('')
    onClear()
  }

  const categoryOptions: SelectOption[] = [
    { value: ALL, label: 'All categories' },
    ...(categories ?? []).map((c) => ({ value: String(c.id), label: c.name })),
  ]
  const fromSelect = (value: string) => (value === ALL ? '' : value)

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      {/* Phones: search on its own row, filters two by two, so the list starts above the fold. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(0,180px))]">
        <SearchInput
          label="Search products"
          placeholder="Search name, SKU or barcode…"
          value={search}
          onValueChange={type}
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
          label="Status"
          hideLabel
          options={STATUS_OPTIONS}
          value={params.status || ALL}
          onValueChange={(v) => onChange({ status: fromSelect(v) as CatalogueParams['status'] })}
        />
        <Select
          label="Stock level"
          hideLabel
          options={STOCK_OPTIONS}
          value={params.stock || ALL}
          onValueChange={(v) => onChange({ stock: fromSelect(v) as CatalogueParams['stock'] })}
        />
        <Select
          label="Sort by"
          hideLabel
          options={SORTS}
          value={params.sort}
          onValueChange={(v) => onChange({ sort: v })}
        />
      </div>
      {hasFilters(params) && <ActiveFilters params={params} categories={categories} onClear={clear} />}
    </div>
  )
}

function ActiveFilters({ params, categories, onClear }: Pick<CatalogueToolbarProps, 'params' | 'categories' | 'onClear'>) {
  const parts = [
    params.q && `“${params.q}”`,
    params.category && (categories?.find((c) => String(c.id) === params.category)?.name ?? 'Selected category'),
    params.status && STATUS_OPTIONS.find((o) => o.value === params.status)?.label,
    params.stock && STOCK_OPTIONS.find((o) => o.value === params.stock)?.label,
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="type-helper">
        <span className="font-strong text-ink-3">Filtered by:</span> {parts.join(' · ')}
      </p>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}
