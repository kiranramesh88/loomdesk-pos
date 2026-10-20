import { Banknote, Check, CreditCard, Smartphone } from 'lucide-react'
import { useEffect, useState, type Dispatch } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Select } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import { cx } from '@/lib/cx'
import { ApiError } from '@/lib/http'
import { formatMoney, parseRupees } from '@/lib/money'
import type { CheckoutRequest, PaymentMethod, Quote, Sale } from '@/types/domain'

import { useApprovers, useCheckout } from '../api'
import type { BillAction, BillState } from '../bill'
import { newCheckoutKey } from '../checkoutKey'
import { quickAmounts } from '../payment'
import { BillSummary } from './BillSummary'

const METHODS: { value: PaymentMethod; label: string; hint: string; icon: typeof Banknote }[] = [
  { value: 'cash', label: 'Cash', hint: 'Count the cash received', icon: Banknote },
  { value: 'upi', label: 'UPI', hint: 'Check the UPI app first', icon: Smartphone },
  { value: 'card', label: 'Card', hint: 'Check the terminal slip', icon: CreditCard },
]

const REFERENCE_LABELS: Record<Exclude<PaymentMethod, 'cash'>, string> = {
  upi: 'UPI transaction ID',
  card: 'Card approval code',
}

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill: BillState
  dispatch: Dispatch<BillAction>
  /** The server's quote for this exact bill; payment can't start without one. */
  quote: Quote | undefined
  /** False while the quote is being refreshed (for example after the total changed). */
  quoteCurrent: boolean
  onCompleted: (sale: Sale) => void
}

/**
 * Take payment (plan §7, spec §5.9). Shows the server's total to confirm, records how it was
 * paid, and completes the sale once. There is no payment gateway: UPI and card payments are
 * checked by the cashier on the app or terminal and recorded as not gateway-verified.
 */
export function PaymentDialog(props: PaymentDialogProps) {
  const checkout = useCheckout()
  const pending = checkout.isPending
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) checkout.reset()
        props.onOpenChange(open)
      }}
      title="Take payment"
      description="Confirm the total and how the customer paid."
      dismissible={!pending}
    >
      {props.open && <PaymentForm {...props} checkout={checkout} />}
    </Dialog>
  )
}

function PaymentForm({
  bill,
  dispatch,
  quote,
  quoteCurrent,
  onCompleted,
  onOpenChange,
  checkout,
}: PaymentDialogProps & { checkout: ReturnType<typeof useCheckout> }) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [tendered, setTendered] = useState('')
  const [reference, setReference] = useState('')
  const [approverId, setApproverId] = useState<string>()
  const [pin, setPin] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const needsApproval = !!quote?.needs_approval
  const approvers = useApprovers(needsApproval)

  // One key per bill: made the first time payment opens, kept across retries and refreshes
  // until the bill changes or the sale completes (see BillState.checkoutKey).
  useEffect(() => {
    if (!bill.checkoutKey) dispatch({ type: 'startCheckout', key: newCheckoutKey() })
  }, [bill.checkoutKey, dispatch])

  const total = quote?.total_paise ?? 0
  const tenderedPaise = parseRupees(tendered)
  const change = tenderedPaise !== null && tenderedPaise >= total ? tenderedPaise - total : null
  const error = checkout.error instanceof ApiError ? checkout.error : null

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {}
    if (method === 'cash') {
      if (tenderedPaise === null) errors.tendered = 'Enter the cash received, such as 2000.'
      else if (tenderedPaise < total) errors.tendered = `That’s ${formatMoney(total - tenderedPaise)} short of the total.`
    } else if (!reference.trim()) {
      errors.reference = `Enter the ${REFERENCE_LABELS[method]} shown on the confirmation.`
    }
    if (needsApproval) {
      if (!approverId) errors.approver = 'Choose who is approving the discount.'
      if (!/^\d{4,6}$/.test(pin)) errors.pin = 'Enter the approver’s 4–6 digit PIN.'
    }
    return errors
  }

  const submit = () => {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length || !quote || !bill.checkoutKey) return
    const body: CheckoutRequest = {
      lines: bill.lines.map((line) => ({ variant: line.variantId, quantity: line.quantity })),
      discount: bill.discount,
      expected_total_paise: quote.total_paise,
      payment:
        method === 'cash'
          ? { method, tendered_paise: tenderedPaise }
          : { method, reference: reference.trim() },
      ...(needsApproval ? { approver_id: Number(approverId), approval_pin: pin } : {}),
    }
    checkout.mutate(
      { body, idempotencyKey: bill.checkoutKey },
      {
        onSuccess: onCompleted,
        onError: (failure) => {
          if (!(failure instanceof ApiError)) return
          // Field paths from the server, mapped onto this form's fields.
          const mapped: Record<string, string> = {}
          for (const [path, messages] of Object.entries(failure.fields)) {
            const field = {
              'payment.tendered_paise': 'tendered',
              'payment.reference': 'reference',
              approval_pin: 'pin',
              approver_id: 'approver',
            }[path]
            if (field && messages[0]) mapped[field] = messages[0]
          }
          setFieldErrors(mapped)
          if (mapped.pin) setPin('')
        },
      },
    )
  }

  const pending = checkout.isPending
  const linesChanged = !!error && Object.keys(error.fields).some((path) => path.startsWith('lines') || path.startsWith('discount'))
  const mappedFields = new Set(['payment.tendered_paise', 'payment.reference', 'approval_pin', 'approver_id'])
  const unexplained = !!error && !linesChanged && !Object.keys(error.fields).some((path) => mappedFields.has(path))

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="rounded-card border border-line bg-surface-tint px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-label">Total to collect</span>
          <span className="type-figure" aria-live="polite">
            {quote ? formatMoney(total) : '—'}
          </span>
        </div>
        <details className="mt-1.5">
          <summary className="cursor-pointer type-helper">How this total is made up</summary>
          <BillSummary quote={quote} stale={!quoteCurrent} className="mt-2.5" />
        </details>
      </div>

      {error?.code === 'total_changed' && (
        <InlineAlert tone="warning" title="The total changed" className="mt-3">
          {error.message} Nothing was charged or saved.
        </InlineAlert>
      )}
      {error?.code === 'idempotency_key_reused' && (
        <InlineAlert tone="warning" title="This bill was already completed" className="mt-3">
          {error.message}
        </InlineAlert>
      )}
      {linesChanged && (
        <InlineAlert tone="danger" title="Some items changed" className="mt-3">
          Go back to the bill to see what changed. Nothing was charged or saved.
        </InlineAlert>
      )}
      {unexplained && error.code !== 'total_changed' && error.code !== 'idempotency_key_reused' && (
        <InlineAlert tone="danger" title="The sale wasn’t confirmed" className="mt-3">
          {error.status === 0 || error.status >= 500
            ? `${error.message} Press Complete sale again: this bill can only be recorded once, so retrying is safe.`
            : error.message}
        </InlineAlert>
      )}

      <fieldset className="mt-4">
        <legend className="mb-1.5 type-label">Payment method</legend>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map(({ value, label, hint, icon: Icon }) => (
            <label
              key={value}
              className={cx(
                'focus-ring-within relative flex cursor-pointer flex-col items-center gap-1 rounded-control border px-2 py-3 text-center transition-control',
                method === value ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink-3 hover:border-primary-border',
              )}
            >
              <input
                type="radio"
                name="payment-method"
                value={value}
                checked={method === value}
                disabled={pending}
                onChange={() => {
                  setMethod(value)
                  setFieldErrors({})
                }}
                className="sr-only"
              />
              {method === value && <Check aria-hidden className="absolute top-1.5 right-1.5 size-3.5" />}
              <Icon aria-hidden className="size-5" />
              <span className="text-body font-strong">{label}</span>
              <span className="hidden type-caption sm:block">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        {method === 'cash' ? (
          <>
            <TextField
              label="Cash received"
              inputMode="decimal"
              leading="₹"
              autoComplete="off"
              value={tendered}
              disabled={pending}
              onChange={(event) => setTendered(event.target.value)}
              error={fieldErrors.tendered}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickAmounts(total).map((amount) => (
                <Button key={amount} size="sm" disabled={pending || !quote} onClick={() => setTendered(String(amount / 100))}>
                  {amount === total ? 'Exact amount' : formatMoney(amount, { wholeRupees: true })}
                </Button>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between rounded-control bg-surface-muted px-3.5 py-2.5">
              <span className="type-label">Change to give</span>
              <span className="tabular text-price font-bold text-ink" aria-live="polite">
                {change === null ? '—' : formatMoney(change)}
              </span>
            </div>
          </>
        ) : (
          <>
            <TextField
              label={REFERENCE_LABELS[method]}
              autoComplete="off"
              maxLength={40}
              value={reference}
              disabled={pending}
              onChange={(event) => setReference(event.target.value)}
              error={fieldErrors.reference}
              hint="As shown on the customer’s app or the terminal slip."
            />
            <InlineAlert className="mt-3">
              LoomDesk isn’t connected to a bank, UPI app or card terminal. Confirm the payment succeeded there first. This
              sale records it as <strong className="font-strong">entered by the cashier, not gateway-verified</strong>.
            </InlineAlert>
          </>
        )}
      </div>

      {needsApproval && (
        <fieldset className="mt-4 rounded-card border border-line px-4 pt-3 pb-4">
          <legend className="px-1 type-label">Discount approval</legend>
          <p className="mb-3 type-helper">
            The discount of {quote && formatMoney(quote.discount_paise)} is above your limit. A Senior cashier or Admin enters
            their PIN to approve it.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Approved by"
              placeholder={approvers.isPending ? 'Loading…' : 'Choose approver'}
              options={(approvers.data ?? []).map((approver) => ({ value: String(approver.id), label: approver.full_name }))}
              value={approverId}
              onValueChange={setApproverId}
              disabled={pending || !approvers.data}
              error={fieldErrors.approver ?? (approvers.isError ? 'Couldn’t load approvers. Close and try again.' : undefined)}
            />
            <TextField
              label="Approver’s PIN"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              disabled={pending}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              error={fieldErrors.pin}
            />
          </div>
        </fieldset>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
        <Button disabled={pending} onClick={() => onOpenChange(false)}>
          Back to bill
        </Button>
        <Button
          type="submit"
          variant="primary"
          icon={<Check />}
          loading={pending}
          loadingLabel="Completing sale…"
          disabled={!quote || !quoteCurrent || !bill.checkoutKey || error?.code === 'idempotency_key_reused'}
        >
          {quote ? `Complete sale · ${formatMoney(total)}` : 'Complete sale'}
        </Button>
      </div>
    </form>
  )
}
