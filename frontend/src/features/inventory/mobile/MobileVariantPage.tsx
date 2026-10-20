import { History, PackageSearch, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { ApiError } from '@/lib/http'
import type { InventoryVariant } from '@/types/domain'

import { useInventoryVariant, useMovements } from '../api'
import { parseVariantId } from '../inventoryParams'
import { formatWhen, MOVEMENT_LABELS, STOCK_LABELS } from '../labels'
import { MobileMovementRows } from './MobileMovementRows'

const RECENT_MOVEMENTS = 5
const back = { to: mobilePath('inventory'), label: 'Inventory' }

function VariantMissing() {
  return (
    <>
      <MobilePageHeader title="Item not found" back={back} />
      <Card>
        <EmptyState
          icon={<PackageSearch />}
          title="No item with that address"
          description="Search the inventory for the product, SKU or barcode."
          action={<ButtonLink to={mobilePath('inventory')}>Back to inventory</ButtonLink>}
        />
      </Card>
    </>
  )
}

/** Loads the variant in the URL and renders its missing, error and loading states. */
export function WithVariant({ backTo = back, children }: { backTo?: { to: string; label: string }; children: (v: InventoryVariant) => ReactNode }) {
  const id = parseVariantId(useParams().variantId)
  const variant = useInventoryVariant(id)
  if (!id || (variant.error instanceof ApiError && variant.error.status === 404)) return <VariantMissing />
  if (variant.isError) {
    return (
      <>
        <MobilePageHeader title="Stock" back={backTo} />
        <Card>
          <ErrorState message={variant.error.message} onRetry={() => void variant.refetch()} retrying={variant.isRefetching} />
        </Card>
      </>
    )
  }
  if (!variant.data) {
    return (
      <>
        <MobilePageHeader title="Stock" back={backTo} />
        <Card role="status" aria-label="Loading item" className="p-4">
          <SkeletonText lines={5} />
        </Card>
      </>
    )
  }
  return <>{children(variant.data)}</>
}

function RecentMovements({ variant }: { variant: InventoryVariant }) {
  const movements = useMovements({ q: '', variant: String(variant.id), type: '', from: '', to: '', page: 1 })
  const rows = movements.data?.results.slice(0, RECENT_MOVEMENTS)
  return (
    <MobilePanel
      title="Recent movements"
      description="Newest first. The full history can’t be edited."
      action={
        movements.data && movements.data.count > RECENT_MOVEMENTS
          ? { to: mobilePath(`inventory/movements?variant=${variant.id}`), label: 'View all' }
          : undefined
      }
    >
      {movements.isError ? (
        <ErrorState message={movements.error.message} onRetry={() => void movements.refetch()} retrying={movements.isRefetching} />
      ) : !rows ? (
        <MobileRowsSkeleton label="Loading movements" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<History />} title="No movements yet" />
      ) : (
        <MobileMovementRows movements={rows} />
      )}
    </MobilePanel>
  )
}

function VariantDetail({ v }: { v: InventoryVariant }) {
  const state = STOCK_LABELS[v.stock_state]
  return (
    <>
      <MobilePageHeader
        title={v.product.name}
        description={`${v.size} / ${v.colour}`}
        back={back}
        actions={
          <ButtonLink to="adjust" variant="primary" size="lg" icon={<SlidersHorizontal />}>
            Adjust stock
          </ButtonLink>
        }
      />
      <div className="grid gap-4">
        <section aria-label="Stock" className="rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="type-helper">On hand</p>
              <p className="type-figure">{v.on_hand.toLocaleString('en-IN')}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
              {!v.sellable && <StatusBadge tone="neutral">Not on sale</StatusBadge>}
            </div>
          </div>
          <p className="mt-2 type-helper">
            Reorder level {v.reorder_level}. All sizes and colours of this product: {v.product_on_hand.toLocaleString('en-IN')} on hand.
          </p>
        </section>
        <MobilePanel title="Item">
          <MobileFacts>
            <MobileFact label="SKU">
              <span className="tabular break-all">{v.sku}</span>
            </MobileFact>
            <MobileFact label="Barcode">
              <span className="tabular break-all">{v.barcode || 'None'}</span>
            </MobileFact>
            <MobileFact label="Product SKU">
              <span className="tabular break-all">{v.product.sku}</span>
            </MobileFact>
            <MobileFact label="Category">{v.product.category}</MobileFact>
            <MobileFact label="Last change">
              {v.last_movement_at && v.last_movement_type
                ? `${MOVEMENT_LABELS[v.last_movement_type].label}, ${formatWhen(v.last_movement_at)}`
                : 'None recorded'}
            </MobileFact>
          </MobileFacts>
        </MobilePanel>
        <RecentMovements variant={v} />
      </div>
    </>
  )
}

/** `/admin/mobile/inventory/:variantId`: one size and colour's stock and its recent movements. */
export function MobileVariantPage() {
  return <WithVariant>{(v) => <VariantDetail v={v} />}</WithVariant>
}
