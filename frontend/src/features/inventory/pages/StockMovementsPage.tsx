import { ArrowLeft, History, SearchX } from 'lucide-react'
import { useCallback, useState } from 'react'
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
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ApiError } from '@/lib/http'
import { cx } from '@/lib/cx'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { InventoryMovement, InventoryVariant } from '@/types/domain'

import { useInventoryVariant, useMovements } from '../api'
import { AdjustStockDialog } from '../components/AdjustStockDialog'
import { MovementToolbar } from '../components/MovementToolbar'
import {
  hasMovementFilters,
  MOVEMENT_PAGE_SIZE,
  rangeIsBackwards,
  readMovementParams,
  writeMovementParams,
  type MovementParams,
} from '../inventoryParams'
import { formatDelta, formatWhen, isInvoiceReference, MOVEMENT_LABELS, STOCK_LABELS, variantName } from '../labels'

function TypeBadge({ m }: { m: InventoryMovement }) {
  const type = MOVEMENT_LABELS[m.type]
  return <StatusBadge tone={type.tone}>{type.label}</StatusBadge>
}

function Change({ m }: { m: InventoryMovement }) {
  return (
    <span className={cx('type-amount', m.quantity_delta < 0 ? 'text-danger' : m.quantity_delta > 0 ? 'text-success' : 'text-ink-3')}>
      {formatDelta(m.quantity_delta)}
    </span>
  )
}

/** Sales link to their saved bill; other references show as text. */
function Reference({ m }: { m: InventoryMovement }) {
  return isInvoiceReference(m.reference) ? (
    <Link to={`/admin/transactions/${m.reference}`} className="tabular text-ink-2 hover:text-primary hover:underline">
      {m.reference}
    </Link>
  ) : (
    <span className="tabular">{m.reference}</span>
  )
}

const actor = (m: InventoryMovement) => m.actor_name ?? 'System'

function MovementItem({ m, linkVariant }: { m: InventoryMovement; linkVariant: boolean }) {
  const name = (
    <>
      <span className="block truncate font-strong text-ink-2">{m.variant.product_name}</span>
      <span className="block type-helper">
        {m.variant.size} / {m.variant.colour} · <span className="tabular">{m.variant.sku}</span>
      </span>
    </>
  )
  return linkVariant ? (
    <Link to={`?variant=${m.variant.id}`} className="group block min-w-0 [&>span:first-child]:group-hover:text-primary [&>span:first-child]:group-hover:underline">
      {name}
    </Link>
  ) : (
    <div className="min-w-0">{name}</div>
  )
}

function columns(linkVariant: boolean): Column<InventoryMovement>[] {
  return [
    { id: 'when', header: 'Date & time', width: '185px', cell: (m) => <span className="tabular whitespace-nowrap">{formatWhen(m.created_at)}</span> },
    { id: 'item', header: 'Item', cell: (m) => <MovementItem m={m} linkVariant={linkVariant} /> },
    { id: 'type', header: 'Type', width: '170px', cell: (m) => <TypeBadge m={m} /> },
    { id: 'change', header: 'Change', align: 'right', width: '80px', cell: (m) => <Change m={m} /> },
    { id: 'balance', header: 'Balance', align: 'right', width: '80px', cell: (m) => <span className="tabular">{m.balance_after}</span> },
    {
      id: 'detail',
      header: 'Reason & reference',
      width: '220px',
      cell: (m) => (
        <div className="min-w-0">
          {m.reason && <div className="break-words text-ink-2">{m.reason}</div>}
          {m.reference && <Reference m={m} />}
          {!m.reason && !m.reference && <span className="type-helper">—</span>}
        </div>
      ),
    },
    { id: 'by', header: 'By', width: '130px', cell: (m) => <span className="break-words">{actor(m)}</span> },
  ]
}

function MovementCards({ rows, linkVariant }: { rows: InventoryMovement[]; linkVariant: boolean }) {
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {rows.map((m) => (
        <li key={m.id} className="flex flex-col gap-2 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <MovementItem m={m} linkVariant={linkVariant} />
            <div className="shrink-0 text-right">
              <Change m={m} />
              <div className="type-caption tabular">Balance {m.balance_after}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 type-helper">
            <TypeBadge m={m} />
            <span className="tabular">{formatWhen(m.created_at)}</span>
            <span>{actor(m)}</span>
            {m.reference && <Reference m={m} />}
          </div>
          {m.reason && <p className="break-words type-helper text-ink-3">{m.reason}</p>}
        </li>
      ))}
    </ul>
  )
}

function CardsSkeleton() {
  return (
    <div aria-hidden className="divide-y divide-line-soft border-t border-line-soft">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-4">
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  )
}

/** When the history is for one variant: what it is, its stock now, and the adjust action. */
function VariantHeading({ id, onAdjust, onShowAll }: { id: string; onAdjust: (v: InventoryVariant) => void; onShowAll: () => void }) {
  const variant = useInventoryVariant(id)
  if (variant.error) {
    const missing = variant.error instanceof ApiError && variant.error.status === 404
    return (
      <InlineAlert tone={missing ? 'warning' : 'danger'} className="mb-5">
        {missing ? 'That variant doesn’t exist. ' : `The variant couldn’t load: ${variant.error.message} `}
        <button type="button" onClick={onShowAll} className="font-strong underline">
          Show all movements
        </button>
      </InlineAlert>
    )
  }
  const v = variant.data
  return (
    <Card aria-label="Variant" className="mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
      {v ? (
        <>
          <div className="min-w-0">
            <p className="type-section">{variantName(v)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 type-helper">
              <span className="tabular">{v.sku}</span>
              <span>
                On hand <span className="tabular font-strong text-ink-2">{v.on_hand}</span>
              </span>
              <span className="tabular">Reorder at {v.reorder_level}</span>
              <StatusBadge tone={STOCK_LABELS[v.stock_state].tone}>{STOCK_LABELS[v.stock_state].label}</StatusBadge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onShowAll}>
              All movements
            </Button>
            <Button size="sm" onClick={() => onAdjust(v)}>
              Adjust stock
            </Button>
          </div>
        </>
      ) : (
        <div aria-hidden className="flex w-full flex-col gap-2 py-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
    </Card>
  )
}

export function StockMovementsPage() {
  const [search, setSearch] = useSearchParams()
  const params = readMovementParams(search)
  const movements = useMovements(params)
  const wide = useMediaQuery(MEDIA.wide)
  const [adjusting, setAdjusting] = useState<InventoryVariant | null>(null)

  const update = useCallback(
    (next: Partial<MovementParams>) =>
      setSearch((current) => writeMovementParams({ ...readMovementParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])

  const backwards = rangeIsBackwards(params)
  const data = movements.data
  const linkVariant = !params.variant
  const empty = hasMovementFilters(params) ? (
    <EmptyState
      icon={<SearchX />}
      title="No movements match"
      description="Try another search, type or date range, or clear the filters to see every movement."
      action={<Button onClick={clear}>Clear filters</Button>}
    />
  ) : (
    <EmptyState icon={<History />} title="No stock movements yet" description="Opening stock, sales and adjustments are recorded here." />
  )
  const pageMissing = movements.error instanceof ApiError && movements.error.status === 404

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="Every change to stock, newest first. Movements are permanent and can’t be edited."
        actions={
          <ButtonLink to="/admin/inventory" icon={<ArrowLeft />}>
            Inventory
          </ButtonLink>
        }
      />
      {params.variant && <VariantHeading id={params.variant} onAdjust={setAdjusting} onShowAll={() => update({ variant: '' })} />}
      <Card aria-label="Stock movements">
        <MovementToolbar params={params} onChange={update} onClear={clear} />
        {backwards ? (
          <InlineAlert tone="warning" className="mx-4 mb-4 sm:mx-5">
            The end date is before the start date. Change one of them to see movements.
          </InlineAlert>
        ) : pageMissing ? (
          <EmptyState
            icon={<SearchX />}
            title="That page doesn’t exist"
            description="There are fewer pages of movements now."
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : wide ? (
          <DataTable
            caption="Stock movements"
            columns={columns(linkVariant)}
            rows={data?.results}
            getRowId={(m) => m.id}
            isLoading={movements.isPending}
            error={movements.error}
            onRetry={() => void movements.refetch()}
            retrying={movements.isRefetching}
            empty={empty}
            minWidth="980px"
          />
        ) : movements.error ? (
          <ErrorState message={movements.error.message} onRetry={() => void movements.refetch()} retrying={movements.isRefetching} />
        ) : !data ? (
          <CardsSkeleton />
        ) : data.results.length === 0 ? (
          empty
        ) : (
          <MovementCards rows={data.results} linkVariant={linkVariant} />
        )}
        {!backwards && data && data.count > 0 && !movements.error && (
          <Pagination
            page={params.page}
            pageSize={MOVEMENT_PAGE_SIZE}
            count={data.count}
            busy={movements.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Movement pages"
            noun="movements"
          />
        )}
      </Card>
      <AdjustStockDialog variant={adjusting} onClose={() => setAdjusting(null)} />
    </>
  )
}
