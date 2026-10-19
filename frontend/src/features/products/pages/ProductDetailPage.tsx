import { ArrowLeft, Archive, ArchiveRestore, History, PackageX, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/toastContext'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { ProductDetail, StockMovement, Variant } from '@/types/domain'

import { parseProductId, useProduct, useSetProductStatus } from '../api'
import { ProductThumb } from '../components/ProductThumb'
import { STATUS_LABELS, STOCK_LABELS, unitsLabel } from '../labels'

const backLink = (
  <ButtonLink to=".." variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-3 mb-2">
    Products
  </ButtonLink>
)

export function ProductMissing() {
  return (
    <>
      {backLink}
      <Card>
        <EmptyState
          icon={<PackageX />}
          title="This product doesn’t exist"
          description="It may have been mistyped in the address. Products are never deleted, so check the catalogue."
          action={<ButtonLink to="..">Back to products</ButtonLink>}
        />
      </Card>
    </>
  )
}

const variantStock = (v: Variant) =>
  v.is_active ? (
    <StatusBadge tone={STOCK_LABELS[v.stock_state].tone}>{STOCK_LABELS[v.stock_state].label}</StatusBadge>
  ) : (
    <StatusBadge tone="neutral">Inactive</StatusBadge>
  )

const VARIANT_COLUMNS: Column<Variant>[] = [
  {
    id: 'variant',
    header: 'Variant',
    cell: (v) => (
      <div className="min-w-0">
        <div className="font-strong break-words text-ink-2">
          {v.size} / {v.colour}
        </div>
        {!v.is_active && <div className="type-helper">Hidden from billing</div>}
      </div>
    ),
  },
  { id: 'sku', header: 'SKU', cell: (v) => <span className="tabular">{v.sku}</span> },
  { id: 'barcode', header: 'Barcode', cell: (v) => (v.barcode ? <span className="tabular">{v.barcode}</span> : <span className="text-muted">None</span>) },
  { id: 'price', header: 'Price', align: 'right', cell: (v) => <span className="type-amount">{formatMoney(v.price_paise)}</span> },
  { id: 'on_hand', header: 'On hand', align: 'right', cell: (v) => <span className="tabular font-strong text-ink-2">{v.on_hand}</span> },
  { id: 'reorder', header: 'Reorder at', align: 'right', cell: (v) => <span className="tabular">{v.reorder_level}</span> },
  { id: 'stock', header: 'Stock', cell: variantStock },
]

/** Phone layout for variants: one compact row each instead of a sideways-scrolling table. */
function VariantList({ variants }: { variants: Variant[] }) {
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {variants.map((v) => (
        <li key={v.id} className="flex flex-col gap-1.5 px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="font-strong break-words text-ink-2">
              {v.size} / {v.colour}
            </p>
            <span className="type-amount">{formatMoney(v.price_paise)}</span>
          </div>
          <p className="type-helper break-all tabular">
            {v.sku}
            {v.barcode && ` · ${v.barcode}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular type-body font-strong text-ink-2">{unitsLabel(v.on_hand)}</span>
            {variantStock(v)}
            <span className="type-helper">Reorder at {v.reorder_level}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

function Movements({ movements }: { movements: StockMovement[] }) {
  if (movements.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="No stock movements yet"
        description="Opening stock, sales, returns and adjustments will appear here."
      />
    )
  }
  return (
    <ol className="divide-y divide-line-soft border-t border-line-soft">
      {movements.map((m) => (
        <li key={m.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3">
          <div className="min-w-0">
            <p className="type-body font-strong text-ink-2">
              {m.type_label} · {m.variant_label}
            </p>
            <p className="type-helper">
              <time dateTime={m.created_at}>{dateTime.format(new Date(m.created_at))}</time>
              {m.actor_name && ` · ${m.actor_name}`}
              {m.reference && ` · ${m.reference}`}
            </p>
          </div>
          <p className="text-right type-body">
            <span className={m.quantity_delta < 0 ? 'tabular font-strong text-danger' : 'tabular font-strong text-success'}>
              {m.quantity_delta > 0 ? '+' : '−'}
              {Math.abs(m.quantity_delta)}
            </span>
            <span className="block type-helper tabular">Balance {m.balance_after}</span>
          </p>
        </li>
      ))}
    </ol>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="type-helper">{label}</dt>
      <dd className="mt-0.5 type-body font-strong break-words text-ink-2">{children}</dd>
    </div>
  )
}

function Summary({ product }: { product: ProductDetail }) {
  const total = product.variants.filter((v) => v.is_active).reduce((sum, v) => sum + v.on_hand, 0)
  const cost = product.cost_price_paise
  const margin = cost == null ? null : product.base_price_paise - cost
  return (
    <Card>
      <CardBody className="flex flex-col gap-5 pt-5 sm:flex-row sm:px-6 sm:pt-6 sm:pb-6">
        <ProductThumb src={product.image_url} size="lg" />
        <dl className="grid flex-1 grid-cols-2 gap-4 lg:grid-cols-4">
          <Fact label="Category">{product.category.name}</Fact>
          <Fact label="Selling price">{formatMoney(product.base_price_paise)}</Fact>
          <Fact label="Cost and margin">
            {cost == null || margin == null
              ? 'Not recorded'
              : `${formatMoney(cost)} · ${formatMoney(margin)} (${Math.round((margin / product.base_price_paise) * 100)}%)`}
          </Fact>
          <Fact label="Stock on hand">{unitsLabel(total)}</Fact>
          <Fact label="GST">{product.effective_tax_rule.summary}</Fact>
          <Fact label="HSN code">{product.effective_hsn_code || 'Not set'}</Fact>
          {product.description && (
            <div className="col-span-2">
              <dt className="type-helper">Description</dt>
              <dd className="mt-0.5 type-body whitespace-pre-line">{product.description}</dd>
            </div>
          )}
        </dl>
      </CardBody>
    </Card>
  )
}

function StatusAction({ product }: { product: ProductDetail }) {
  const [open, setOpen] = useState(false)
  const setStatus = useSetProductStatus(product.id)
  const { toast } = useToast()
  const deactivating = product.status === 'active'
  return (
    <>
      <Button icon={deactivating ? <Archive /> : <ArchiveRestore />} onClick={() => setOpen(true)}>
        {deactivating ? 'Deactivate' : 'Reactivate'}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={deactivating ? `Deactivate ${product.name}?` : `Reactivate ${product.name}?`}
        description={
          deactivating
            ? 'It will be hidden from billing. Its variants, stock and sales history are kept, and you can reactivate it at any time.'
            : 'It will be available in billing again, with its active variants.'
        }
        confirmLabel={deactivating ? 'Deactivate' : 'Reactivate'}
        pendingLabel={deactivating ? 'Deactivating…' : 'Reactivating…'}
        tone={deactivating ? 'danger' : 'primary'}
        onConfirm={async () => {
          try {
            await setStatus.mutateAsync(deactivating ? 'inactive' : 'active')
          } catch (error) {
            // Show the server's reason (e.g. no active variants) inside the dialog.
            if (error instanceof ApiError) throw new Error(Object.values(error.fields)[0]?.[0] ?? error.message, { cause: error })
            throw error
          }
          toast({ tone: 'success', title: deactivating ? 'Product deactivated' : 'Product reactivated', description: product.name })
        }}
      />
    </>
  )
}

export function ProductDetailPage() {
  const id = parseProductId(useParams().productId)
  const product = useProduct(id)
  const wide = useMediaQuery(MEDIA.abovephone)

  if (id === null || (product.error instanceof ApiError && product.error.status === 404)) return <ProductMissing />
  if (product.error) {
    return (
      <>
        {backLink}
        <Card>
          <ErrorState message={product.error.message} onRetry={() => product.refetch()} retrying={product.isRefetching} />
        </Card>
      </>
    )
  }
  if (!product.data) {
    return (
      <>
        {backLink}
        <Card aria-busy="true" aria-label="Loading product" className="p-6">
          <SkeletonText lines={5} />
        </Card>
      </>
    )
  }

  const p = product.data
  const status = STATUS_LABELS[p.status]
  return (
    <>
      {backLink}
      <PageHeader
        title={p.name}
        description={`SKU ${p.sku} · ${status.label}`}
        actions={
          <>
            <StatusAction product={p} />
            <ButtonLink to="edit" variant="primary" icon={<Pencil />}>
              Edit product
            </ButtonLink>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        {p.status === 'inactive' && (
          <p className="flex items-center gap-2 type-body">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            Hidden from billing until it’s reactivated.
          </p>
        )}
        <Summary product={p} />
        <Card>
          <CardHeader title="Variants" description="Stock changes only through stock movements: opening stock, sales, returns and adjustments." />
          {wide ? (
            <DataTable
              caption={`Variants of ${p.name}`}
              columns={VARIANT_COLUMNS}
              rows={p.variants}
              getRowId={(v) => v.id}
              empty={<EmptyState icon={<PackageX />} title="No variants" />}
              minWidth="760px"
            />
          ) : (
            <VariantList variants={p.variants} />
          )}
        </Card>
        <Card>
          <CardHeader title="Recent stock movements" description="The latest eight changes across all variants." />
          <Movements movements={p.recent_movements} />
        </Card>
      </div>
    </>
  )
}
