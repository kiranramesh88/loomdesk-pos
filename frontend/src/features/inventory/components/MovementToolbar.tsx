import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import { formatStoreDate } from '@/features/transactions/labels'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'

import { hasMovementFilters, MOVEMENT_TYPES, rangeIsBackwards, type MovementParams } from '../inventoryParams'
import { MOVEMENT_LABELS } from '../labels'

const ALL = 'all'

const TYPE_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'All movement types' },
  ...MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABELS[t].label })),
]

interface MovementToolbarProps {
  params: MovementParams
  /** Any filter change returns to page 1. */
  onChange: (next: Partial<MovementParams>) => void
  onClear: () => void
}

export function MovementToolbar({ params, onChange, onClear }: MovementToolbarProps) {
  const search = useDebouncedSearch(params.q, (q) => onChange({ q }))
  const backwards = rangeIsBackwards(params)
  const clear = () => {
    search.cancel()
    onClear()
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(0,190px)_repeat(2,minmax(0,200px))]">
        <SearchInput
          label="Search movements"
          placeholder="Search product, SKU or invoice…"
          value={search.value}
          onValueChange={search.type}
          className="col-span-2 lg:col-span-1"
        />
        <Select
          label="Movement type"
          hideLabel
          className="col-span-2 lg:col-span-1"
          options={TYPE_OPTIONS}
          value={params.type || ALL}
          onValueChange={(v) => onChange({ type: (v === ALL ? '' : v) as MovementParams['type'] })}
        />
        <TextField
          label="From date"
          hideLabel
          className="col-span-2 sm:col-span-1"
          type="date"
          leading={<span aria-hidden className="type-helper">From</span>}
          value={params.from}
          max={params.to || undefined}
          onChange={(event) => onChange({ from: event.target.value })}
        />
        <TextField
          label="To date"
          hideLabel
          className="col-span-2 sm:col-span-1"
          type="date"
          leading={<span aria-hidden className="type-helper">To</span>}
          value={params.to}
          min={params.from || undefined}
          onChange={(event) => onChange({ to: event.target.value })}
          error={backwards ? 'Ends before the start date' : undefined}
        />
      </div>
      {hasMovementFilters(params) && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="type-helper">
            <span className="font-strong text-ink-3">Filtered by:</span>{' '}
            {[
              params.variant && 'One variant',
              params.q && `“${params.q}”`,
              params.type && MOVEMENT_LABELS[params.type].label,
              params.from && `From ${formatStoreDate(params.from)}`,
              params.to && `Up to ${formatStoreDate(params.to)}`,
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
