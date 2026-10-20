import { ArrowLeft, Printer } from 'lucide-react'
import type { ReactNode } from 'react'

import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatRate } from '@/features/billing/receipt'
import { formatMoney } from '@/lib/money'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { Sale, SaleLine } from '@/types/domain'

import { SaleGate } from '../components/SaleGate'
import { formatSaleTime, isManuallyRecorded, itemsLabel, PAYMENT_LABELS, SALE_STATUS_LABELS } from '../labels'

const backLink = (
  <ButtonLink to="/admin/transactions" variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-3 mb-2">
    Transactions
  </ButtonLink>
)

/** `/admin/transactions/:invoiceNo`: the saved sale in an invoice layout. Nothing is recalculated. */
export function TransactionDetailPage() {
  return (
    <>
      {backLink}
      <SaleGate loading={<DetailSkeleton />}>{(sale) => <TransactionDetail sale={sale} />}</SaleGate>
    </>
  )
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading transaction" className="grid gap-4">
      <Skeleton className="h-7 w-56" />
      <Card>
        <CardBody className="pt-5">
          <SkeletonText lines={5} />
        </CardBody>
      </Card>
    </div>
  )
}

function TransactionDetail({ sale }: { sale: Sale }) {
  useDocumentTitle(`Invoice ${sale.invoice_no}`)
  const status = SALE_STATUS_LABELS[sale.status]
  const units = sale.lines.reduce((sum, line) => sum + line.quantity, 0)
  return (
    <>
      <PageHeader
        title={`Invoice ${sale.invoice_no}`}
        description={`${formatSaleTime(sale.created_at)} · ${itemsLabel(units)} · ${formatMoney(sale.total_paise)}`}
        actions={
          <ButtonLink to="receipt" variant="primary" icon={<Printer />}>
            Reprint receipt
          </ButtonLink>
        }
      />
      {/* Invoice layout: who, how paid and where on top; then the lines and totals at full width. */}
      <div className="grid gap-4 lg:gap-5">
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <Card aria-labelledby="bill-heading">
            <CardHeader id="bill-heading" title="Bill" actions={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>} />
            <CardBody>
              <Facts>
                <Fact label="Invoice no." value={<span className="tabular">{sale.invoice_no}</span>} />
                <Fact label="Date & time" value={formatSaleTime(sale.created_at)} />
                <Fact label="Cashier" value={sale.cashier_name} />
                {sale.discount_approved_by_name && <Fact label="Discount approved by" value={sale.discount_approved_by_name} />}
              </Facts>
            </CardBody>
          </Card>
          <PaymentCard sale={sale} />
          <Card aria-labelledby="store-heading">
            <CardHeader id="store-heading" title="Store" description="As printed on this receipt." />
            <CardBody>
              <Facts>
                <Fact label="Name" value={`${sale.store.name} (${sale.store.code})`} />
                <Fact label="Address" value={<span className="whitespace-pre-line">{sale.store.address}</span>} />
                <Fact label="State" value={sale.store.state} />
                <Fact label="GSTIN" value={sale.store.gstin || 'Not recorded'} />
              </Facts>
            </CardBody>
          </Card>
        </div>
        <Card aria-labelledby="items-heading">
          <CardHeader id="items-heading" title="Items sold" description="Names, prices and GST rates as saved at the time of sale." />
          <Lines lines={sale.lines} />
        </Card>
        <Card aria-labelledby="totals-heading">
          <CardHeader id="totals-heading" title="Totals and tax" />
          <CardBody>
            <Totals sale={sale} />
          </CardBody>
        </Card>
      </div>
    </>
  )
}

const variantLabel = (line: SaleLine) => `${line.size} · ${line.colour} · ${line.variant_sku}`

const LINE_COLUMNS: Column<SaleLine>[] = [
  {
    id: 'item',
    header: 'Item',
    cell: (l) => (
      <div className="min-w-0">
        <div className="font-strong break-words text-ink-2">{l.product_name}</div>
        <div className="type-helper">{variantLabel(l)}</div>
        <div className="type-caption">HSN {l.hsn_code || 'not set'}</div>
      </div>
    ),
  },
  { id: 'qty', header: 'Qty', align: 'right', width: '60px', cell: (l) => <span className="tabular">{l.quantity}</span> },
  { id: 'price', header: 'Unit price', align: 'right', width: '120px', cell: (l) => <span className="type-amount">{formatMoney(l.unit_price_paise)}</span> },
  {
    id: 'discount',
    header: 'Discount',
    align: 'right',
    width: '110px',
    cell: (l) => <span className="tabular">{l.discount_paise > 0 ? `−${formatMoney(l.discount_paise)}` : '—'}</span>,
  },
  { id: 'taxable', header: 'Taxable', align: 'right', width: '120px', cell: (l) => <span className="tabular">{formatMoney(l.taxable_paise)}</span> },
  {
    id: 'gst',
    header: 'GST',
    align: 'right',
    width: '120px',
    cell: (l) => (
      <div>
        <div className="tabular">{formatMoney(l.tax_paise)}</div>
        <div className="type-caption">{formatRate(l.tax_rate_bp)}</div>
      </div>
    ),
  },
  { id: 'total', header: 'Amount', align: 'right', width: '130px', cell: (l) => <span className="type-amount">{formatMoney(l.total_paise)}</span> },
]

function Lines({ lines }: { lines: SaleLine[] }) {
  const wide = useMediaQuery(MEDIA.abovephone)
  if (wide) {
    return (
      <DataTable caption="Items sold" columns={LINE_COLUMNS} rows={lines} getRowId={(l) => l.id} empty={null} minWidth="760px" />
    )
  }
  return (
    <ul aria-label="Items sold" className="divide-y divide-line-soft border-t border-line-soft">
      {lines.map((l) => (
        <li key={l.id} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 font-strong break-words text-ink-2">{l.product_name}</span>
            <span className="type-amount">{formatMoney(l.total_paise)}</span>
          </div>
          <span className="type-helper">{variantLabel(l)}</span>
          <span className="type-helper tabular">
            {l.quantity} × {formatMoney(l.unit_price_paise)}
            {l.discount_paise > 0 && ` · discount −${formatMoney(l.discount_paise)}`}
          </span>
          <span className="type-caption tabular">
            Taxable {formatMoney(l.taxable_paise)} · GST {formatRate(l.tax_rate_bp)} {formatMoney(l.tax_paise)} · HSN{' '}
            {l.hsn_code || 'not set'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Totals({ sale }: { sale: Sale }) {
  return (
    <>
      <dl className="grid gap-1.5">
        <Amount label="Subtotal" paise={sale.subtotal_paise} />
        {sale.discount_paise > 0 && (
          <Amount
            label={sale.discount_approved_by_name ? `Discount (approved by ${sale.discount_approved_by_name})` : 'Discount'}
            paise={sale.discount_paise}
            negative
          />
        )}
        <Amount label="Taxable value" paise={sale.taxable_paise} />
        {sale.tax_breakdown.map((row) => (
          <div key={row.rate_bp} className="grid gap-1.5">
            <Amount label={`CGST ${formatRate(row.rate_bp / 2)} on ${formatMoney(row.taxable_paise)}`} paise={row.cgst_paise} />
            <Amount label={`SGST ${formatRate(row.rate_bp / 2)} on ${formatMoney(row.taxable_paise)}`} paise={row.sgst_paise} />
          </div>
        ))}
        <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
          <dt className="type-section">Total</dt>
          <dd className="tabular text-price font-bold text-ink">{formatMoney(sale.total_paise)}</dd>
        </div>
      </dl>
      <p className="mt-2 type-helper">
        {sale.prices_include_tax ? 'Listed prices included GST.' : 'GST was added to listed prices.'} GST is split equally
        into CGST and SGST for this intra-state sale.
      </p>
    </>
  )
}

function PaymentCard({ sale }: { sale: Sale }) {
  const { payment } = sale
  return (
    <Card aria-labelledby="payment-heading">
      <CardHeader id="payment-heading" title="Payment" />
      <CardBody className="grid gap-3">
        <Facts>
          <Fact label="Method" value={PAYMENT_LABELS[payment.method]} />
          <Fact label="Amount" value={<span className="tabular">{formatMoney(payment.amount_paise)}</span>} />
          {payment.method === 'cash' ? (
            <>
              {payment.tendered_paise != null && (
                <Fact label="Cash received" value={<span className="tabular">{formatMoney(payment.tendered_paise)}</span>} />
              )}
              <Fact label="Change given" value={<span className="tabular">{formatMoney(payment.change_paise)}</span>} />
            </>
          ) : (
            <Fact label="Reference" value={<span className="tabular break-all">{payment.reference}</span>} />
          )}
          <Fact label="Recorded" value={formatSaleTime(payment.recorded_at)} />
        </Facts>
        {isManuallyRecorded(payment.method) && (
          <InlineAlert tone="warning" title="Manually recorded">
            The cashier entered this {PAYMENT_LABELS[payment.method]} reference. It hasn’t been verified with a payment gateway or
            bank.
          </InlineAlert>
        )}
      </CardBody>
    </Card>
  )
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid gap-2.5">{children}</dl>
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-3">
      <dt className="type-helper">{label}</dt>
      <dd className="min-w-0 type-body break-words text-ink-2">{value}</dd>
    </div>
  )
}

function Amount({ label, paise, negative }: { label: string; paise: number; negative?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="min-w-0 type-body text-ink-3">{label}</dt>
      <dd className="tabular whitespace-nowrap type-body text-ink-2">
        {negative && '−'}
        {formatMoney(paise)}
      </dd>
    </div>
  )
}
