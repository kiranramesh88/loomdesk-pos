import {
  Archive,
  Download,
  IndianRupee,
  MoreHorizontal,
  Package,
  PackageSearch,
  Pencil,
  Plus,
  ReceiptText,
  ShoppingBag,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { Brand } from '@/components/brand/Brand'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CellStack, DataTable, type Column } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { Form, FormActions, FormGrid, FormSection } from '@/components/ui/Form'
import { IconButton } from '@/components/ui/IconButton'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { KpiCard } from '@/components/ui/KpiCard'
import { Menu } from '@/components/ui/Menu'
import { MoneyValue } from '@/components/ui/MoneyValue'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { Textarea } from '@/components/ui/Textarea'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/toastContext'

/*
 * Dev-only gallery (route /dev/ui, excluded from production builds). The rows below are
 * illustrative sample values for reviewing the components, not business data.
 */

interface SampleBill {
  invoice: string
  customer: string
  cashier: string
  method: string
  totalPaise: number
  status: { tone: StatusTone; label: string }
}

const SAMPLE_BILLS: SampleBill[] = [
  { invoice: 'LD-00842', customer: 'Aparna Menon', cashier: 'Anjali P.', method: 'UPI', totalPaise: 284_800, status: { tone: 'success', label: 'Paid' } },
  { invoice: 'LD-00841', customer: 'Walk-in customer', cashier: 'Rahul K.', method: 'Cash', totalPaise: 119_900, status: { tone: 'success', label: 'Paid' } },
  { invoice: 'LD-00840', customer: 'Nikhil Das', cashier: 'Anjali P.', method: 'Card', totalPaise: 378_900, status: { tone: 'warning', label: 'Partially returned' } },
  { invoice: 'LD-00839', customer: 'A customer with a deliberately long name to test truncation', cashier: 'Rahul K.', method: 'UPI', totalPaise: 1_000_000_00, status: { tone: 'neutral', label: 'Returned' } },
  { invoice: 'LD-00838', customer: 'Meera S.', cashier: 'Anjali P.', method: 'UPI', totalPaise: 308_000, status: { tone: 'danger', label: 'Voided' } },
]

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All payment methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
] as const

export function DesignSystemPage() {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState<string>('all')
  const [tableState, setTableState] = useState<'rows' | 'loading' | 'empty' | 'error'>('rows')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [failNextConfirm, setFailNextConfirm] = useState(true)
  const [showPaise, setShowPaise] = useState(true)

  const columns = useMemo<Column<SampleBill>[]>(
    () => [
      { id: 'invoice', header: 'Invoice', cell: (b) => <CellStack primary={b.invoice} secondary="19 Oct, 10:42 AM" /> },
      { id: 'customer', header: 'Customer', width: '28%', cell: (b) => <CellStack primary={b.customer} secondary={b.cashier} /> },
      { id: 'method', header: 'Payment', cell: (b) => b.method },
      { id: 'total', header: 'Total', align: 'right', cell: (b) => <MoneyValue paise={b.totalPaise} wholeRupees={!showPaise} className="type-amount" /> },
      { id: 'status', header: 'Status', cell: (b) => <StatusBadge tone={b.status.tone}>{b.status.label}</StatusBadge> },
      {
        id: 'actions',
        header: 'Actions',
        hideHeader: true,
        align: 'right',
        width: '56px',
        cell: (b) => (
          <Menu
            trigger={<IconButton label={`Actions for ${b.invoice}`} icon={<MoreHorizontal />} />}
            items={[
              { label: 'View details', icon: <ReceiptText />, onSelect: () => toast({ tone: 'info', title: `Opening ${b.invoice}` }) },
              { label: 'Download receipt', icon: <Download />, onSelect: () => toast({ title: 'Receipt ready' }) },
              { label: 'Void bill', icon: <Archive />, tone: 'danger', onSelect: () => setConfirmOpen(true) },
            ]}
          />
        ),
      },
    ],
    [showPaise, toast],
  )

  const visibleRows = SAMPLE_BILLS.filter((b) =>
    `${b.invoice} ${b.customer}`.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <main className="mx-auto w-full max-w-[1680px] px-3 pt-4 pb-10 sm:px-[22px] sm:pt-6 lg:px-[30px] lg:pt-7">
      <PageHeader
        title="Design system"
        description="Shared LoomDesk components in every state. Development builds only."
        actions={
          <>
            <Button icon={<Download />}>Export</Button>
            <Button variant="primary" icon={<Plus />} onClick={() => setDialogOpen(true)}>
              Add product
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <Section title="Typography">
          <Card>
            <CardBody className="grid gap-4 pt-[18px] lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Spec role="type-page-title"><span className="type-page-title">Inventory</span></Spec>
                <Spec role="type-page-desc"><span className="type-page-desc">What stock do we have, and why did it change?</span></Spec>
                <Spec role="type-section"><span className="type-section">Recent transactions</span></Spec>
                <Spec role="type-section-desc"><span className="type-section-desc">Latest completed bills</span></Spec>
                <Spec role="type-body"><span className="type-body">Stock adjustments create a movement record with a reason.</span></Spec>
              </div>
              <div className="flex flex-col gap-3">
                <Spec role="type-label"><span className="type-label">Product name</span></Spec>
                <Spec role="type-helper"><span className="type-helper">Shown on receipts and search results.</span></Spec>
                <Spec role="type-caption"><span className="type-caption">Updated 19 Oct, 10:42 AM</span></Spec>
                <Spec role="type-eyebrow"><span className="type-eyebrow">Workspace</span></Spec>
                <Spec role="type-figure"><span className="type-figure">₹48,620</span></Spec>
                <Spec role="type-amount"><span className="type-amount">₹2,848.00</span></Spec>
              </div>
            </CardBody>
          </Card>
        </Section>

        <Section title="Buttons">
          <Card>
            <CardBody className="flex flex-col gap-4 pt-[18px]">
              <Row>
                <Button variant="primary" icon={<Plus />}>Primary</Button>
                <Button>Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger" icon={<Archive />}>Danger</Button>
                <Button variant="primary" loading loadingLabel="Saving…">Save</Button>
                <Button variant="primary" disabled>Disabled</Button>
                <Button disabled>Disabled</Button>
              </Row>
              <Row>
                <Button size="sm">Small 32</Button>
                <Button>Medium 38</Button>
                <Button size="lg">Large 44</Button>
                <IconButton label="Edit product" icon={<Pencil />} />
                <IconButton label="More actions" variant="outline" size="md" icon={<MoreHorizontal />} />
              </Row>
            </CardBody>
          </Card>
        </Section>

        <Section title="Inputs and selects">
          <Card>
            <CardBody className="pt-[18px]">
              <FormGrid>
                <TextField label="Product name" placeholder="e.g. Classic Cotton Shirt" hint="Shown on receipts and search results." />
                <TextField label="Selling price" leading={<IndianRupee />} inputMode="decimal" defaultValue="1,199.00" />
                <TextField label="SKU" defaultValue="SH-CT-001" error="This SKU is already used by Classic Cotton Shirt." />
                <TextField label="Barcode" optional disabled defaultValue="8901001001011" />
                <Select
                  label="Payment method"
                  options={PAYMENT_OPTIONS}
                  value={method}
                  onValueChange={setMethod}
                />
                <Select label="Category" options={[]} value={undefined} onValueChange={() => {}} placeholder="Choose a category" error="Choose a category." />
                <Textarea label="Notes" optional className="sm:col-span-2" placeholder="Anything the next shift should know" />
              </FormGrid>
            </CardBody>
          </Card>
        </Section>

        <Section title="KPI cards">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Net sales today" value="₹48,620" icon={IndianRupee} trend={{ direction: 'up', label: '12.8%' }} footnote="vs last Monday" />
            <KpiCard label="Bills completed" value="38" icon={ReceiptText} footnote="Across 2 registers" />
            <KpiCard label="Returns value" value="₹4,280" icon={ShoppingBag} trend={{ direction: 'up', label: '3 more', favourable: false }} footnote="than yesterday" />
            <KpiCard label="Low-stock variants" value="7" icon={Package} isLoading />
          </div>
        </Section>

        <Section title="Table with toolbar">
          <Card>
            <CardHeader
              title="Recent transactions"
              description="Sample rows · amounts right-aligned"
              actions={
                <Select
                  label="Table state"
                  hideLabel
                  className="w-[150px]"
                  options={[
                    { value: 'rows', label: 'With rows' },
                    { value: 'loading', label: 'Loading' },
                    { value: 'empty', label: 'Empty' },
                    { value: 'error', label: 'Error' },
                  ]}
                  value={tableState}
                  onValueChange={(v) => setTableState(v as typeof tableState)}
                />
              }
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3.5 sm:px-5">
              <SearchInput
                label="Search transactions"
                placeholder="Search invoice or customer…"
                value={query}
                onValueChange={setQuery}
                shortcutHint="/"
                className="w-full sm:w-[300px]"
              />
              <Select label="Payment method" hideLabel className="w-full sm:w-[200px]" options={PAYMENT_OPTIONS} value={method} onValueChange={setMethod} />
              <Button variant="ghost" size="sm" onClick={() => setShowPaise((v) => !v)}>
                {showPaise ? 'Hide paise' : 'Show paise'}
              </Button>
            </div>
            <DataTable
              caption="Recent transactions"
              columns={columns}
              rows={tableState === 'loading' ? undefined : tableState === 'empty' ? [] : visibleRows}
              getRowId={(b) => b.invoice}
              isLoading={tableState === 'loading'}
              error={tableState === 'error' ? new Error('Can’t reach the server. Check the connection and try again.') : null}
              onRetry={() => setTableState('rows')}
              empty={
                <EmptyState
                  icon={<PackageSearch />}
                  title="No matching bills"
                  description="Try a different invoice number or customer name."
                  action={<Button size="sm" onClick={() => setQuery('')}>Clear search</Button>}
                />
              }
            />
          </Card>
        </Section>

        <Section title="Badges, alerts and money">
          <Card>
            <CardBody className="flex flex-col gap-4 pt-[18px]">
              <Row>
                <StatusBadge tone="success">Paid</StatusBadge>
                <StatusBadge tone="success">In stock</StatusBadge>
                <StatusBadge tone="warning">Low stock</StatusBadge>
                <StatusBadge tone="danger">Out of stock</StatusBadge>
                <StatusBadge tone="neutral">Refunded</StatusBadge>
                <StatusBadge tone="info">Recorded by cashier</StatusBadge>
              </Row>
              <div className="grid gap-3 lg:grid-cols-2">
                <InlineAlert tone="info">UPI and card payments are recorded by the cashier, not verified by a payment gateway.</InlineAlert>
                <InlineAlert tone="warning" title="Low stock">3 variants are at or below their reorder level.</InlineAlert>
                <InlineAlert tone="success">Stock adjustment saved.</InlineAlert>
                <InlineAlert tone="danger">Email or password is incorrect.</InlineAlert>
              </div>
              <Row>
                <MoneyValue paise={4_862_000} className="type-amount" />
                <MoneyValue paise={4_862_000} wholeRupees className="type-amount" />
                <MoneyValue paise={1_000_000_00} className="type-amount" />
              </Row>
            </CardBody>
          </Card>
        </Section>

        <Section title="Empty, error and loading states">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <EmptyState icon={<ReceiptText />} title="No sales yet" description="The overview fills in after the first completed bill." />
            </Card>
            <Card>
              <ErrorState message="Can’t reach the server. Check the connection and try again." onRetry={() => toast({ tone: 'info', title: 'Retrying…' })} />
            </Card>
            <Card>
              <CardHeader title="Loading panel" />
              <CardBody className="flex flex-col gap-4">
                <Skeleton className="h-24 w-full rounded-control" />
                <SkeletonText lines={3} />
              </CardBody>
            </Card>
          </div>
        </Section>

        <Section title="Form layout, dialogs and toasts">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Supplier" description="Contact details only — balances come from purchase and payment entries." />
              <CardBody>
                <Form onSubmit={(e) => { e.preventDefault(); toast({ title: 'Supplier saved' }) }}>
                  <FormSection title="Contact" description="Shown on the supplier statement.">
                    <FormGrid>
                      <TextField label="Supplier name" defaultValue="Malabar Textile House" className="sm:col-span-2" />
                      <TextField label="Phone" type="tel" defaultValue="+91 98765 12001" />
                      <TextField label="Email" type="email" optional />
                    </FormGrid>
                  </FormSection>
                  <FormActions>
                    <Button>Cancel</Button>
                    <Button type="submit" variant="primary">Save supplier</Button>
                  </FormActions>
                </Form>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Overlays" description="Dialogs trap focus and return it to the trigger." />
              <CardBody className="flex flex-col gap-4">
                <Row>
                  <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
                  <Button variant="danger" icon={<TriangleAlert />} onClick={() => setConfirmOpen(true)}>Void bill…</Button>
                </Row>
                <label className="flex items-center gap-2 type-body">
                  <input type="checkbox" checked={failNextConfirm} onChange={(e) => setFailNextConfirm(e.target.checked)} className="size-4 accent-primary" />
                  Make the next confirmation fail (shows the in-dialog error)
                </label>
                <Row>
                  <Button size="sm" onClick={() => toast({ title: 'Product saved', description: 'Classic Cotton Shirt is live in billing.' })}>Success toast</Button>
                  <Button size="sm" onClick={() => toast({ tone: 'info', title: 'Export started', description: 'We’ll download the CSV when it’s ready.' })}>Info toast</Button>
                  <Button size="sm" onClick={() => toast({ tone: 'error', title: 'Couldn’t save', description: 'Check the highlighted fields and try again.' })}>Error toast</Button>
                </Row>
              </CardBody>
              <CardFooter>
                <span className="mr-auto type-caption">CardFooter</span>
                <Button size="sm" variant="ghost">Secondary</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        <Section title="Brand">
          <Card>
            <CardBody className="flex flex-wrap items-center gap-8 pt-[18px]">
              <Brand />
              <div className="rounded-control bg-navy p-4">
                <Brand tone="dark" />
              </div>
            </CardBody>
          </Card>
        </Section>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Add product"
        description="Variants and stock are added after the product is created."
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setDialogOpen(false); toast({ title: 'Product created' }) }}>Create product</Button>
          </>
        }
      >
        <FormGrid>
          <TextField label="Product name" autoFocus className="sm:col-span-2" />
          <TextField label="Selling price" leading={<IndianRupee />} inputMode="decimal" />
          <Select label="Category" options={[{ value: 'shirts', label: 'Shirts' }, { value: 'kurtas', label: 'Kurtas' }]} value={undefined} onValueChange={() => {}} placeholder="Choose a category" />
        </FormGrid>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Void LD-00842?"
        description="The bill stays on record as voided and its stock returns to inventory. This can’t be undone."
        confirmLabel="Void bill"
        pendingLabel="Voiding…"
        tone="danger"
        reasonLabel="Reason for voiding"
        onConfirm={async () => {
          await new Promise((r) => setTimeout(r, 700))
          if (failNextConfirm) {
            setFailNextConfirm(false)
            throw new Error('You don’t have permission to void bills.')
          }
          toast({ title: 'Bill voided' })
        }}
      />
    </main>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-eyebrow">{title}</h2>
      {children}
    </section>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

function Spec({ role, children }: { role: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft pb-3 last:border-b-0">
      <code className="type-caption">{role}</code>
      {children}
    </div>
  )
}
