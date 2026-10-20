import { useId, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/TextField'
import { cx } from '@/lib/cx'
import { formatMoney, parseRupees } from '@/lib/money'
import type { DiscountKind, Role } from '@/types/domain'

import { parsePercent, type BillDiscount } from '../bill'

interface DiscountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: BillDiscount | null
  /** The server's subtotal, when quoted; shown for reference only. */
  subtotalPaise: number | undefined
  role: Role
  /** Store setting: the most a cashier may discount without approval. */
  limitPct: number | undefined
  onApply: (discount: BillDiscount) => void
}

// Basis points and paise both show as the value ÷ 100 (10% = 1000 bp; ₹150 = 15000 paise).
const toInput = (discount: BillDiscount | null) => (discount ? String(discount.value / 100) : '')

/**
 * A bill discount, as an amount or a percentage of the subtotal. The server shares it across
 * the lines, checks it against the cashier's limit, and asks for approval at payment if needed.
 */
export function DiscountDialog(props: DiscountDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title="Bill discount" description="Applied to the whole bill before GST.">
      {props.open && <DiscountForm {...props} />}
    </Dialog>
  )
}

function DiscountForm({ current, subtotalPaise, role, limitPct, onApply, onOpenChange }: DiscountDialogProps) {
  const [kind, setKind] = useState<DiscountKind>(current?.kind ?? 'percent')
  const [value, setValue] = useState(toInput(current))
  const [error, setError] = useState<string>()
  const kindLabel = useId()

  const apply = () => {
    const parsed = kind === 'percent' ? parsePercent(value) : parseRupees(value)
    if (parsed === null || parsed <= 0) {
      setError(kind === 'percent' ? 'Enter a percentage, such as 10 or 12.5.' : 'Enter an amount in rupees, such as 150.')
      return
    }
    if (kind === 'percent' && parsed > 10_000) {
      setError('A percentage discount can’t be more than 100%.')
      return
    }
    if (kind === 'amount' && subtotalPaise !== undefined && parsed > subtotalPaise) {
      setError(`The discount can’t be more than the subtotal of ${formatMoney(subtotalPaise)}.`)
      return
    }
    onApply({ kind, value: parsed })
  }

  const limitNote =
    role === 'cashier' && limitPct !== undefined
      ? `You can give up to ${limitPct}% yourself. More needs a Senior cashier’s or Admin’s PIN at payment.`
      : 'Your role can approve discounts, so no PIN is needed. Your name is recorded on the sale.'

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      <p id={kindLabel} className="mb-1.5 type-label">
        Discount type
      </p>
      <div role="radiogroup" aria-labelledby={kindLabel} className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            ['percent', 'Percentage (%)'],
            ['amount', 'Amount (₹)'],
          ] as const
        ).map(([option, label]) => (
          <label
            key={option}
            className={cx(
              'focus-ring-within flex h-control cursor-pointer items-center justify-center rounded-control border text-body font-strong transition-control',
              kind === option ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink-3 hover:border-primary-border',
            )}
          >
            <input
              type="radio"
              name="discount-kind"
              value={option}
              checked={kind === option}
              onChange={() => {
                setKind(option)
                setError(undefined)
              }}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>

      <TextField
        label={kind === 'percent' ? 'Discount percentage' : 'Discount amount'}
        inputMode="decimal"
        leading={kind === 'amount' ? '₹' : undefined}
        trailing={kind === 'percent' ? <span className="pr-2.5 text-muted">%</span> : undefined}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setError(undefined)
        }}
        error={error}
        hint={subtotalPaise !== undefined ? `Subtotal ${formatMoney(subtotalPaise)}.` : undefined}
      />
      <p className="mt-3 type-helper">{limitNote}</p>

      <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" variant="primary">
          Apply discount
        </Button>
      </div>
    </form>
  )
}
