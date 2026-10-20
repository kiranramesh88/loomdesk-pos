import { AlertTriangle, Boxes, History, PackageX, SearchX, SlidersHorizontal, Warehouse } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ProductThumb } from '@/features/products/components/ProductThumb'
import { useCategories } from '@/features/products/api'
import { ApiError } from '@/lib/http'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { InventorySummary, InventoryVariant } from '@/types/domain'

import { useInventory, useInventorySummary } from '../api'
import { AdjustStockDialog } from '../components/AdjustStockDialog'
import { InventoryToolbar } from '../components/InventoryToolbar'
import { hasFilters, PAGE_SIZE, readParams, writeParams, type InventoryParams } from '../inventoryParams'
import { formatWhen, MOVEMENT_LABELS, STOCK_LABELS } from '../labels'

const historyPath = (v: InventoryVariant) => `movements?variant=${v.id}`

function Item({ v }: { v: InventoryVariant }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductThumb src={v.product.image_url} />
      <div className="min-w-0">
        <Link
          to={`/admin/products/${v.product.id}`}
          className="block truncate font-strong text-ink-2 hover:text-primary hover:underline"
        >
          {v.product.name}
        </Link>
        <div className="type-helper">
          {v.size} / {v.colour} · {v.product.category}
        </div>
      </div>
    </div>
  )
}

function States({ v }: { v: InventoryVariant }) {
  const state = STOCK_LABELS[v.stock_state]
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      {!v.sellable && <StatusBadge tone="neutral">Not on sale</StatusBadge>}
    </div>
  )
}

function LastMovement({ v }: { v: InventoryVariant }) {
  if (!v.last_movement_at || !v.last_movement_type) return <span className="type-helper">No movements</span>
  return (
    <Link to={historyPath(v)} className="group block min-w-0" aria-label={`Stock history for ${v.sku}`}>
      <span className="block text-ink-2 group-hover:text-primary group-hover:underline">{MOVEMENT_LABELS[v.last_movement_type].label}</span>
      <span className="block type-caption tabular">{formatWhen(v.last_movement_at)}</span>
    </Link>
  )
}

/** Desktop table: one row per stock-tracked variant (spec §5.3). */
function columns(onAdjust: (v: InventoryVariant) => void): Column<InventoryVariant>[] {
  return [
    { id: 'item', header: 'Item', cell: (v) => <Item v={v} /> },
    // SKUs wrap at their hyphens, never mid-segment.
    { id: 'sku', header: 'SKU', width: '190px', cell: (v) => <span className="tabular">{v.sku}</span> },
    {
      id: 'on_hand',
      header: 'On hand',
      align: 'right',
      width: '130px',
      cell: (v) => (
        <div>
          <div className="type-amount">{v.on_hand}</div>
          <div className="type-caption tabular whitespace-nowrap">of {v.product_on_hand} in product</div>
        </div>
      ),
    },
    { id: 'reorder', header: 'Reorder at', align: 'right', width: '95px', cell: (v) => <span className="tabular">{v.reorder_level}</span> },
    { id: 'status', header: 'Status', width: '150px', cell: (v) => <States v={v} /> },
    { id: 'moved', header: 'Last movement', width: '175px', cell: (v) => <LastMovement v={v} /> },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      width: '100px',
      cell: (v) => (
        <Button size="sm" onClick={() => onAdjust(v)} aria-label={`Adjust stock for ${v.sku}`}>
          Adjust
        </Button>
      ),
    },
  ]
}

/** Phones and tablets: one card per variant, with the same two actions. */
function StockCards({ rows, onAdjust }: { rows: InventoryVariant[]; onAdjust: (v: InventoryVariant) => void }) {
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {rows.map((v) => (
        <li key={v.id} className="flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <Item v={v} />
            <div className="shrink-0 text-right">
              <div className="type-amount">{v.on_hand}</div>
              <div className="type-caption">on hand</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 type-helper">
            <States v={v} />
            <span className="tabular">{v.sku}</span>
            <span className="tabular">Reorder at {v.reorder_level}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 type-helper">
              {v.last_movement_at && v.last_movement_type
                ? `${MOVEMENT_LABELS[v.last_movement_type].label}, ${formatWhen(v.last_movement_at)}`
                : 'No movements yet'}
            </span>
            <div className="flex shrink-0 gap-2">
              <ButtonLink size="sm" variant="ghost" to={historyPath(v)} aria-label={`Stock history for ${v.sku}`}>
                History
              </ButtonLink>
              <Button size="sm" onClick={() => onAdjust(v)} aria-label={`Adjust stock for ${v.sku}`}>
                Adjust
              </Button>
            </div>
          </div>
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

/** Each footnote is the figure's definition. Counts cover sellable variants only. */
function SummaryFigures({ summary, error, onRetry, retrying }: { summary: InventorySummary | undefined; error: Error | null; onRetry: () => void; retrying: boolean }) {
  if (error) {
    return (
      <Card aria-label="Stock summary" className="mb-5">
        <ErrorState title="The stock summary couldn’t load" message={error.message} onRetry={onRetry} retrying={retrying} />
      </Card>
    )
  }
  const loading = !summary
  const count = (n: number | undefined) => n?.toLocaleString('en-IN')
  return (
    <section aria-label="Stock summary" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard label="Tracked variants" icon={Boxes} isLoading={loading} value={count(summary?.tracked_variants)} footnote="Sizes and colours currently on sale" />
      <KpiCard label="Units on hand" icon={Warehouse} isLoading={loading} value={count(summary?.units_on_hand)} footnote="Across tracked variants" />
      <KpiCard label="Low stock" icon={AlertTriangle} isLoading={loading} value={count(summary?.low_stock)} footnote="At or below the reorder level" />
      <KpiCard label="Out of stock" icon={PackageX} isLoading={loading} value={count(summary?.out_of_stock)} footnote="No units left" />
    </section>
  )
}

export function InventoryPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const inventory = useInventory(params)
  const summary = useInventorySummary()
  const categories = useCategories()
  const wide = useMediaQuery(MEDIA.wide)
  const [adjusting, setAdjusting] = useState<InventoryVariant | null>(null)

  const update = useCallback(
    (next: Partial<InventoryParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])

  const data = inventory.data
  const empty = hasFilters(params) ? (
    <EmptyState
      icon={<SearchX />}
      title="No stock matches"
      description="Try another product name, SKU or barcode, or clear the filters to see every variant."
      action={<Button onClick={clear}>Clear filters</Button>}
    />
  ) : (
    <EmptyState
      icon={<Boxes />}
      title="No stock-tracked items yet"
      description="Each product variant appears here once it’s added to the catalogue."
      action={<ButtonLink to="/admin/products/new">Add a product</ButtonLink>}
    />
  )
  const pageMissing = inventory.error instanceof ApiError && inventory.error.status === 404

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand for every size and colour, with adjustments and their history."
        actions={
          <ButtonLink to="movements" icon={<History />}>
            Stock movements
          </ButtonLink>
        }
      />
      <SummaryFigures summary={summary.data} error={summary.error} onRetry={() => void summary.refetch()} retrying={summary.isRefetching} />
      <Card aria-label="Stock levels">
        <InventoryToolbar params={params} categories={categories.data} onChange={update} onClear={clear} />
        {pageMissing ? (
          <EmptyState
            icon={<SearchX />}
            title="That page doesn’t exist"
            description="There are fewer pages of stock now."
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : wide ? (
          <DataTable
            caption="Stock levels"
            columns={columns(setAdjusting)}
            rows={data?.results}
            getRowId={(v) => v.id}
            isLoading={inventory.isPending}
            error={inventory.error}
            onRetry={() => void inventory.refetch()}
            retrying={inventory.isRefetching}
            empty={empty}
            minWidth="980px"
          />
        ) : inventory.error ? (
          <ErrorState message={inventory.error.message} onRetry={() => void inventory.refetch()} retrying={inventory.isRefetching} />
        ) : !data ? (
          <CardsSkeleton />
        ) : data.results.length === 0 ? (
          empty
        ) : (
          <StockCards rows={data.results} onAdjust={setAdjusting} />
        )}
        {data && data.count > 0 && !inventory.error && (
          <Pagination
            page={params.page}
            pageSize={PAGE_SIZE}
            count={data.count}
            busy={inventory.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Stock pages"
            noun="variants"
          />
        )}
      </Card>
      <p className="mt-3 flex items-center gap-1.5 type-helper">
        <SlidersHorizontal aria-hidden className="size-3.5" />
        Reorder levels are set per variant on each product’s edit page.
      </p>
      <AdjustStockDialog variant={adjusting} onClose={() => setAdjusting(null)} />
    </>
  )
}
