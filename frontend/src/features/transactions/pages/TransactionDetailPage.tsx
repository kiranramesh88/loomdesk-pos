import { ArrowLeft, Ban, Printer, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/toastContext'
import { useStore } from '@/features/store/api'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { Sale } from '@/types/domain'

import { useVoidSale } from '../api'
import { SaleGate } from '../components/SaleGate'
import { Fact, Facts, Lines, PaymentCard, Totals } from '../components/SaleSections'
import { SaleStatusBadges } from '../components/SaleStatus'
import { formatSaleTime, itemsLabel, storeDateOf } from '../labels'

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
  const today = useStore().data?.today
  const [voiding, setVoiding] = useState(false)
  const units = sale.lines.reduce((sum, line) => sum + line.quantity, 0)
  const completed = sale.status === 'completed'
  const canReturn = completed && sale.return_state !== 'returned'
  // The server decides (decision D2: today's bills with no returns); this only hides an action it would refuse.
  const canVoid = completed && sale.returns.length === 0 && !!today && storeDateOf(sale.created_at) === today
  return (
    <>
      <PageHeader
        title={`Invoice ${sale.invoice_no}`}
        description={`${formatSaleTime(sale.created_at)} · ${itemsLabel(units)} · ${formatMoney(sale.total_paise)}`}
        actions={
          <>
            {canVoid && (
              <Button icon={<Ban />} onClick={() => setVoiding(true)}>
                Void bill
              </Button>
            )}
            {canReturn && (
              <ButtonLink to={`/admin/returns/new?invoice=${encodeURIComponent(sale.invoice_no)}`} icon={<Undo2 />}>
                Return items
              </ButtonLink>
            )}
            <ButtonLink to="receipt" variant="primary" icon={<Printer />}>
              Reprint receipt
            </ButtonLink>
          </>
        }
      />
      {sale.status === 'voided' && (
        <InlineAlert tone="danger" title="This bill was voided" className="mb-5">
          Voided by {sale.voided_by_name ?? 'staff'}
          {sale.voided_at && ` on ${formatSaleTime(sale.voided_at)}`}: {sale.void_reason}. Its stock was put back, and it
          doesn’t count as a sale. The figures below are what the bill showed.
        </InlineAlert>
      )}
      <VoidDialog sale={sale} open={voiding} onOpenChange={setVoiding} />
      {/* Invoice layout: who, how paid and where on top; then the lines and totals at full width. */}
      <div className="grid gap-4 lg:gap-5">
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <Card aria-labelledby="bill-heading">
            <CardHeader
              id="bill-heading"
              title="Bill"
              actions={<SaleStatusBadges status={sale.status} returnState={sale.return_state} />}
            />
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
        <ReturnsCard sale={sale} />
      </div>
    </>
  )
}

function ReturnsCard({ sale }: { sale: Sale }) {
  const units = sale.lines.reduce((sum, l) => sum + l.quantity, 0)
  return (
    <Card aria-labelledby="returns-heading">
      <CardHeader
        id="returns-heading"
        title="Returns"
        description="Each return is its own record with its own refund; a return never changes this bill."
      />
      <CardBody>
        {sale.returns.length === 0 ? (
          <p className="type-body text-ink-3">Nothing from this bill has been returned.</p>
        ) : (
          <>
            <ul className="divide-y divide-line-soft">
              {sale.returns.map((r) => (
                <li key={r.number} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                  <Link to={`/admin/returns/${r.number}`} className="font-strong text-ink-2 tabular hover:text-primary hover:underline">
                    {r.number}
                  </Link>
                  <span className="type-helper tabular">{formatSaleTime(r.created_at)}</span>
                  <span className="type-amount">Refund {formatMoney(r.total_paise)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 type-helper tabular">
              {sale.returned_units} of {units} units returned · {formatMoney(sale.refunded_paise)} refunded
            </p>
          </>
        )}
      </CardBody>
    </Card>
  )
}

function VoidDialog({ sale, open, onOpenChange }: { sale: Sale; open: boolean; onOpenChange: (open: boolean) => void }) {
  const voidSale = useVoidSale(sale.invoice_no)
  const { toast } = useToast()
  const units = sale.lines.reduce((sum, line) => sum + line.quantity, 0)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Void ${sale.invoice_no}?`}
      tone="danger"
      confirmLabel="Void bill"
      pendingLabel="Voiding…"
      reasonLabel="Reason for voiding"
      description={
        <>
          The bill stops counting as a sale and its {itemsLabel(units)} go back into stock. The bill and its{' '}
          {formatMoney(sale.total_paise)} payment record are kept, marked voided, with your name and the reason. Give back
          any money taken separately. This can’t be undone.
        </>
      }
      onConfirm={async (reason) => {
        try {
          await voidSale.mutateAsync(reason)
        } catch (error) {
          if (error instanceof ApiError && error.status === 0) {
            throw new Error('The server couldn’t be reached, so the bill wasn’t voided. Check the connection and try again.', { cause: error })
          }
          throw error
        }
        toast({ tone: 'success', title: `${sale.invoice_no} voided`, description: 'Its stock was put back.' })
      }}
    />
  )
}
