import { ArrowRight, ClipboardList, History, Monitor, PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/toastContext'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import type { Purchase } from '@/types/domain'

import { usePurchase, useReceivePurchase } from '../api'
import { formatDay, formatWhen, PURCHASE_STATUS_LABELS, rateLabel, unitsLabel } from '../labels'
import { isPurchaseNumber } from '../supplierParams'

const back = { to: mobilePath('purchases'), label: 'Purchases' }

function StockChange({ before, add }: { before: number; add: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular">
      <span className="text-ink-3">{before}</span>
      <ArrowRight aria-label="becomes" className="size-3.5 text-muted" />
      <span className="font-bold text-ink">{before + add}</span>
    </span>
  )
}

/**
 * Receive the goods: one confirmation that says exactly what changes. The server adds every line in one
 * transaction, once; a second tap or another device gets `already_received` and nothing is added again.
 */
function ReceiveAction({ p }: { p: Purchase }) {
  const [open, setOpen] = useState(false)
  const receive = useReceivePurchase(p.number)
  const { toast } = useToast()
  const units = p.lines.reduce((sum, l) => sum + l.quantity, 0)
  return (
    <>
      <Button variant="primary" size="lg" icon={<PackageCheck />} onClick={() => setOpen(true)} disabled={!p.supplier_invoice_no || receive.isPending}>
        Receive goods
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Receive ${p.number}?`}
        description={
          <div className="grid gap-3">
            <p>
              Adds {unitsLabel(units)} to stock and {formatMoney(p.total_paise)} to what the records say is owed to {p.supplier_name}.
              It can’t be undone here; later corrections are stock adjustments.
            </p>
            <ul aria-label="Stock after receiving" className="divide-y divide-line-soft rounded-control border border-line">
              {p.lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-strong break-words text-ink-2">
                      {l.product_name} · {l.size} / {l.colour}
                    </span>
                    <span className="block type-helper tabular">
                      {l.variant_sku} · +{l.quantity}
                    </span>
                  </span>
                  <StockChange before={l.current_on_hand} add={l.quantity} />
                </li>
              ))}
            </ul>
            <p className="type-helper">Stock figures are as of now; if a sale happens meanwhile, the received units are still added once.</p>
          </div>
        }
        confirmLabel="Receive goods"
        pendingLabel="Receiving…"
        onConfirm={async () => {
          try {
            await receive.mutateAsync()
          } catch (error) {
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

function PurchaseDetail({ p }: { p: Purchase }) {
  const status = PURCHASE_STATUS_LABELS[p.status]
  const units = p.lines.reduce((sum, l) => sum + l.quantity, 0)
  const ordered = p.status === 'ordered'
  return (
    <>
      <MobilePageHeader
        title={p.number}
        description={`${p.supplier_name} · ${unitsLabel(units)} · ${formatMoney(p.total_paise)}`}
        back={back}
        actions={ordered ? <ReceiveAction p={p} /> : undefined}
      />
      <div className="grid gap-4">
        {ordered &&
          (p.supplier_invoice_no ? (
            <InlineAlert tone="info">Awaiting goods: stock hasn’t changed. If fewer items arrived, correct the quantities in the full admin before receiving.</InlineAlert>
          ) : (
            <InlineAlert tone="warning">The supplier’s invoice number is needed before receiving. Add it in the full admin.</InlineAlert>
          ))}
        {p.status === 'received' && (
          <div className="flex flex-wrap items-center gap-2 type-body">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {unitsLabel(units)} added to stock.
            <Link
              to={mobilePath(`inventory/movements?q=${p.number}`)}
              className="inline-flex min-h-11 items-center gap-1 font-strong text-primary hover:underline"
            >
              <History aria-hidden className="size-4" />
              Stock movements
            </Link>
          </div>
        )}
        {p.status === 'cancelled' && (
          <InlineAlert tone="warning">
            Cancelled{p.cancelled_by_name && ` by ${p.cancelled_by_name}`}
            {p.cancelled_at && `, ${formatWhen(p.cancelled_at)}`}: {p.cancel_reason}. Stock wasn’t changed.
          </InlineAlert>
        )}
        <MobilePanel title="Purchase">
          <MobileFacts>
            <MobileFact label="Status">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </MobileFact>
            <MobileFact label="Supplier">
              <Link to={mobilePath(`suppliers/${p.supplier}`)} className="font-strong text-primary hover:underline">
                {p.supplier_name}
              </Link>
            </MobileFact>
            <MobileFact label="Supplier invoice">
              <span className="tabular break-all">{p.supplier_invoice_no || 'Not entered yet'}</span>
            </MobileFact>
            <MobileFact label="Invoice date">{formatDay(p.purchase_date)}</MobileFact>
            <MobileFact label="Recorded">
              {formatWhen(p.created_at)}
              {p.created_by_name && ` · ${p.created_by_name}`}
            </MobileFact>
            {p.received_at && (
              <MobileFact label="Received">
                {formatWhen(p.received_at)}
                {p.received_by_name && ` · ${p.received_by_name}`}
              </MobileFact>
            )}
            {p.notes && (
              <MobileFact label="Notes">
                <span className="whitespace-pre-line">{p.notes}</span>
              </MobileFact>
            )}
          </MobileFacts>
        </MobilePanel>
        <MobilePanel title="Items" description="Names and SKUs as recorded on the purchase.">
          <ul aria-label="Purchase items" className="divide-y divide-line-soft border-t border-line-soft">
            {p.lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="type-body font-strong break-words text-ink-2">{l.product_name}</p>
                  <p className="type-helper">
                    {l.size} / {l.colour} · <span className="tabular break-all">{l.variant_sku}</span>
                  </p>
                  <p className="type-helper tabular">
                    {l.quantity} × {formatMoney(l.unit_cost_paise)} + GST {rateLabel(l.tax_rate_bp)} ({formatMoney(l.tax_paise)})
                  </p>
                  {ordered && (
                    <p className="type-caption">
                      Stock now {l.current_on_hand}, {l.current_on_hand + l.quantity} after receiving
                    </p>
                  )}
                </div>
                <span className="shrink-0 type-amount">{formatMoney(l.total_paise)}</span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 border-t border-line-soft px-4 py-3.5 type-body">
            <dt className="type-helper">Subtotal</dt>
            <dd className="text-right tabular">{formatMoney(p.subtotal_paise)}</dd>
            <dt className="type-helper">GST</dt>
            <dd className="text-right tabular">{formatMoney(p.tax_paise)}</dd>
            <dt className="font-strong text-ink-2">Total</dt>
            <dd className="type-amount text-right">{formatMoney(p.total_paise)}</dd>
          </dl>
        </MobilePanel>
        {ordered && (
          <ButtonLink to={`/admin/suppliers/purchases/${p.number}`} size="lg" icon={<Monitor />}>
            Edit or cancel in the full admin
          </ButtonLink>
        )}
      </div>
    </>
  )
}

/** `/admin/mobile/purchases/:purchaseNo`: a purchase's lines, status and, while awaiting goods, receiving. */
export function MobilePurchasePage() {
  const raw = useParams().purchaseNo
  const number = isPurchaseNumber(raw) ? raw : null
  const purchase = usePurchase(number)
  if (number === null || (purchase.error instanceof ApiError && purchase.error.status === 404)) {
    return (
      <>
        <MobilePageHeader title="Purchase not found" back={back} />
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title="No purchase with that number"
            description="Purchases are never deleted; search the purchases list."
            action={<ButtonLink to={back.to}>Back to purchases</ButtonLink>}
          />
        </Card>
      </>
    )
  }
  if (purchase.isError) {
    return (
      <>
        <MobilePageHeader title={number} back={back} />
        <Card>
          <ErrorState message={purchase.error.message} onRetry={() => void purchase.refetch()} retrying={purchase.isRefetching} />
        </Card>
      </>
    )
  }
  if (!purchase.data) {
    return (
      <>
        <MobilePageHeader title={number} back={back} />
        <Card role="status" aria-label="Loading purchase" className="p-4">
          <SkeletonText lines={5} />
        </Card>
      </>
    )
  }
  return <PurchaseDetail p={purchase.data} />
}
