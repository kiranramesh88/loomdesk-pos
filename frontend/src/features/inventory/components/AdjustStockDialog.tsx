import { ArrowRight } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Textarea } from '@/components/ui/Textarea'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/toastContext'
import { cx } from '@/lib/cx'
import { ApiError } from '@/lib/http'
import type { AdjustmentKind, InventoryVariant } from '@/types/domain'

import { useAdjustStock, useInventoryVariant } from '../api'
import {
  ADJUSTMENT_KINDS,
  formatDelta,
  parseQuantity,
  resultingQuantity,
  STOCK_LABELS,
  validateAdjustment,
  variantName,
  type AdjustmentErrors,
} from '../labels'

interface AdjustStockDialogProps {
  /** The row the adjustment was opened from; null when closed. */
  variant: InventoryVariant | null
  onClose: () => void
}

/**
 * Add, remove or set a counted quantity for one variant. The server records it as a single stock
 * movement with the reason, the signed-in admin and the time.
 */
export function AdjustStockDialog({ variant, onClose }: AdjustStockDialogProps) {
  return (
    <Dialog
      open={variant !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Adjust stock"
      description="Recorded as a stock movement with your name, the time and the reason."
    >
      {variant && <AdjustForm key={variant.id} row={variant} onClose={onClose} />}
    </Dialog>
  )
}

function AdjustForm({ row, onClose }: { row: InventoryVariant; onClose: () => void }) {
  // The live figure: after a 409 the inventory queries refetch and the preview follows.
  const live = useInventoryVariant(String(row.id))
  const variant = live.data ?? row
  const adjust = useAdjustStock()
  const { toast } = useToast()
  const [kind, setKind] = useState<AdjustmentKind | null>(null)
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<AdjustmentErrors>({})
  const [serverError, setServerError] = useState<string>()
  const kindLabel = useId()

  const parsed = parseQuantity(quantity)
  const after = kind ? resultingQuantity(kind, variant.on_hand, parsed) : null
  const option = ADJUSTMENT_KINDS.find((k) => k.value === kind)

  const submit = () => {
    const found = validateAdjustment(kind, quantity, reason, variant.on_hand)
    setErrors(found)
    setServerError(undefined)
    if (Object.keys(found).length || !kind || parsed === null) return
    const before = variant.on_hand
    adjust.mutate(
      { variant: variant.id, kind, quantity: parsed, reason: reason.trim(), expected_on_hand: before },
      {
        onSuccess: (result) => {
          toast({
            tone: 'success',
            title: 'Stock updated',
            description: `${variantName(variant)}: ${before} → ${result.variant.on_hand}`,
          })
          onClose()
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'stock_changed') {
            setServerError(error.message)
          } else if (error instanceof ApiError && Object.keys(error.fields).length) {
            setErrors({ kind: error.fields.kind?.[0], quantity: error.fields.quantity?.[0], reason: error.fields.reason?.[0] })
          } else {
            setServerError(
              error instanceof ApiError && error.status === 0
                ? 'The server couldn’t be reached, so nothing was changed. Check the connection and try again.'
                : error.message,
            )
          }
        },
      },
    )
  }

  const state = STOCK_LABELS[variant.stock_state]
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="mb-4 rounded-control border border-line bg-surface-muted px-3.5 py-3">
        <p className="type-body font-strong text-ink-2">{variantName(variant)}</p>
        <p className="type-helper tabular">{variant.sku}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 type-helper">
          <span>
            On hand <span className="tabular font-strong text-ink-2">{variant.on_hand}</span>
          </span>
          <span>
            Reorder at <span className="tabular">{variant.reorder_level}</span>
          </span>
          <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        </div>
      </div>

      <p id={kindLabel} className="mb-1.5 type-label">
        Adjustment
      </p>
      <div role="radiogroup" aria-labelledby={kindLabel} aria-describedby={errors.kind ? `${kindLabel}-error` : undefined} className="grid grid-cols-3 gap-2">
        {ADJUSTMENT_KINDS.map((k) => (
          <label
            key={k.value}
            className={cx(
              'focus-ring-within flex h-control cursor-pointer items-center justify-center rounded-control border px-2 text-center type-body font-strong transition-control',
              kind === k.value ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink-3 hover:border-primary-border',
            )}
          >
            <input
              type="radio"
              name="adjust-kind"
              value={k.value}
              checked={kind === k.value}
              onChange={() => {
                setKind(k.value)
                setErrors((e) => ({ ...e, kind: undefined, quantity: undefined }))
              }}
              className="sr-only"
            />
            {k.label}
          </label>
        ))}
      </div>
      {errors.kind && (
        <p id={`${kindLabel}-error`} className="mt-1.5 type-helper text-danger">
          {errors.kind}
        </p>
      )}

      <div className="mt-4 grid gap-4">
        <TextField
          label={option?.quantityLabel ?? 'Quantity'}
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
          hint="For example: damaged in storage, found during count, supplier sent extra."
        />
      </div>

      <div aria-live="polite" className="mt-4 flex items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3">
        <span className="type-helper">Result</span>
        {after !== null ? (
          <span className="flex items-center gap-2 type-body">
            <span className="tabular text-ink-3">{variant.on_hand}</span>
            <ArrowRight aria-label="becomes" className="size-4 text-muted" />
            <span className={cx('tabular font-bold', after < 0 ? 'text-danger' : 'text-ink')}>{after}</span>
            <span className="tabular type-helper">({formatDelta(after - variant.on_hand)})</span>
          </span>
        ) : (
          <span className="type-helper">Choose an adjustment and quantity to preview.</span>
        )}
      </div>

      {serverError && (
        <InlineAlert tone="danger" className="mt-4">
          {serverError}
        </InlineAlert>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
        <Button onClick={onClose} disabled={adjust.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={adjust.isPending}>
          Confirm adjustment
        </Button>
      </div>
    </form>
  )
}
