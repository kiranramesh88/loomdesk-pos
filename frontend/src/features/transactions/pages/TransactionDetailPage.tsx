import { ArrowLeft, Printer } from 'lucide-react'

import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatMoney } from '@/lib/money'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { Sale } from '@/types/domain'

import { SaleGate } from '../components/SaleGate'
import { Fact, Facts, Lines, PaymentCard, Totals } from '../components/SaleSections'
import { formatSaleTime, itemsLabel, SALE_STATUS_LABELS } from '../labels'

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
