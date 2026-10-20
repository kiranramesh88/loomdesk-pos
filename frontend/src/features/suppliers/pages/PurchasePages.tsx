import { Ban, History, PackageCheck, Pencil, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/toastContext'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { Purchase, PurchaseLine, SupplierDetail } from '@/types/domain'

import { useCancelPurchase, usePurchase, useReceivePurchase, useRecordPurchase, useUpdatePurchase } from '../api'
import { PurchaseForm } from '../components/PurchaseForm'
import { formatDay, formatWhen, PURCHASE_STATUS_LABELS, rateLabel, unitsLabel } from '../labels'
import { isPurchaseNumber } from '../supplierParams'
import { BackLink, WithSupplier } from './SupplierFormPages'

const supplierPath = (id: number) => `/admin/suppliers/${id}`

function PurchaseMissing() {
  return (
    <>
      <BackLink to="/admin/suppliers" label="Suppliers" />
      <Card>
        <EmptyState
          icon={<SearchX />}
          title="This purchase doesn’t exist"
          description="Check the purchase number. Purchases are never deleted; cancelled ones stay on the supplier’s profile."
          action={<ButtonLink to="/admin/suppliers">Back to suppliers</ButtonLink>}
        />
      </Card>
    </>
  )
}

/** Loads the purchase in the URL and renders its loading, missing and error states. */
function WithPurchase({ children }: { children: (p: Purchase) => React.ReactNode }) {
  const raw = useParams().purchaseNo
  const number = isPurchaseNumber(raw) ? raw : null
  const purchase = usePurchase(number)
  if (number === null || (purchase.error instanceof ApiError && purchase.error.status === 404)) return <PurchaseMissing />
  if (purchase.error) {
    return (
      <>
        <BackLink to="/admin/suppliers" label="Suppliers" />
        <Card>
          <ErrorState message={purchase.error.message} onRetry={() => void purchase.refetch()} retrying={purchase.isRefetching} />
        </Card>
      </>
    )
  }
  if (!purchase.data) {
    return (
      <>
        <BackLink to="/admin/suppliers" label="Suppliers" />
        <Card aria-busy="true" aria-label="Loading purchase" className="p-6">
          <SkeletonText lines={5} />
        </Card>
      </>
    )
  }
  return <>{children(purchase.data)}</>
}

// --- Record and edit ---

function RecordForm({ supplier }: { supplier: SupplierDetail }) {
  // One key per opened form, so a double submit or a retry records one purchase.
  const [key] = useState(() => crypto.randomUUID())
  const record = useRecordPurchase(supplier.id, key)
  const navigate = useNavigate()
  const { toast } = useToast()
  if (supplier.status !== 'active') {
    return (
      <>
        <BackLink to=".." label={supplier.name} />
        <PageHeader title="Record purchase" description={supplier.name} />
        <InlineAlert tone="warning">This supplier is inactive. Reactivate it on its profile to record purchases.</InlineAlert>
      </>
    )
  }
  return (
    <>
      <BackLink to=".." label={supplier.name} />
      <PageHeader title="Record purchase" description={`From ${supplier.name}. Stock changes only when you receive it.`} />
      <PurchaseForm
        submitLabel="Record purchase"
        pendingLabel="Recording…"
        cancelTo=".."
        onSubmit={async (payload) => {
          const purchase = await record.mutateAsync(payload)
          toast({ tone: 'success', title: `Purchase ${purchase.number} recorded`, description: 'Receive it when the goods arrive.' })
          navigate(`/admin/suppliers/purchases/${purchase.number}`, { replace: true })
        }}
      />
    </>
  )
}

export function PurchaseCreatePage() {
  return <WithSupplier back={() => <BackLink to=".." label="Supplier" />}>{(supplier) => <RecordForm supplier={supplier} />}</WithSupplier>
}

function EditForm({ purchase }: { purchase: Purchase }) {
  const update = useUpdatePurchase(purchase.number)
  const navigate = useNavigate()
  const { toast } = useToast()
  const back = <BackLink to=".." label={purchase.number} />
  if (purchase.status !== 'ordered') {
    return (
      <>
        {back}
        <PageHeader title={`Edit ${purchase.number}`} description={purchase.supplier_name} />
        <InlineAlert tone="warning">
          This purchase is {PURCHASE_STATUS_LABELS[purchase.status].label.toLowerCase()}, so it can’t be edited.
        </InlineAlert>
      </>
    )
  }
  return (
    <>
      {back}
      <PageHeader title={`Edit ${purchase.number}`} description={`From ${purchase.supplier_name}. Change quantities to what actually arrived before receiving.`} />
      <PurchaseForm
        purchase={purchase}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelTo=".."
        onSubmit={async (payload) => {
          await update.mutateAsync(payload)
          toast({ tone: 'success', title: `${purchase.number} saved` })
          navigate('..', { replace: true })
        }}
      />
    </>
  )
}

export function PurchaseEditPage() {
  return <WithPurchase>{(purchase) => <EditForm purchase={purchase} />}</WithPurchase>
}

// --- Detail ---

const LINE_COLUMNS: Column<PurchaseLine>[] = [
  {
    id: 'item',
    header: 'Item',
    cell: (l) => (
      <div className="min-w-0">
        <div className="font-strong break-words text-ink-2">{l.product_name}</div>
        <div className="type-helper">
          {l.size} / {l.colour} · <span className="tabular">{l.variant_sku}</span>
        </div>
      </div>
    ),
  },
  { id: 'qty', header: 'Qty', align: 'right', width: '70px', cell: (l) => <span className="tabular">{l.quantity}</span> },
  { id: 'cost', header: 'Unit cost', align: 'right', width: '120px', cell: (l) => <span className="tabular">{formatMoney(l.unit_cost_paise)}</span> },
  { id: 'rate', header: 'GST', align: 'right', width: '70px', cell: (l) => <span className="tabular">{rateLabel(l.tax_rate_bp)}</span> },
  { id: 'tax', header: 'GST amount', align: 'right', width: '120px', cell: (l) => <span className="tabular">{formatMoney(l.tax_paise)}</span> },
  { id: 'total', header: 'Total', align: 'right', width: '130px', cell: (l) => <span className="type-amount">{formatMoney(l.total_paise)}</span> },
]

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ? `min-w-0 ${className}` : 'min-w-0'}>
      <dt className="type-helper">{label}</dt>
      <dd className="mt-0.5 type-body font-strong break-words text-ink-2">{children}</dd>
    </div>
  )
}

function ReceiveAction({ p }: { p: Purchase }) {
  const [open, setOpen] = useState(false)
  const receive = useReceivePurchase(p.number)
  const { toast } = useToast()
  const units = p.lines.reduce((sum, l) => sum + l.quantity, 0)
  return (
    <>
      <Button variant="primary" icon={<PackageCheck />} onClick={() => setOpen(true)} disabled={!p.supplier_invoice_no}>
        Receive goods
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Receive ${p.number}?`}
        description={`This adds ${unitsLabel(units)} to stock across ${p.lines.length} ${p.lines.length === 1 ? 'item' : 'items'}, and ${formatMoney(p.total_paise)} to what the records say is owed to ${p.supplier_name}. It can’t be undone here; later corrections are stock adjustments.`}
        confirmLabel="Receive goods"
        pendingLabel="Receiving…"
        onConfirm={async () => {
          try {
            await receive.mutateAsync()
          } catch (error) {
            // Another tab or a double click already received it: nothing was added twice.
            if (error instanceof ApiError && error.code === 'already_received') {
              toast({ tone: 'info', title: `${p.number} was already received`, description: 'Stock was not added again.' })
              return
            }
            throw error
          }
          toast({ tone: 'success', title: `${p.number} received`, description: `${unitsLabel(units)} added to stock.` })
        }}
      />
    </>
  )
}

function CancelAction({ p }: { p: Purchase }) {
  const [open, setOpen] = useState(false)
  const cancel = useCancelPurchase(p.number)
  const { toast } = useToast()
  return (
    <>
      <Button icon={<Ban />} onClick={() => setOpen(true)}>
        Cancel purchase
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cancel ${p.number}?`}
        description="Use this when the goods won’t arrive or it was entered by mistake. Stock isn’t changed, and the purchase stays on record as cancelled."
        confirmLabel="Cancel purchase"
        pendingLabel="Cancelling…"
        tone="danger"
        reasonLabel="Reason"
        onConfirm={async (reason) => {
          await cancel.mutateAsync(reason)
          toast({ tone: 'success', title: `${p.number} cancelled` })
        }}
      />
    </>
  )
}

function Detail({ p }: { p: Purchase }) {
  const wide = useMediaQuery(MEDIA.split)
  const status = PURCHASE_STATUS_LABELS[p.status]
  const units = p.lines.reduce((sum, l) => sum + l.quantity, 0)
  return (
    <>
      <BackLink to={supplierPath(p.supplier)} label={p.supplier_name} />
      <PageHeader
        title={p.number}
        description={`From ${p.supplier_name} · ${status.label}`}
        actions={
          p.status === 'ordered' && (
            <>
              <CancelAction p={p} />
              <ButtonLink to="edit" icon={<Pencil />}>
                Edit
              </ButtonLink>
              <ReceiveAction p={p} />
            </>
          )
        }
      />
      <div className="flex flex-col gap-5">
        {p.status === 'ordered' && (
          <InlineAlert tone={p.supplier_invoice_no ? 'info' : 'warning'}>
            {p.supplier_invoice_no
              ? 'Awaiting goods. Stock hasn’t changed yet. If fewer items arrived, edit the quantities before receiving.'
              : 'Add the supplier’s invoice number (Edit) before receiving the goods.'}
          </InlineAlert>
        )}
        {p.status === 'received' && (
          <p className="flex flex-wrap items-center gap-2 type-body">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {unitsLabel(units)} added to stock.
            <Link to={`/admin/inventory/movements?q=${p.number}`} className="inline-flex items-center gap-1 font-strong text-primary hover:underline">
              <History aria-hidden className="size-3.5" />
              See the stock movements
            </Link>
          </p>
        )}
        {p.status === 'cancelled' && (
          <InlineAlert tone="warning">
            Cancelled{p.cancelled_by_name && ` by ${p.cancelled_by_name}`}
            {p.cancelled_at && `, ${formatWhen(p.cancelled_at)}`}: {p.cancel_reason}. Stock wasn’t changed.
          </InlineAlert>
        )}
        <Card aria-label="Purchase details">
          <CardBody className="pt-5 sm:px-6 sm:pt-6 sm:pb-6">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Supplier">
                <Link to={supplierPath(p.supplier)} className="hover:text-primary hover:underline">
                  {p.supplier_name}
                </Link>
              </Fact>
              <Fact label="Supplier invoice">{p.supplier_invoice_no || 'Not entered yet'}</Fact>
              <Fact label="Invoice date">{formatDay(p.purchase_date)}</Fact>
              <Fact label="Status">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </Fact>
              <Fact label="Recorded">
                {formatWhen(p.created_at)}
                {p.created_by_name && ` · ${p.created_by_name}`}
              </Fact>
              {p.received_at && (
                <Fact label="Received">
                  {formatWhen(p.received_at)}
                  {p.received_by_name && ` · ${p.received_by_name}`}
                </Fact>
              )}
              {p.notes && (
                <Fact label="Notes" className="sm:col-span-2">
                  <span className="whitespace-pre-line">{p.notes}</span>
                </Fact>
              )}
            </dl>
          </CardBody>
        </Card>
        <Card aria-label="Items">
          <CardHeader title="Items" description="Names and SKUs as they were when the purchase was recorded." />
          {wide ? (
            <DataTable caption={`Items on ${p.number}`} columns={LINE_COLUMNS} rows={p.lines} getRowId={(l) => l.id} minWidth="680px" empty={<EmptyState icon={<SearchX />} title="No items" />} />
          ) : (
            <ul className="divide-y divide-line-soft border-t border-line-soft">
              {p.lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="type-body font-strong break-words text-ink-2">{l.product_name}</p>
                    <p className="type-helper">
                      {l.size} / {l.colour} · <span className="tabular">{l.variant_sku}</span>
                    </p>
                    <p className="type-helper tabular">
                      {l.quantity} × {formatMoney(l.unit_cost_paise)} + GST {rateLabel(l.tax_rate_bp)} ({formatMoney(l.tax_paise)})
                    </p>
                  </div>
                  <span className="shrink-0 type-amount">{formatMoney(l.total_paise)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line-soft px-4 py-4 sm:px-5">
            <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 type-body">
              <dt className="type-helper">Subtotal</dt>
              <dd className="tabular text-right">{formatMoney(p.subtotal_paise)}</dd>
              <dt className="type-helper">GST</dt>
              <dd className="tabular text-right">{formatMoney(p.tax_paise)}</dd>
              <dt className="font-strong text-ink-2">Total</dt>
              <dd className="type-amount text-right">{formatMoney(p.total_paise)}</dd>
            </dl>
          </div>
        </Card>
      </div>
    </>
  )
}

export function PurchaseDetailPage() {
  return <WithPurchase>{(purchase) => <Detail p={purchase} />}</WithPurchase>
}
