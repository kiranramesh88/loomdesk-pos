import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Select } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/toastContext'
import { ApiError } from '@/lib/http'
import { formatMoney, parseRupees } from '@/lib/money'
import type { SupplierDetail, SupplierPaymentMethod } from '@/types/domain'

import { useRecordPayment } from '../api'
import { balanceLabel, PAYMENT_METHOD_LABELS, today } from '../labels'

const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABELS) as SupplierPaymentMethod[]).map((m) => ({
  value: m,
  label: PAYMENT_METHOD_LABELS[m],
}))

interface RecordPaymentDialogProps {
  supplier: SupplierDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** A payment made outside LoomDesk, written down so the recorded balance stays right. Nothing is charged or verified. */
export function RecordPaymentDialog({ supplier, open, onOpenChange }: RecordPaymentDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description={`A payment you’ve already made to ${supplier.name}. LoomDesk records it; it doesn’t send money or check it with a bank.`}
    >
      {open && <PaymentForm supplier={supplier} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

interface Errors {
  paid_on?: string
  amount_paise?: string
  method?: string
  reference?: string
  notes?: string
}

function PaymentForm({ supplier, onClose }: { supplier: SupplierDetail; onClose: () => void }) {
  // One key per opened form: a double click or a retry after a lost response records one payment.
  const [key] = useState(() => crypto.randomUUID())
  const record = useRecordPayment(supplier.id, key)
  const { toast } = useToast()
  const [paidOn, setPaidOn] = useState(today())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<SupplierPaymentMethod>()
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string>()

  const submit = () => {
    const paise = parseRupees(amount)
    const found: Errors = {}
    if (!paidOn) found.paid_on = 'Choose the date it was paid.'
    else if (paidOn > today()) found.paid_on = 'This date is in the future.'
    if (paise === null || paise <= 0) found.amount_paise = 'Enter the amount paid in rupees, e.g. 5000.'
    if (!method) found.method = 'Choose how it was paid.'
    setErrors(found)
    setFormError(undefined)
    if (Object.keys(found).length || paise === null || !method) return
    record.mutate(
      { paid_on: paidOn, amount_paise: paise, method, reference: reference.trim(), notes: notes.trim() },
      {
        onSuccess: (payment) => {
          toast({ tone: 'success', title: 'Payment recorded', description: `${formatMoney(payment.amount_paise)} to ${supplier.name}` })
          onClose()
        },
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fields).length) {
            setErrors(Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, v[0]])))
          } else {
            setFormError(
              error instanceof ApiError && error.status === 0
                ? 'The server couldn’t be reached. Try again: the same payment won’t be recorded twice.'
                : error.message,
            )
          }
        },
      },
    )
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <p className="mb-4 type-helper">Recorded balance now: {balanceLabel(supplier.balance_paise)}.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Amount paid"
          inputMode="decimal"
          leading="₹"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount_paise}
        />
        <TextField
          label="Paid on"
          type="date"
          max={today()}
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          error={errors.paid_on}
        />
        <Select
          label="Method"
          placeholder="Choose a method"
          options={METHOD_OPTIONS}
          value={method}
          onValueChange={setMethod}
          error={errors.method}
        />
        <TextField
          label="Reference"
          optional
          maxLength={60}
          placeholder="UTR, cheque or receipt no."
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          error={errors.reference}
        />
        <TextField
          label="Notes"
          optional
          maxLength={200}
          className="sm:col-span-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={errors.notes}
        />
      </div>
      {formError && (
        <InlineAlert tone="danger" className="mt-4">
          {formError}
        </InlineAlert>
      )}
      <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
        <Button onClick={onClose} disabled={record.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={record.isPending}>
          Record payment
        </Button>
      </div>
    </form>
  )
}
