import { ArrowLeftRight, ArrowRight, Plus, SearchX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { ReturnListItem } from '@/types/domain'

import { useReturns } from '../api'
import { Dispositions } from '../components/Dispositions'
import { DISPOSITION_LABELS, formatSaleTime, isManuallyRecorded, PAYMENT_LABELS, REASON_LABELS, unitsLabel } from '../labels'
import {
  DISPOSITIONS,
  hasFilters,
  PAGE_SIZE,
  rangeIsBackwards,
  readParams,
  writeParams,
  type ReturnParams,
} from '../returnParams'

const ALL = 'all'

const DISPOSITION_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'Any destination' },
  ...DISPOSITIONS.map((d) => ({ value: d, label: DISPOSITION_LABELS[d].label })),
]

function Refund({ row }: { row: ReturnListItem }) {
  return (
    <div className="min-w-0 text-right">
      <div className="type-amount">{formatMoney(row.total_paise)}</div>
      <div className="type-caption">
        {PAYMENT_LABELS[row.refund_method]}
        {isManuallyRecorded(row.refund_method) && ' · not gateway-verified'}
      </div>
    </div>
  )
}

const COLUMNS: Column<ReturnListItem>[] = [
  {
    id: 'number',
    header: 'Return',
    width: '130px',
    cell: (r) => (
      <Link to={r.number} className="font-strong text-ink-2 tabular hover:text-primary hover:underline">
        {r.number}
      </Link>
    ),
  },
  { id: 'date', header: 'Date & time', width: '180px', cell: (r) => <span className="tabular">{formatSaleTime(r.created_at)}</span> },
  {
    id: 'invoice',
    header: 'Original bill',
    width: '130px',
    cell: (r) => (
      <Link to={`/admin/transactions/${r.invoice_no}`} className="tabular text-ink-2 hover:text-primary hover:underline">
        {r.invoice_no}
      </Link>
    ),
  },
  { id: 'customer', header: 'Customer', width: '100px', cell: () => <span className="text-ink-3">Walk-in</span> },
  { id: 'reason', header: 'Reason', cell: (r) => <span className="break-words">{REASON_LABELS[r.reason]}</span> },
  { id: 'units', header: 'Qty', align: 'right', width: '90px', cell: (r) => <span className="tabular whitespace-nowrap">{unitsLabel(r.units)}</span> },
  { id: 'stock', header: 'Stock', width: '190px', cell: (r) => <Dispositions values={r.dispositions} /> },
  { id: 'refund', header: 'Refund', align: 'right', width: '190px', cell: (r) => <Refund row={r} /> },
]

function ReturnCards({ rows }: { rows: ReturnListItem[] }) {
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {rows.map((r) => (
        <li key={r.number}>
          <Link
            to={r.number}
            className="flex items-center gap-3 px-4 py-3.5 transition-control hover:bg-surface-muted focus-visible:bg-surface-muted"
            aria-label={`${r.number}, refund ${formatMoney(r.total_paise)}, from ${r.invoice_no}`}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-strong text-ink-2 tabular">{r.number}</span>
                <span className="type-amount">{formatMoney(r.total_paise)}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 type-helper">
                <span className="tabular">{formatSaleTime(r.created_at)}</span>
                <span className="tabular">From {r.invoice_no}</span>
                <span>{unitsLabel(r.units)}</span>
                <span>{REASON_LABELS[r.reason]}</span>
              </div>
              <Dispositions values={r.dispositions} />
            </div>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Toolbar({ params, onChange, onClear }: { params: ReturnParams; onChange: (next: Partial<ReturnParams>) => void; onClear: () => void }) {
  // Typing stays local; the URL (and the request) follow once typing pauses.
  const [search, setSearch] = useState(params.q)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const [synced, setSynced] = useState(params.q)
  if (params.q !== synced) {
    setSynced(params.q)
    setSearch(params.q)
  }
  const backwards = rangeIsBackwards(params)
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(200px,1fr)_repeat(2,minmax(0,165px))_minmax(0,200px)]">
        <SearchInput
          label="Search returns"
          placeholder="Return or invoice number…"
          value={search}
          onValueChange={(value) => {
            setSearch(value)
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => onChange({ q: value.trim() }), 300)
          }}
          className="col-span-2 lg:col-span-1"
        />
        <TextField
          label="From date"
          hideLabel
          type="date"
          leading={<span aria-hidden className="type-helper">From</span>}
          value={params.from}
          max={params.to || undefined}
          onChange={(event) => onChange({ from: event.target.value })}
        />
        <TextField
          label="To date"
          hideLabel
          type="date"
          leading={<span aria-hidden className="type-helper">To</span>}
          value={params.to}
          min={params.from || undefined}
          onChange={(event) => onChange({ to: event.target.value })}
          error={backwards ? 'Ends before the start date' : undefined}
        />
        <Select
          label="Where the items went"
          hideLabel
          className="col-span-2 lg:col-span-1"
          options={DISPOSITION_OPTIONS}
          value={params.disposition || ALL}
          onValueChange={(v) => onChange({ disposition: v === ALL ? '' : (v as ReturnParams['disposition']) })}
        />
      </div>
      {hasFilters(params) && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="type-helper">Showing returns that match the filters.</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              window.clearTimeout(timer.current)
              setSearch('')
              onClear()
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}

export function ReturnListPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const backwards = rangeIsBackwards(params)
  const returns = useReturns(params)
  const wide = useMediaQuery(MEDIA.wide)

  const update = useCallback(
    (next: Partial<ReturnParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])

  const data = backwards ? undefined : returns.data
  const empty = hasFilters(params) ? (
    <EmptyState
      icon={<SearchX />}
      title="No returns match"
      description="Try another number, date range or destination, or clear the filters."
      action={<Button onClick={clear}>Clear filters</Button>}
    />
  ) : (
    <EmptyState
      icon={<ArrowLeftRight />}
      title="No returns yet"
      description="Start one from the original bill, or with its invoice number."
      action={<ButtonLink to="new">New return</ButtonLink>}
    />
  )
  const pageMissing = returns.error instanceof ApiError && returns.error.status === 404

  return (
    <>
      <PageHeader
        title="Returns"
        description="Goods customers brought back, the refunds given and where the items went."
        actions={
          <ButtonLink to="new" variant="primary" icon={<Plus />}>
            New return
          </ButtonLink>
        }
      />
      {backwards && (
        <InlineAlert tone="warning" className="mb-5">
          The end date is before the start date. Change one of them to see returns.
        </InlineAlert>
      )}
      <Card aria-label="Returns">
        <Toolbar params={params} onChange={update} onClear={clear} />
        {backwards ? null : pageMissing ? (
          <EmptyState
            icon={<SearchX />}
            title="That page doesn’t exist"
            description="There are fewer pages of returns now."
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : wide ? (
          <DataTable
            caption="Returns"
            columns={COLUMNS}
            rows={data?.results}
            getRowId={(r) => r.number}
            isLoading={returns.isPending}
            error={returns.error}
            onRetry={() => void returns.refetch()}
            retrying={returns.isRefetching}
            empty={empty}
            minWidth="1060px"
          />
        ) : returns.error ? (
          <ErrorState message={returns.error.message} onRetry={() => void returns.refetch()} retrying={returns.isRefetching} />
        ) : !data ? (
          <div aria-hidden className="grid gap-3 px-4 py-4">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ) : data.results.length === 0 ? (
          empty
        ) : (
          <ReturnCards rows={data.results} />
        )}
        {data && data.count > 0 && !returns.error && (
          <Pagination
            page={params.page}
            count={data.count}
            busy={returns.isPlaceholderData}
            onPage={(page) => update({ page })}
            pageSize={PAGE_SIZE}
            label="Return pages"
            noun="returns"
          />
        )}
      </Card>
    </>
  )
}
