import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import type { SaleCashier } from '@/types/domain'

import { formatStoreDate, PAYMENT_LABELS } from '../labels'
import { hasFilters, METHODS, rangeIsBackwards, type TransactionParams } from '../transactionParams'

const ALL = 'all'

const METHOD_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'All payment methods' },
  ...METHODS.map((m) => ({ value: m, label: PAYMENT_LABELS[m] })),
]

interface TransactionToolbarProps {
  params: TransactionParams
  cashiers: SaleCashier[] | undefined
  /** Any filter change returns to page 1. */
  onChange: (next: Partial<TransactionParams>) => void
  onClear: () => void
}

const SEARCH_DELAY_MS = 300

export function TransactionToolbar({ params, cashiers, onChange, onClear }: TransactionToolbarProps) {
  // Typing stays local; the URL (and the request) follow once typing pauses. Same pattern as the
  // product catalogue toolbar: a URL change from elsewhere can never write an old query back.
  const [search, setSearch] = useState(params.q)
  const [synced, setSynced] = useState(params.q)
  const pending = useRef<number | undefined>(undefined)
  const committed = useRef(params.q)
  if (params.q !== synced) {
    setSynced(params.q)
    setSearch(params.q)
  }
  useEffect(() => {
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

  const cashierOptions: SelectOption[] = [
    { value: ALL, label: 'All cashiers' },
    ...(cashiers ?? []).map((c) => ({ value: String(c.id), label: c.is_active ? c.full_name : `${c.full_name} (deactivated)` })),
  ]
  const fromSelect = (value: string) => (value === ALL ? '' : value)
  const backwards = rangeIsBackwards(params)

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      {/* Phones: search on its own row, then the filters two by two. */}
      <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(200px,1fr)_repeat(2,minmax(0,165px))_repeat(2,minmax(0,200px))]">
        <SearchInput
          label="Search transactions"
          placeholder="Search invoice number…"
          value={search}
          onValueChange={type}
          className="col-span-2 lg:col-span-1"
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
        <Select
          label="Cashier"
          hideLabel
          options={cashierOptions}
          value={params.cashier || ALL}
          onValueChange={(v) => onChange({ cashier: fromSelect(v) })}
          disabled={!cashiers}
        />
        <Select
          label="Payment method"
          hideLabel
          options={METHOD_OPTIONS}
          value={params.method || ALL}
          onValueChange={(v) => onChange({ method: fromSelect(v) as TransactionParams['method'] })}
        />
      </div>
      {hasFilters(params) && <ActiveFilters params={params} cashiers={cashiers} onClear={clear} />}
    </div>
  )
}

function ActiveFilters({ params, cashiers, onClear }: Pick<TransactionToolbarProps, 'params' | 'cashiers' | 'onClear'>) {
  const range =
    params.from && params.to
      ? `${formatStoreDate(params.from)} to ${formatStoreDate(params.to)}`
      : params.from
        ? `From ${formatStoreDate(params.from)}`
        : params.to && `Up to ${formatStoreDate(params.to)}`
  const parts = [
    params.q && `“${params.q}”`,
    range,
    params.cashier && (cashiers?.find((c) => String(c.id) === params.cashier)?.full_name ?? 'Selected cashier'),
    params.method && PAYMENT_LABELS[params.method],
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
