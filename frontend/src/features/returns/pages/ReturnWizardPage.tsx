import { ArrowLeft, FileQuestion, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select, type SelectOption } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Textarea } from '@/components/ui/Textarea'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/toastContext'
import { newCheckoutKey } from '@/features/billing/checkoutKey'
import { cx } from '@/lib/cx'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { PaymentMethod, ReturnableLine, ReturnableSale, ReturnDisposition, ReturnQuote, ReturnReason, ReturnRequest } from '@/types/domain'

import { useCreateReturn, useReturnableSale, useReturnQuote } from '../api'
import { DISPOSITION_LABELS, formatSaleTime, isManuallyRecorded, PAYMENT_LABELS, REASON_LABELS, REASONS, unitsLabel } from '../labels'
import { DISPOSITIONS } from '../returnParams'
import { RefundTotals } from './ReturnDetailPage'

const DISPOSITION_OPTIONS: SelectOption[] = DISPOSITIONS.map((d) => ({ value: d, label: DISPOSITION_LABELS[d].label }))
const REASON_OPTIONS: SelectOption[] = REASONS.map((r) => ({ value: r, label: REASON_LABELS[r] }))

const normalise = (value: string) => value.trim().toUpperCase()

/**
 * `/admin/returns/new`: find the bill, choose what comes back and where it goes, review the server's refund,
 * confirm. Every amount on the review step is the server's; nothing is worked out here.
 */
export function ReturnWizardPage() {
  useDocumentTitle('New return')
  const [search, setSearch] = useSearchParams()
  const invoice = normalise(search.get('invoice') ?? '')
  const [typed, setTyped] = useState(invoice)
  const sale = useReturnableSale(invoice || null)

  const find = (event: React.FormEvent) => {
    event.preventDefault()
    const value = normalise(typed)
    setSearch(value ? { invoice: value } : {}, { replace: true })
  }

  return (
    <>
      <ButtonLink to="/admin/returns" variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-3 mb-2">
        Returns
      </ButtonLink>
      <PageHeader title="New return" description="Start from the original bill. Refunds come from what the customer paid." />
      <div className="grid gap-4 lg:gap-5">
        <Card aria-labelledby="find-heading">
          <CardHeader id="find-heading" title="1. Find the bill" description="Type or scan the invoice number from the receipt." />
          <CardBody>
            <form onSubmit={find} className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <TextField
                label="Invoice number"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="LD-000123"
                autoComplete="off"
                spellCheck={false}
                className="sm:w-72"
              />
              <Button type="submit" icon={<Search />} className="sm:mt-[22px]">
                Find bill
              </Button>
            </form>
          </CardBody>
        </Card>
        {invoice && <FoundSale invoice={invoice} sale={sale} />}
      </div>
    </>
  )
}

function FoundSale({ invoice, sale }: { invoice: string; sale: ReturnType<typeof useReturnableSale> }) {
  if (sale.isPending) {
    return (
      <Card>
        <CardBody className="pt-5" aria-busy>
          <SkeletonText lines={4} />
        </CardBody>
      </Card>
    )
  }
  if (sale.isError) {
    if (sale.error instanceof ApiError && sale.error.status === 404) {
      return (
        <Card>
          <EmptyState
            icon={<FileQuestion />}
            title="No bill with that invoice number"
            description={`“${invoice.slice(0, 40)}” doesn’t match a saved bill. Check the receipt and try again.`}
          />
        </Card>
      )
    }
    return (
      <Card>
        <ErrorState title="The bill couldn’t load" message={sale.error.message} onRetry={() => void sale.refetch()} retrying={sale.isFetching} />
      </Card>
    )
  }
  return <ReturnForm key={sale.data.invoice_no} sale={sale.data} />
}

interface Pick {
  quantity: string
  disposition: ReturnDisposition
}

interface FormErrors {
  lines: Record<number, string>
  items?: string
  reason?: string
  note?: string
  method?: string
  reference?: string
}

const NO_ERRORS: FormErrors = { lines: {} }

const parseUnits = (value: string): number | null => (/^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : null)

function ReturnForm({ sale }: { sale: ReturnableSale }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [picks, setPicks] = useState<Record<number, Pick>>({})
  const [reason, setReason] = useState<ReturnReason | ''>('')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState<PaymentMethod>(sale.refund_methods[0] ?? 'cash')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const [review, setReview] = useState<{ request: ReturnRequest; quote: ReturnQuote; key: string } | null>(null)
  const [problem, setProblem] = useState<string>()
  const quote = useReturnQuote()
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  // Set synchronously, so a double click can't send a second request before the pending state renders.
  const inFlight = useRef(false)
  const methodLabel = useId()

  const create = useCreateReturn(review?.key ?? '')

  useEffect(() => {
    if (review) reviewHeading.current?.focus()
  }, [review])

  if (!sale.can_return) {
    return (
      <Card aria-labelledby="nothing-heading">
        <CardHeader id="nothing-heading" title={`Bill ${sale.invoice_no}`} />
        <CardBody>
          <InlineAlert tone="info" title="Nothing on this bill can be returned">
            {sale.status === 'voided'
              ? 'This bill was voided, so its items are already back in stock.'
              : 'Every item on this bill has already been returned.'}{' '}
            <Link to={`/admin/transactions/${sale.invoice_no}`} className="font-strong underline">
              Open the bill
            </Link>
          </InlineAlert>
        </CardBody>
      </Card>
    )
  }

  const pick = (line: ReturnableLine): Pick => picks[line.id] ?? { quantity: '', disposition: 'sellable' }
  const setPick = (line: ReturnableLine, next: Partial<Pick>) => {
    setPicks((all) => ({ ...all, [line.id]: { ...pick(line), ...next } }))
    setErrors((e) => ({ ...e, items: undefined, lines: { ...e.lines, [line.id]: '' } }))
  }

  const chosen = sale.lines
    .map((line) => ({ line, quantity: parseUnits(pick(line).quantity), disposition: pick(line).disposition }))
    .filter((c) => c.quantity !== 0 && pick(c.line).quantity.trim() !== '')

  const validate = (): FormErrors => {
    const found: FormErrors = { lines: {} }
    for (const c of chosen) {
      if (c.quantity === null) found.lines[c.line.id] = 'Enter a whole number of units.'
      else if (c.quantity > c.line.eligible) found.lines[c.line.id] = `Only ${c.line.eligible} can be returned.`
    }
    if (!chosen.length) found.items = 'Enter how many units of at least one item are coming back.'
    if (!reason) found.reason = 'Choose why the items came back.'
    if (reason === 'other' && !note.trim()) found.note = 'Say why the items came back.'
    if (method !== 'cash' && !reference.trim()) found.reference = method === 'upi' ? 'Enter the UPI transaction ID.' : 'Enter the card refund reference.'
    return found
  }

  const request = (): ReturnRequest => ({
    invoice_no: sale.invoice_no,
    reason: reason as ReturnReason,
    note: note.trim(),
    lines: chosen.map((c) => ({ sale_line: c.line.id, quantity: c.quantity ?? 0, disposition: c.disposition })),
    refund: { method, reference: method === 'cash' ? '' : reference.trim() },
  })

  // Server errors name `lines.N.<field>` by position in the request; map them back onto the lines.
  const serverErrors = (error: ApiError, body: ReturnRequest): FormErrors => {
    const found: FormErrors = { lines: {} }
    for (const [path, messages] of Object.entries(error.fields)) {
      const match = /^lines\.(\d+)\./.exec(path)
      const lineId = match ? body.lines[Number(match[1])]?.sale_line : undefined
      if (lineId !== undefined) found.lines[lineId] = messages[0] ?? ''
      else if (path === 'reason') found.reason = messages[0]
      else if (path === 'note') found.note = messages[0]
      else if (path === 'refund.method') found.method = messages[0]
      else if (path === 'refund.reference') found.reference = messages[0]
    }
    return found
  }

  const toReview = () => {
    const found = validate()
    setErrors(found)
    setProblem(undefined)
    if (found.items || found.reason || found.note || found.reference || Object.values(found.lines).some(Boolean)) return
    const body = request()
    quote.mutate(body, {
      onSuccess: (result) => setReview({ request: body, quote: result, key: newCheckoutKey() }),
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(serverErrors(error, body))
        else setProblem(error instanceof ApiError && error.status === 0 ? 'The server couldn’t be reached. Check the connection and try again.' : error.message)
      },
    })
  }

  const confirm = () => {
    if (!review || inFlight.current) return
    inFlight.current = true
    setProblem(undefined)
    create.mutate(
      { ...review.request, expected_total_paise: review.quote.totals.total_paise },
      {
        onSuccess: (ret) => {
          toast({ tone: 'success', title: `Return ${ret.number} recorded`, description: `Refund ${formatMoney(ret.total_paise)}` })
          navigate(`/admin/returns/${ret.number}`)
        },
        // After a success the page moves on to the return, so only a failure allows another attempt.
        onError: (error) => {
          inFlight.current = false
          if (error instanceof ApiError && Object.keys(error.fields).length) {
            setErrors(serverErrors(error, review.request))
            setReview(null)
          } else if (error instanceof ApiError && error.status === 0) {
            // The key stays the same, so trying again can't refund twice.
            setProblem('The server couldn’t be reached, so we can’t tell whether the return was saved. Try again: it won’t be recorded twice.')
          } else {
            setProblem(error.message)
            if (error instanceof ApiError && error.code === 'refund_changed') setReview(null)
          }
        },
      },
    )
  }

  const bill = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-helper">
      <span className="tabular">{formatSaleTime(sale.created_at)}</span>
      <span>Cashier {sale.cashier_name}</span>
      <span className="tabular">Total {formatMoney(sale.total_paise)}</span>
      <span>Paid by {PAYMENT_LABELS[sale.payment_method]}</span>
      <span>Customer: Walk-in</span>
      <Link to={`/admin/transactions/${sale.invoice_no}`} className="text-primary hover:underline">
        Open the bill
      </Link>
    </div>
  )

  if (review) {
    const byLine = new Map(sale.lines.map((l) => [l.id, l]))
    const restocked = review.quote.lines.filter((l) => l.disposition === 'sellable').reduce((s, l) => s + l.quantity, 0)
    const kept = review.quote.lines.filter((l) => l.disposition !== 'sellable').reduce((s, l) => s + l.quantity, 0)
    return (
      <Card aria-labelledby="review-heading">
        <CardHeader
          id="review-heading"
          title={`3. Review the return from ${sale.invoice_no}`}
          description="Nothing is saved until you confirm."
        />
        <CardBody className="grid gap-5">
          {/* The heading the step change moves focus to, for keyboard and screen-reader users. */}
          <h2 ref={reviewHeading} tabIndex={-1} className="sr-only">
            Review the refund
          </h2>
          {bill}
          <ul className="divide-y divide-line-soft rounded-control border border-line">
            {review.quote.lines.map((q) => {
              const line = byLine.get(q.sale_line)
              return (
                <li key={q.sale_line} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="font-strong break-words text-ink-2">{line?.product_name}</div>
                    <div className="type-helper">
                      {unitsLabel(q.quantity)} · {line?.size} · {line?.colour} ·{' '}
                      <StatusBadge tone={DISPOSITION_LABELS[q.disposition].tone}>{DISPOSITION_LABELS[q.disposition].label}</StatusBadge>
                    </div>
                  </div>
                  <span className="type-amount">{formatMoney(q.total_paise)}</span>
                </li>
              )
            })}
          </ul>
          <RefundTotals figures={review.quote.totals} />
          <dl className="grid gap-2 type-body">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-strong text-ink-2">Stock:</dt>
              <dd>
                {restocked ? `${unitsLabel(restocked)} ${restocked === 1 ? 'goes' : 'go'} back into stock.` : 'No stock goes back.'}
                {kept > 0 && ` ${unitsLabel(kept)} ${kept === 1 ? 'stays' : 'stay'} out of stock (damaged or on inspection hold).`}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-strong text-ink-2">Refund:</dt>
              <dd>
                {formatMoney(review.quote.totals.total_paise)} by {PAYMENT_LABELS[review.request.refund.method]}
                {review.request.refund.reference && ` (ref. ${review.request.refund.reference})`}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-strong text-ink-2">Reason:</dt>
              <dd>
                {REASON_LABELS[review.request.reason]}
                {review.request.note && `: ${review.request.note}`}
              </dd>
            </div>
          </dl>
          {isManuallyRecorded(review.request.refund.method) && (
            <InlineAlert tone="warning" title="Recorded, not gateway-verified">
              Send the {PAYMENT_LABELS[review.request.refund.method]} refund yourself. LoomDesk records the reference you entered; it
              can’t confirm the money arrived.
            </InlineAlert>
          )}
          {problem && <InlineAlert tone="danger">{problem}</InlineAlert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setReview(null)} disabled={create.isPending}>
              Back to items
            </Button>
            <Button variant="primary" onClick={confirm} loading={create.isPending} loadingLabel="Recording…">
              Confirm return · {formatMoney(review.quote.totals.total_paise)}
            </Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="items-heading">
      <CardHeader id="items-heading" title={`2. Choose what comes back from ${sale.invoice_no}`} />
      <CardBody className="grid gap-5">
        {bill}
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            toReview()
          }}
        >
          <fieldset className="grid gap-3">
            <legend className="mb-1 type-label">Items</legend>
            {sale.lines.map((line) => {
              const p = pick(line)
              const done = line.eligible === 0
              return (
                <div
                  key={line.id}
                  className={cx(
                    'grid gap-3 rounded-control border px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_120px_190px] md:items-start',
                    errors.lines[line.id] ? 'border-danger' : 'border-line',
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-strong break-words text-ink-2">{line.product_name}</div>
                    <div className="type-helper">
                      {line.size} · {line.colour} · {line.variant_sku} · {formatMoney(line.total_paise)} for {line.quantity}
                    </div>
                    <div className="mt-1 type-helper tabular">
                      Sold {line.quantity} · already returned {line.returned} ·{' '}
                      <span className="font-strong text-ink-2">can return {line.eligible}</span>
                    </div>
                  </div>
                  {done ? (
                    <p className="type-helper md:col-span-2 md:pt-2">All returned already.</p>
                  ) : (
                    <>
                      <TextField
                        label={`Units of ${line.product_name} ${line.size} ${line.colour} to return`}
                        hideLabel
                        inputMode="numeric"
                        placeholder={`0–${line.eligible}`}
                        value={p.quantity}
                        onChange={(event) => setPick(line, { quantity: event.target.value })}
                        error={errors.lines[line.id] || undefined}
                        leading={<span aria-hidden className="type-helper">Qty</span>}
                      />
                      <Select
                        label={`Where ${line.product_name} ${line.size} ${line.colour} goes`}
                        hideLabel
                        options={DISPOSITION_OPTIONS}
                        value={p.disposition}
                        onValueChange={(v) => setPick(line, { disposition: v as ReturnDisposition })}
                      />
                    </>
                  )}
                </div>
              )
            })}
            {errors.items && <p className="type-helper text-danger">{errors.items}</p>}
            <p className="type-helper">Only “Back to stock” puts units back on the shelf. Damaged and held items stay out of stock.</p>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Reason"
              placeholder="Choose a reason"
              options={REASON_OPTIONS}
              value={reason}
              onValueChange={(v) => {
                setReason(v as ReturnReason)
                setErrors((e) => ({ ...e, reason: undefined, note: undefined }))
              }}
              error={errors.reason}
            />
            <Textarea
              label="Note"
              optional={reason !== 'other'}
              rows={2}
              maxLength={200}
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
                setErrors((e) => ({ ...e, note: undefined }))
              }}
              error={errors.note}
            />
          </div>

          <div className="grid gap-3">
            <p id={methodLabel} className="type-label">
              Refund method
            </p>
            <div role="radiogroup" aria-labelledby={methodLabel} className="flex flex-wrap gap-2">
              {sale.refund_methods.map((m) => (
                <label
                  key={m}
                  className={cx(
                    'focus-ring-within flex h-control cursor-pointer items-center rounded-control border px-4 type-body font-strong transition-control',
                    method === m ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink-3 hover:border-primary-border',
                  )}
                >
                  <input
                    type="radio"
                    name="refund-method"
                    value={m}
                    checked={method === m}
                    onChange={() => {
                      setMethod(m)
                      setErrors((e) => ({ ...e, reference: undefined, method: undefined }))
                    }}
                    className="sr-only"
                  />
                  {PAYMENT_LABELS[m]}
                </label>
              ))}
            </div>
            <p className="type-helper">
              {sale.payment_method === 'cash'
                ? 'This bill was paid in cash, so the refund is in cash.'
                : `Refund by ${PAYMENT_LABELS[sale.payment_method]}, the way the customer paid, or in cash.`}
            </p>
            {errors.method && <p className="type-helper text-danger">{errors.method}</p>}
            {method !== 'cash' && (
              <TextField
                label={method === 'upi' ? 'UPI transaction ID' : 'Card refund reference'}
                hint="Recorded as entered; it isn’t verified with a gateway."
                value={reference}
                maxLength={40}
                autoComplete="off"
                onChange={(event) => {
                  setReference(event.target.value)
                  setErrors((e) => ({ ...e, reference: undefined }))
                }}
                error={errors.reference}
                className="sm:max-w-sm"
              />
            )}
          </div>
          {problem && <InlineAlert tone="danger">{problem}</InlineAlert>}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={quote.isPending} loadingLabel="Working out the refund…">
              Review refund
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
