import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch, type Control, type FieldPath, type UseFormRegister } from 'react-hook-form'

import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody } from '@/components/ui/Card'
import { Form, FormActions, FormGrid, FormSection } from '@/components/ui/Form'
import { IconButton } from '@/components/ui/IconButton'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import type { InventoryVariant, Purchase, PurchaseQuote, PurchaseWrite } from '@/types/domain'

import { usePurchaseQuote, useVariantSearch } from '../api'
import { AUTO_RATE, GST_RATES, rateLabel, today } from '../labels'
import {
  purchaseSchema,
  toLineInput,
  toPurchaseField,
  toPurchasePayload,
  toPurchaseValues,
  type PurchaseFormValues,
} from '../supplierForm'

const RATE_OPTIONS: SelectOption[] = [
  { value: AUTO_RATE, label: 'Product rule' },
  ...GST_RATES.map((bp) => ({ value: String(bp), label: rateLabel(bp) })),
]

const DELAY_MS = 300

function useDebounced<T>(value: T): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [value])
  return debounced
}

interface PurchaseFormProps {
  purchase?: Purchase
  submitLabel: string
  pendingLabel: string
  cancelTo: string
  /** Save; throw an ApiError to show it on the form. */
  onSubmit: (payload: PurchaseWrite) => Promise<void>
}

/**
 * The supplier's invoice as entered by staff. Recording it changes no stock; receiving it later does.
 * Totals come from the server's quote, never from browser maths.
 */
export function PurchaseForm({ purchase, submitLabel, pendingLabel, cancelTo, onSubmit }: PurchaseFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: toPurchaseValues(purchase),
    mode: 'onTouched',
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const [formError, setFormError] = useState<string>()

  const lines = useWatch({ control, name: 'lines' })
  const inputs = useMemo(() => lines.map(toLineInput).filter((line) => line !== null), [lines])
  const quote = usePurchaseQuote(useDebounced(inputs))

  const submit = handleSubmit(async (values) => {
    setFormError(undefined)
    try {
      await onSubmit(toPurchasePayload(values))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      const entries = Object.entries(error.fields)
      entries.forEach(([path, messages], i) =>
        setError(toPurchaseField(path) as FieldPath<PurchaseFormValues>, { message: messages[0] }, { shouldFocus: i === 0 }),
      )
      setFormError(
        entries.length
          ? `Check the highlighted ${entries.length === 1 ? 'field' : `${entries.length} fields`}. Nothing was saved.`
          : error.message,
      )
    }
  })

  const add = (v: InventoryVariant) =>
    append({ variant: v.id, label: `${v.product.name} · ${v.size} / ${v.colour}`, sku: v.sku, quantity: '', unitCost: '', rate: AUTO_RATE })

  return (
    <Form onSubmit={submit} aria-label={submitLabel}>
      {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}
      <Card>
        <CardBody className="pt-5 sm:px-6 sm:pt-6 sm:pb-6">
          <FormSection title="Supplier invoice" description="As printed on the supplier’s bill. The invoice number is needed before goods are received.">
            <FormGrid>
              <TextField
                label="Supplier invoice number"
                optional
                placeholder="MTH/2026/118"
                maxLength={40}
                error={errors.supplier_invoice_no?.message}
                {...register('supplier_invoice_no')}
              />
              <TextField label="Invoice date" type="date" max={today()} error={errors.purchase_date?.message} {...register('purchase_date')} />
              <Textarea label="Notes" optional rows={2} className="sm:col-span-2" error={errors.notes?.message} {...register('notes')} />
            </FormGrid>
          </FormSection>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="pt-5 sm:px-6 sm:pt-6 sm:pb-6">
          <FormSection title="Items" description="The exact size and colour bought, the cost per unit before GST, and the GST rate on the invoice.">
            <VariantPicker taken={new Set(fields.map((f) => f.variant))} onPick={add} />
            {errors.lines?.message && <p className="type-helper text-danger">{errors.lines.message}</p>}
            {errors.lines?.root?.message && <p className="type-helper text-danger">{errors.lines.root.message}</p>}
            {fields.length > 0 && (
              <ol className="flex flex-col divide-y divide-line-soft border-y border-line-soft" aria-label="Purchase items">
                {fields.map((field, index) => (
                  <LineRow
                    key={field.id}
                    index={index}
                    label={field.label}
                    sku={field.sku}
                    variantId={field.variant}
                    register={register}
                    control={control}
                    quote={quote.data}
                    errors={errors.lines?.[index] as LineErrors | undefined}
                    onRate={(v) => setValue(`lines.${index}.rate`, v, { shouldDirty: true })}
                    onRemove={() => remove(index)}
                  />
                ))}
              </ol>
            )}
            <Totals quote={inputs.length ? quote.data : undefined} pending={quote.isFetching} complete={inputs.length === fields.length} error={quote.error} />
          </FormSection>
        </CardBody>
      </Card>

      <p className="type-helper">Recording doesn’t change stock. Open the purchase and receive it when the goods arrive.</p>
      <FormActions>
        <ButtonLink to={cancelTo}>Cancel</ButtonLink>
        <Button type="submit" variant="primary" loading={isSubmitting} loadingLabel={pendingLabel}>
          {submitLabel}
        </Button>
      </FormActions>
    </Form>
  )
}

interface LineErrors {
  variant?: { message?: string }
  quantity?: { message?: string }
  unitCost?: { message?: string }
  rate?: { message?: string }
}

interface LineRowProps {
  index: number
  label: string
  sku: string
  variantId: number
  register: UseFormRegister<PurchaseFormValues>
  control: Control<PurchaseFormValues>
  quote: PurchaseQuote | undefined
  errors: LineErrors | undefined
  onRate: (value: string) => void
  onRemove: () => void
}

function LineRow({ index, label, sku, variantId, register, control, quote, errors, onRate, onRemove }: LineRowProps) {
  const rate = useWatch({ control, name: `lines.${index}.rate` })
  const priced = quote?.lines.find((l) => l.variant === variantId)
  return (
    <li className="grid grid-cols-2 items-start gap-3 py-4 md:grid-cols-[minmax(0,1fr)_90px_130px_140px_auto]">
      <div className="col-span-2 flex min-w-0 items-start justify-between gap-2 md:col-span-1 md:pt-6">
        <div className="min-w-0">
          <p className="type-body font-strong break-words text-ink-2">{label}</p>
          <p className="type-helper tabular">{sku}</p>
          {errors?.variant?.message && <p className="type-helper text-danger">{errors.variant.message}</p>}
          {priced && (
            <p className="type-helper tabular">
              GST {rateLabel(priced.tax_rate_bp)} · {formatMoney(priced.tax_paise)} · line {formatMoney(priced.total_paise)}
            </p>
          )}
        </div>
        <IconButton label={`Remove ${sku}`} icon={<Trash2 />} size="sm" onClick={onRemove} className="md:hidden" />
      </div>
      <TextField label="Quantity" inputMode="numeric" autoComplete="off" error={errors?.quantity?.message} {...register(`lines.${index}.quantity`)} />
      <TextField
        label="Unit cost"
        inputMode="decimal"
        leading="₹"
        autoComplete="off"
        error={errors?.unitCost?.message}
        {...register(`lines.${index}.unitCost`)}
      />
      <Select label="GST" options={RATE_OPTIONS} value={rate} onValueChange={onRate} error={errors?.rate?.message} className="col-span-2 md:col-span-1" />
      <div className="hidden pt-6 md:block">
        <IconButton label={`Remove ${sku}`} icon={<Trash2 />} onClick={onRemove} />
      </div>
    </li>
  )
}

function Totals({ quote, pending, complete, error }: { quote: PurchaseQuote | undefined; pending: boolean; complete: boolean; error: Error | null }) {
  if (error) return <InlineAlert tone="danger">The totals couldn’t be calculated: {error.message}</InlineAlert>
  return (
    <dl aria-live="polite" className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 type-body">
      <dt className="type-helper">Subtotal</dt>
      <dd className="tabular text-right">{quote ? formatMoney(quote.subtotal_paise) : '—'}</dd>
      <dt className="type-helper">GST</dt>
      <dd className="tabular text-right">{quote ? formatMoney(quote.tax_paise) : '—'}</dd>
      <dt className="font-strong text-ink-2">Total</dt>
      <dd className="type-amount text-right">{quote ? formatMoney(quote.total_paise) : '—'}</dd>
      <dd className="col-span-2 text-right type-caption">
        {pending ? 'Calculating…' : !complete ? 'Lines without a quantity and cost aren’t counted yet.' : 'Calculated by the server.'}
      </dd>
    </dl>
  )
}

function VariantPicker({ taken, onPick }: { taken: Set<number>; onPick: (v: InventoryVariant) => void }) {
  const [term, setTerm] = useState('')
  const q = useDebounced(term.trim())
  const results = useVariantSearch(q)
  // Follows the typed text, not the debounced one, so the list closes as soon as an item is added.
  const open = term.trim().length >= 2 && q.length >= 2
  const rows = open ? results.data?.results : undefined
  return (
    <div className="flex flex-col gap-2">
      <SearchInput label="Add an item" placeholder="Search product, SKU or barcode to add…" value={term} onValueChange={setTerm} />
      {open && (
        <div className="rounded-control border border-line">
          {results.error ? (
            <p className="px-3.5 py-3 type-helper text-danger">Search failed: {results.error.message}</p>
          ) : !rows ? (
            <p className="px-3.5 py-3 type-helper">Searching…</p>
          ) : rows.length === 0 ? (
            <p className="px-3.5 py-3 type-helper">No sellable items match “{q}”.</p>
          ) : (
            <ul aria-label="Matching items" className="divide-y divide-line-soft">
              {rows.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="type-body font-strong break-words text-ink-2">
                      {v.product.name} · {v.size} / {v.colour}
                    </p>
                    <p className="type-helper tabular">
                      {v.sku} · {v.on_hand} on hand
                    </p>
                  </div>
                  <Button
                    size="sm"
                    icon={<Plus />}
                    disabled={taken.has(v.id)}
                    onClick={() => {
                      onPick(v)
                      setTerm('')
                    }}
                    aria-label={taken.has(v.id) ? `${v.sku} is already added` : `Add ${v.sku}`}
                  >
                    {taken.has(v.id) ? 'Added' : 'Add'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
