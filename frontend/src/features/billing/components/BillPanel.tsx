import { ArrowRight, ImageOff, Percent, ShoppingBag, Trash2 } from 'lucide-react'
import { useState, type Dispatch } from 'react'

import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/money'
import type { QuoteLine } from '@/types/domain'

import { discountLabel, MAX_QUANTITY, unitCount, type BillAction, type BillLine, type BillState } from '../bill'
import { variantLabel } from '../catalogue'
import type { BillQuote } from '../useBillQuote'
import { BillSummary } from './BillSummary'
import { QuantityStepper } from './QuantityStepper'

interface BillPanelProps {
  bill: BillState
  dispatch: Dispatch<BillAction>
  billQuote: BillQuote
  onDiscount: () => void
  onPay: () => void
  /** In the phone sheet the dialog title already says "Current bill"; keep the heading for screen readers only. */
  headingHidden?: boolean
  className?: string
}

/**
 * The current bill (prototype .cart-panel): lines with quantity and remove, then the server's
 * figures and the payment action, which stay at the bottom while the lines scroll.
 */
export function BillPanel({ bill, dispatch, billQuote, onDiscount, onPay, headingHidden, className }: BillPanelProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  const { quote, current, lineErrors, discountError, error } = billQuote
  const units = unitCount(bill)
  const empty = bill.lines.length === 0
  const hasLineErrors = Object.keys(lineErrors).length > 0

  return (
    <section aria-labelledby="bill-heading" className={cx('flex min-h-0 flex-col bg-surface', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="bill-heading" className={cx('type-section', headingHidden && 'sr-only')}>
            Current bill
          </h2>
          <p className="type-caption" aria-live="polite">
            {empty ? 'No items yet' : `${units} ${units === 1 ? 'item' : 'items'} · ${bill.lines.length} ${bill.lines.length === 1 ? 'line' : 'lines'}`}
          </p>
        </div>
        {!empty && (
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setConfirmClear(true)}>
            Clear
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-5">
        {empty ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span aria-hidden className="mb-3 grid size-11 place-items-center rounded-card bg-surface-muted text-muted [&_svg]:size-5">
              <ShoppingBag />
            </span>
            <p className="type-section">The bill is empty</p>
            <p className="mt-1 max-w-[240px] type-helper">Choose a product, or scan a barcode into the search box.</p>
          </div>
        ) : (
          <ul aria-label="Items on the bill" className="divide-y divide-line-soft">
            {bill.lines.map((line) => (
              <BillLineRow
                key={line.variantId}
                line={line}
                quoteLine={billQuote.lineFor(line.variantId)}
                error={lineErrors[line.variantId]}
                dispatch={dispatch}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-4 pt-3.5 pb-4 sm:px-5">
        {!empty && (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              {bill.discount ? (
                <>
                  <span className="min-w-0 truncate type-label">Discount · {discountLabel(bill)}</span>
                  <span className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={onDiscount}>
                      Change
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'setDiscount', discount: null })}>
                      Remove
                    </Button>
                  </span>
                </>
              ) : (
                <Button size="sm" icon={<Percent />} onClick={onDiscount}>
                  Add discount
                </Button>
              )}
            </div>

            {discountError && (
              <InlineAlert tone="danger" className="mb-3">
                {discountError}
              </InlineAlert>
            )}
            {hasLineErrors && (
              <InlineAlert tone="danger" className="mb-3">
                Some items can’t be sold as they are. Fix the highlighted lines to continue.
              </InlineAlert>
            )}
            {error && (
              <InlineAlert tone="danger" className="mb-3">
                {error.message}{' '}
                <button type="button" onClick={billQuote.retry} className="font-strong underline">
                  Try again
                </button>
              </InlineAlert>
            )}
            {quote?.needs_approval && current && (
              <InlineAlert tone="warning" className="mb-3">
                This discount is above your limit. A Senior cashier or Admin approves it with their PIN at payment.
              </InlineAlert>
            )}

            {!error && !hasLineErrors && !discountError && <BillSummary quote={quote} stale={!current} />}
            <p className="sr-only" aria-live="polite">
              {current && quote ? `Total ${formatMoney(quote.total_paise)}` : ''}
            </p>
          </>
        )}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-3.5"
          disabled={!billQuote.canPay}
          onClick={onPay}
        >
          {empty ? 'Add items to take payment' : current && quote ? `Take payment · ${formatMoney(quote.total_paise)}` : 'Updating total…'}
          {!empty && current && <ArrowRight aria-hidden className="size-4" />}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear this bill?"
        description="All items and the discount are removed. Nothing has been charged or saved yet."
        confirmLabel="Clear bill"
        tone="danger"
        onConfirm={() => dispatch({ type: 'clear' })}
      />
    </section>
  )
}

function BillLineRow({
  line,
  quoteLine,
  error,
  dispatch,
}: {
  line: BillLine
  quoteLine: QuoteLine | undefined
  error?: string
  dispatch: Dispatch<BillAction>
}) {
  // The server's price and stock once quoted; the catalogue's copy until then.
  const unitPrice = quoteLine?.unit_price_paise ?? line.unitPricePaise
  const onHand = quoteLine?.on_hand ?? line.onHand
  const label = `${line.name}, ${variantLabel(line)}`
  const errorId = `bill-line-${line.variantId}-error`
  return (
    <li className="py-3">
      <div className="flex gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-control border border-line-soft bg-surface">
          {line.imageUrl ? <img src={line.imageUrl} alt="" className="size-full object-contain p-0.5" /> : <ImageOff className="size-4 text-muted" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-body font-strong text-ink-2">{line.name}</p>
              <p className="truncate type-caption">
                {variantLabel(line)} · {line.variantSku}
              </p>
            </div>
            <IconButton
              label={`Remove ${label}`}
              icon={<Trash2 />}
              onClick={() => dispatch({ type: 'remove', variantId: line.variantId })}
              className="-mt-1 -mr-1.5 hover:text-danger"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <QuantityStepper
              value={line.quantity}
              onChange={(quantity) => dispatch({ type: 'setQuantity', variantId: line.variantId, quantity })}
              max={Math.max(line.quantity, Math.min(MAX_QUANTITY, onHand))}
              itemLabel={label}
              invalid={!!error}
              describedBy={error ? errorId : undefined}
            />
            <p className="text-right">
              <span className="block type-amount">{formatMoney(quoteLine?.subtotal_paise ?? unitPrice * line.quantity)}</span>
              <span className="block type-caption">{formatMoney(unitPrice)} each</span>
            </p>
          </div>
          {error && (
            <p id={errorId} className="mt-1.5 type-helper text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
