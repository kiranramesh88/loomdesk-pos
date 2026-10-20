import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Textarea } from '@/components/ui/Textarea'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/toastContext'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { cx } from '@/lib/cx'
import { ApiError } from '@/lib/http'
import type { AdjustmentKind, InventoryVariant } from '@/types/domain'

import { useAdjustStock } from '../api'
import {
  ADJUSTMENT_KINDS,
  formatDelta,
  parseQuantity,
  resultingQuantity,
  STOCK_LABELS,
  validateAdjustment,
  type AdjustmentErrors,
} from '../labels'
import { WithVariant } from './MobileVariantPage'

const KIND_CHIPS = ADJUSTMENT_KINDS.map((k) => ({ value: k.value, label: k.label }))

function Change({ before, after }: { before: number; after: number }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="tabular text-ink-3">{before}</span>
      <ArrowRight aria-label="becomes" className="size-4 text-muted" />
      <span className={cx('tabular font-bold', after < 0 ? 'text-danger' : 'text-ink')}>{after}</span>
      <span className="type-helper tabular">({formatDelta(after - before)})</span>
    </span>
  )
}

/**
 * Two steps, so nothing changes by accident: enter the adjustment, then review the current and
 * resulting quantity and confirm. The server records one stock movement, refusing it if stock moved
 * since the review (409 `stock_changed`) or would go negative.
 */
function AdjustFlow({ variant }: { variant: InventoryVariant }) {
  const adjust = useAdjustStock()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [kind, setKind] = useState<AdjustmentKind | null>(null)
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<AdjustmentErrors>({})
  const [notice, setNotice] = useState<string>()
  // The figure the admin reviewed; the server checks it hasn't moved.
  const [reviewed, setReviewed] = useState(variant.on_hand)

  const parsed = parseQuantity(quantity)
  const after = kind ? resultingQuantity(kind, variant.on_hand, parsed) : null
  const variantPage = mobilePath(`inventory/${variant.id}`)
  const state = STOCK_LABELS[variant.stock_state]

  const review = () => {
    const found = validateAdjustment(kind, quantity, reason, variant.on_hand)
    setErrors(found)
    setNotice(undefined)
    if (Object.keys(found).length) return
    setReviewed(variant.on_hand)
    setStep('review')
    window.scrollTo({ top: 0 })
  }

  const confirm = () => {
    if (!kind || parsed === null) return
    setNotice(undefined)
    adjust.mutate(
      { variant: variant.id, kind, quantity: parsed, reason: reason.trim(), expected_on_hand: reviewed },
      {
        onSuccess: (result) => {
          toast({ tone: 'success', title: 'Stock updated', description: `${variant.sku}: ${reviewed} → ${result.variant.on_hand}` })
          navigate(variantPage, { replace: true })
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'stock_changed') {
            // The variant refetches; back to the form so the new figure is reviewed again.
            setStep('edit')
            setNotice(`${error.message} Nothing was changed. Check the new figure and review again.`)
          } else if (error instanceof ApiError && Object.keys(error.fields).length) {
            setStep('edit')
            setErrors({ kind: error.fields.kind?.[0], quantity: error.fields.quantity?.[0], reason: error.fields.reason?.[0] })
          } else {
            setNotice(
              error instanceof ApiError && error.status === 0
                ? 'The server couldn’t be reached, so nothing was changed. Check the connection and try again.'
                : error.message,
            )
          }
        },
      },
    )
  }

  const summary = (
    <section aria-label="Item" className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="type-body font-strong break-words text-ink-2">
        {variant.product.name} · {variant.size} / {variant.colour}
      </p>
      <p className="type-helper tabular break-all">{variant.sku}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 type-helper">
        <span>
          On hand <span className="tabular font-strong text-ink-2">{variant.on_hand}</span>
        </span>
        <span>
          Reorder at <span className="tabular">{variant.reorder_level}</span>
        </span>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      </div>
    </section>
  )

  // The review shows the figure it was built on, even if a refetch lands meanwhile; the server checks that figure.
  const reviewedAfter = kind ? resultingQuantity(kind, reviewed, parsed) : null
  if (step === 'review' && kind && reviewedAfter !== null) {
    const option = ADJUSTMENT_KINDS.find((k) => k.value === kind)!
    return (
      <>
        <MobilePageHeader title="Review adjustment" description="Check the change before it’s recorded." back={{ to: variantPage, label: variant.sku }} />
        <div className="grid gap-4">
          {summary}
          <MobilePanel title="The change">
            <MobileFacts>
              <MobileFact label="Adjustment">{option.label}</MobileFact>
              <MobileFact label={option.quantityLabel}>
                <span className="tabular">{parsed}</span>
              </MobileFact>
              <MobileFact label="On hand">
                <Change before={reviewed} after={reviewedAfter} />
              </MobileFact>
              <MobileFact label="Reason">{reason.trim()}</MobileFact>
            </MobileFacts>
          </MobilePanel>
          <p className="type-helper">
            It’s recorded as a stock movement with your name and the time. Movements can’t be edited or deleted; a mistake is
            corrected with another adjustment.
          </p>
          {notice && <InlineAlert tone="danger">{notice}</InlineAlert>}
          <div className="grid gap-2">
            <Button variant="primary" size="lg" loading={adjust.isPending} loadingLabel="Recording…" onClick={confirm}>
              Confirm adjustment
            </Button>
            <Button size="lg" disabled={adjust.isPending} onClick={() => setStep('edit')}>
              Back to edit
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <MobilePageHeader title="Adjust stock" description="Recorded with your name, the time and the reason." back={{ to: variantPage, label: variant.sku }} />
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          review()
        }}
      >
        {summary}
        {notice && <InlineAlert tone="warning">{notice}</InlineAlert>}
        <ChipGroup
          label="Adjustment"
          columns={3}
          options={KIND_CHIPS}
          value={kind ?? ('' as AdjustmentKind)}
          onValueChange={(v) => {
            setKind(v)
            setErrors((e) => ({ ...e, kind: undefined, quantity: undefined }))
          }}
          error={errors.kind}
        />
        <TextField
          label={ADJUSTMENT_KINDS.find((k) => k.value === kind)?.quantityLabel ?? 'Quantity'}
          size="lg"
          inputMode="numeric"
          autoComplete="off"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value)
            setErrors((e) => ({ ...e, quantity: undefined }))
          }}
          error={errors.quantity}
          hint={kind === 'count' ? 'The number of units you counted on the shelf.' : undefined}
        />
        <Textarea
          label="Reason"
          rows={2}
          maxLength={200}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setErrors((e) => ({ ...e, reason: undefined }))
          }}
          error={errors.reason}
          hint="For example: damaged in storage, found during count."
        />
        <div aria-live="polite" className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3">
          <span className="type-helper">Result</span>
          {after !== null ? <Change before={variant.on_hand} after={after} /> : <span className="type-helper">Choose an adjustment and quantity.</span>}
        </div>
        <Button type="submit" variant="primary" size="lg">
          Review adjustment
        </Button>
      </form>
    </>
  )
}

/** `/admin/mobile/inventory/:variantId/adjust`. */
export function MobileAdjustPage() {
  return <WithVariant>{(variant) => <AdjustFlow variant={variant} />}</WithVariant>
}
