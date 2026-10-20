import { useId, useState } from 'react'

import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select, type SelectOption } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/toastContext'
import { useCategories, useTaxRules } from '@/features/products/api'
import { cx } from '@/lib/cx'
import { ApiError } from '@/lib/http'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { StoreSettings, StoreSettingsUpdate, TaxRule } from '@/types/domain'

import { useStoreSettings, useUpdateStoreSettings } from '../api'

type Errors = Partial<Record<keyof StoreSettingsUpdate, string>>

const fieldErrors = (error: ApiError): Errors => Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, v[0]]))

const problemText = (error: Error) =>
  error instanceof ApiError && error.status === 0 ? 'The server couldn’t be reached. Check the connection and try again.' : error.message

/** `/admin/settings`: the store details printed on receipts, the pricing rules, and the GST rules in use (read-only, D10). */
export function SettingsPage() {
  const settings = useStoreSettings()
  return (
    <>
      <PageHeader title="Settings" description="Store details printed on receipts, how prices and discounts work, and the GST rules in use." />
      {settings.isPending ? (
        <Card>
          <CardBody className="pt-5" aria-busy>
            <SkeletonText lines={6} />
          </CardBody>
        </Card>
      ) : settings.isError ? (
        <Card>
          <ErrorState title="Settings couldn’t load" message={settings.error.message} onRetry={() => void settings.refetch()} retrying={settings.isFetching} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:gap-5">
          <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
            {/* Keyed on the saved values, so a save (or a refetch) resets each form to what the server holds. */}
            <StoreDetails key={`d-${JSON.stringify([settings.data.name, settings.data.code, settings.data.address, settings.data.state, settings.data.gstin])}`} settings={settings.data} />
            <Pricing key={`p-${settings.data.prices_include_tax}-${settings.data.cashier_discount_limit_pct}`} settings={settings.data} />
          </div>
          <GstRules />
        </div>
      )}
    </>
  )
}

function SaveRow({ dirty, pending, onReset, label }: { dirty: boolean; pending: boolean; onReset: () => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-4">
      {dirty && (
        <Button onClick={onReset} disabled={pending}>
          Discard changes
        </Button>
      )}
      <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
        {label}
      </Button>
    </div>
  )
}

function StoreDetails({ settings }: { settings: StoreSettings }) {
  const save = useUpdateStoreSettings()
  const { toast } = useToast()
  const initial = { name: settings.name, code: settings.code, address: settings.address, state: settings.state, gstin: settings.gstin }
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [problem, setProblem] = useState<string>()
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k])
  // A state saved before the list existed stays selectable until it's changed.
  const states: SelectOption[] = [
    ...(settings.states.includes(settings.state) ? [] : [{ value: settings.state, label: settings.state }]),
    ...settings.states.map((s) => ({ value: s, label: s })),
  ]
  const set = (key: keyof typeof initial) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const submit = () => {
    const found: Errors = {}
    if (!form.name.trim()) found.name = 'Enter the store’s name as it should appear on receipts.'
    if (!form.code.trim()) found.code = 'Enter the store code.'
    if (!form.address.trim()) found.address = 'Enter the address printed on receipts.'
    setErrors(found)
    setProblem(undefined)
    if (Object.keys(found).length) return
    const changes = Object.fromEntries(
      (Object.keys(initial) as (keyof typeof initial)[]).filter((k) => form[k].trim() !== initial[k]).map((k) => [k, form[k].trim()]),
    )
    save.mutate(changes, {
      onSuccess: () => toast({ tone: 'success', title: 'Store details saved', description: 'They print on receipts from the next bill.' }),
      onError: (error) => (error instanceof ApiError && Object.keys(error.fields).length ? setErrors(fieldErrors(error)) : setProblem(problemText(error))),
    })
  }

  return (
    <Card aria-labelledby="details-heading">
      <CardHeader id="details-heading" title="Store details" description="Printed on every receipt from the next bill. Receipts already issued keep the details they were printed with." />
      <CardBody>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)]">
            <TextField label="Store name" maxLength={120} value={form.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} />
            <TextField
              label="Store code"
              maxLength={20}
              spellCheck={false}
              value={form.code}
              onChange={(e) => set('code')(e.target.value.toUpperCase())}
              error={errors.code}
            />
          </div>
          <Textarea label="Address" rows={2} maxLength={300} value={form.address} onChange={(e) => set('address')(e.target.value)} error={errors.address} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="State" options={states} value={form.state} onValueChange={set('state')} error={errors.state} hint="Sales are taxed as intra-state: CGST and SGST." />
            <TextField
              label="GSTIN"
              optional
              maxLength={15}
              spellCheck={false}
              autoComplete="off"
              value={form.gstin}
              onChange={(e) => set('gstin')(e.target.value.toUpperCase())}
              error={errors.gstin}
              hint="Leave blank if the store isn’t registered. Receipts then show “Not recorded”."
            />
          </div>
          {problem && <InlineAlert tone="danger">{problem}</InlineAlert>}
          <SaveRow
            dirty={dirty}
            pending={save.isPending}
            label="Save store details"
            onReset={() => {
              setForm(initial)
              setErrors({})
            }}
          />
        </form>
      </CardBody>
    </Card>
  )
}

const example = (include: boolean) =>
  include ? 'A ₹1,000 item on 5% GST costs ₹1,000; ₹47.62 of it is GST.' : 'A ₹1,000 item on 5% GST costs ₹1,050 at checkout.'

function Pricing({ settings }: { settings: StoreSettings }) {
  const save = useUpdateStoreSettings()
  const { toast } = useToast()
  const [include, setInclude] = useState(settings.prices_include_tax)
  const [limit, setLimit] = useState(String(settings.cashier_discount_limit_pct))
  const [errors, setErrors] = useState<Errors>({})
  const [problem, setProblem] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const legend = useId()
  const limitValue = /^\d{1,3}$/.test(limit.trim()) ? Number(limit.trim()) : null
  const dirty = include !== settings.prices_include_tax || limitValue !== settings.cashier_discount_limit_pct

  const changes = (): StoreSettingsUpdate => ({
    ...(include !== settings.prices_include_tax ? { prices_include_tax: include } : {}),
    ...(limitValue !== settings.cashier_discount_limit_pct && limitValue !== null ? { cashier_discount_limit_pct: limitValue } : {}),
  })

  const send = async () => {
    try {
      await save.mutateAsync(changes())
      toast({ tone: 'success', title: 'Pricing rules saved', description: 'They apply to every bill priced from now on.' })
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(fieldErrors(error))
      else setProblem(problemText(error as Error))
    }
  }

  const submit = () => {
    setProblem(undefined)
    if (limitValue === null || limitValue > 100) {
      setErrors({ cashier_discount_limit_pct: 'Enter a whole number from 0 to 100.' })
      return
    }
    setErrors({})
    // Switching how prices are read changes every new bill's total, so it gets its own confirmation.
    if (include !== settings.prices_include_tax) setConfirming(true)
    else void send()
  }

  const option = (value: boolean, title: string) => (
    <label
      className={cx(
        'focus-ring-within flex cursor-pointer gap-3 rounded-control border p-3.5 transition-control',
        include === value ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface hover:border-primary-border',
      )}
    >
      <input
        type="radio"
        name="prices-include-tax"
        checked={include === value}
        onChange={() => setInclude(value)}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span className="grid gap-0.5">
        <span className="type-label">{title}</span>
        <span className="type-helper">{example(value)}</span>
      </span>
    </label>
  )

  return (
    <Card aria-labelledby="pricing-heading">
      <CardHeader id="pricing-heading" title="Pricing and discounts" description="Applied to every bill priced from now on. Saved sales and receipts never change." />
      <CardBody>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <fieldset className="grid gap-2" aria-labelledby={legend}>
            <legend id={legend} className="mb-1 type-label">
              Catalogue prices
            </legend>
            {option(false, 'Exclude GST: add it at checkout')}
            {option(true, 'Include GST (MRP): work it out from the price')}
          </fieldset>
          <TextField
            label="Cashier discount limit"
            inputMode="numeric"
            maxLength={3}
            trailing={<span className="pr-3 type-helper">% of the bill</span>}
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value)
              setErrors({})
            }}
            error={errors.cashier_discount_limit_pct}
            hint="Above this, a Senior cashier or Admin enters their approval PIN at the till."
            className="sm:max-w-xs"
          />
          {problem && <InlineAlert tone="danger">{problem}</InlineAlert>}
          <SaveRow
            dirty={dirty}
            pending={save.isPending}
            label="Save pricing rules"
            onReset={() => {
              setInclude(settings.prices_include_tax)
              setLimit(String(settings.cashier_discount_limit_pct))
              setErrors({})
            }}
          />
        </form>
      </CardBody>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={include ? 'Treat prices as including GST?' : 'Treat prices as excluding GST?'}
        description={
          <>
            Every bill priced from now on changes. {example(include)} A bill already open on a till asks the cashier to confirm
            its new total before payment. Saved sales and receipts don’t change.
          </>
        }
        confirmLabel="Change pricing"
        pendingLabel="Saving…"
        onConfirm={async () => {
          await send()
        }}
      />
    </Card>
  )
}

interface RuleRow {
  rule: TaxRule
  categories: string[]
}

const RULE_COLUMNS: Column<RuleRow>[] = [
  { id: 'name', header: 'GST rule', width: '200px', cell: (r) => <span className="font-strong text-ink-2">{r.rule.name}</span> },
  { id: 'rate', header: 'Rate', cell: (r) => <span className="break-words">{r.rule.summary}</span> },
  {
    id: 'used',
    header: 'Categories',
    cell: (r) => (r.categories.length ? <span className="break-words">{r.categories.join(', ')}</span> : <span className="text-ink-3">None</span>),
  },
]

function GstRules() {
  const rules = useTaxRules()
  const categories = useCategories()
  const wide = useMediaQuery(MEDIA.wide)
  const error = rules.error ?? categories.error
  const rows: RuleRow[] | undefined =
    rules.data && categories.data
      ? rules.data.map((rule) => ({
          rule,
          categories: categories.data.filter((c) => c.tax_rule?.id === rule.id).map((c) => `${c.name} (HSN ${c.hsn_code})`),
        }))
      : undefined
  return (
    <Card aria-labelledby="gst-heading">
      <CardHeader
        id="gst-heading"
        title="GST rules"
        description="Read-only. Each category uses one rule, and a product can override it on its own page. The slab is chosen from each unit’s price after discount."
      />
      {!wide && rows ? (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {rows.map((r) => (
            <li key={r.rule.id} className="grid gap-1 px-4 py-3.5">
              <span className="font-strong break-words text-ink-2">{r.rule.name}</span>
              <span className="type-body">{r.rule.summary}</span>
              <span className="type-helper break-words">{r.categories.length ? r.categories.join(', ') : 'No categories'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <DataTable
          caption="GST rules"
          columns={RULE_COLUMNS}
          rows={rows}
          getRowId={(r) => r.rule.id}
          isLoading={!error && !rows}
          error={error}
          onRetry={() => {
            void rules.refetch()
            void categories.refetch()
          }}
          empty={<p className="px-5 py-6 type-helper">No GST rules are set up. Run the store setup command.</p>}
          minWidth="640px"
        />
      )}
    </Card>
  )
}
