import { Check, ImageOff } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/money'
import type { SellableProduct, SellableVariant } from '@/types/domain'

import { MAX_QUANTITY } from '../bill'
import { stockSummary, variantLabel } from '../catalogue'
import { QuantityStepper } from './QuantityStepper'

interface VariantDialogProps {
  product: SellableProduct | null
  /** Units of each variant already on the bill, so the picker offers only what's left. */
  inBill: (variantId: number) => number
  onClose: () => void
  onAdd: (product: SellableProduct, variant: SellableVariant, quantity: number) => void
}

/**
 * Pick the exact size and colour (plan §7: the picker shows stock for each option). Nothing is
 * preselected, so a multi-variant product can't go on the bill as the wrong variant.
 */
export function VariantDialog({ product, inBill, onClose, onAdd }: VariantDialogProps) {
  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Choose an option"
      description={product ? `${product.name} · ${product.sku}` : undefined}
    >
      {product && <VariantPicker key={product.id} product={product} inBill={inBill} onAdd={onAdd} onCancel={onClose} />}
    </Dialog>
  )
}

function VariantPicker({
  product,
  inBill,
  onAdd,
  onCancel,
}: {
  product: SellableProduct
  inBill: (variantId: number) => number
  onAdd: VariantDialogProps['onAdd']
  onCancel: () => void
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState<string>()
  const groupLabel = useId()
  const errorId = useId()

  const remaining = (variant: SellableVariant) => Math.max(0, variant.on_hand - inBill(variant.id))
  const selected = product.variants.find((variant) => variant.id === selectedId) ?? null
  const max = selected ? Math.min(MAX_QUANTITY, remaining(selected)) : 1

  const choose = (variant: SellableVariant) => {
    setSelectedId(variant.id)
    setQuantity((q) => Math.min(q, Math.max(1, remaining(variant))))
    setError(undefined)
  }

  const add = () => {
    if (!selected) {
      setError('Choose a size and colour first.')
      return
    }
    onAdd(product, selected, Math.min(quantity, max))
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        add()
      }}
    >
      <div className="mb-4 flex items-center gap-3">
        <span aria-hidden className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-control border border-line-soft bg-surface">
          {product.image_url ? (
            <img src={product.image_url} alt="" className="size-full object-contain p-1" />
          ) : (
            <ImageOff className="size-5 text-muted" />
          )}
        </span>
        <div className="min-w-0">
          <p className="type-section">{product.name}</p>
          <p className="type-helper">
            {product.category.name} · GST {product.tax_rule.summary}
          </p>
        </div>
      </div>

      <p id={groupLabel} className="mb-2 type-label">
        Size and colour
      </p>
      <div
        role="radiogroup"
        aria-labelledby={groupLabel}
        aria-describedby={error ? errorId : undefined}
        className="grid gap-2 sm:grid-cols-2"
      >
        {product.variants.map((variant) => {
          const left = remaining(variant)
          const stock = stockSummary(left, left === 0 ? 'out_of_stock' : variant.stock_state)
          const checked = variant.id === selectedId
          return (
            <label
              key={variant.id}
              className={cx(
                'focus-ring-within flex min-w-0 items-start gap-2.5 rounded-control border px-3 py-2.5 transition-control',
                checked ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface',
                left === 0 ? 'cursor-not-allowed bg-surface-muted' : 'cursor-pointer hover:border-primary-border',
              )}
            >
              <input
                type="radio"
                name={groupLabel}
                value={variant.id}
                checked={checked}
                disabled={left === 0}
                onChange={() => choose(variant)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cx(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border [&_svg]:size-3',
                  checked ? 'border-primary bg-primary text-white' : 'border-control-border bg-surface',
                )}
              >
                {checked && <Check strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-body font-strong', left === 0 ? 'text-ink-disabled' : 'text-ink-2')}>
                  {variantLabel(variant)}
                </span>
                <span className="block truncate type-caption">{variant.sku}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block tabular text-small font-strong text-ink-2">{formatMoney(variant.price_paise)}</span>
                <span className={cx('block text-caption font-strong', stock.textClass)}>
                  {left < variant.on_hand && left > 0 ? `${left} more available` : stock.label}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 type-helper text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-line-soft pt-4">
        <div>
          <p className="mb-1.5 type-label">Quantity</p>
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            max={max}
            itemLabel={selected ? `${product.name}, ${variantLabel(selected)}` : product.name}
            size="md"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary">
            {selected ? `Add · ${formatMoney(selected.price_paise * quantity)}` : 'Add to bill'}
          </Button>
        </div>
      </div>
    </form>
  )
}
