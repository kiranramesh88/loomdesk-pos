import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Fact, Facts } from '@/features/transactions/components/SaleSections'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { ReturnLineRecord, ReturnRecord } from '@/types/domain'

import { isReturnNo, useReturn } from '../api'
import { RefundTotals } from '../components/RefundTotals'
import { DISPOSITION_LABELS, formatSaleTime, isManuallyRecorded, PAYMENT_LABELS, REASON_LABELS, unitsLabel } from '../labels'

const backLink = (
  <ButtonLink to="/admin/returns" variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-3 mb-2">
    Returns
  </ButtonLink>
)

/** `/admin/returns/:returnNo`: a recorded return, its refund and where each item went. */
export function ReturnDetailPage() {
  const number = useParams().returnNo
  return (
    <>
      {backLink}
      {isReturnNo(number) ? <LoadReturn number={number} /> : <ReturnMissing number={number ?? ''} />}
    </>
  )
}

function LoadReturn({ number }: { number: string }) {
  const ret = useReturn(number)
  if (ret.isPending) {
    return (
      <div role="status" aria-label="Loading return" className="grid gap-4">
        <Skeleton className="h-7 w-56" />
        <Card>
          <CardBody className="pt-5">
            <SkeletonText lines={5} />
          </CardBody>
        </Card>
      </div>
    )
  }
  if (ret.isError) {
    if (ret.error instanceof ApiError && ret.error.status === 404) return <ReturnMissing number={number} />
    return (
      <Card>
        <ErrorState title="This return couldn’t load" message={ret.error.message} onRetry={() => void ret.refetch()} retrying={ret.isFetching} />
      </Card>
    )
  }
  return <ReturnDetail ret={ret.data} />
}

function ReturnMissing({ number }: { number: string }) {
  return (
    <Card>
      <EmptyState
        icon={<FileQuestion />}
        title="No return with that number"
        description={number ? `“${number.slice(0, 40)}” doesn’t match a recorded return.` : 'Check the return number.'}
        action={<ButtonLink to="/admin/returns">Back to returns</ButtonLink>}
      />
    </Card>
  )
}

const LINE_COLUMNS: Column<ReturnLineRecord>[] = [
  {
    id: 'item',
    header: 'Item',
    cell: (l) => (
      <div className="min-w-0">
        <div className="font-strong break-words text-ink-2">{l.product_name}</div>
        <div className="type-helper">
          {l.size} · {l.colour} · {l.variant_sku}
        </div>
      </div>
    ),
  },
  {
    id: 'qty',
    header: 'Returned',
    align: 'right',
    width: '110px',
    cell: (l) => (
      <span className="tabular">
        {l.quantity} of {l.sold_quantity}
      </span>
    ),
  },
  {
    id: 'went',
    header: 'Where it went',
    width: '160px',
    cell: (l) => <StatusBadge tone={DISPOSITION_LABELS[l.disposition].tone}>{DISPOSITION_LABELS[l.disposition].label}</StatusBadge>,
  },
  {
    id: 'discount',
    header: 'Discount share',
    align: 'right',
    width: '130px',
    cell: (l) => <span className="tabular">{l.discount_paise ? `−${formatMoney(l.discount_paise)}` : '—'}</span>,
  },
  { id: 'gst', header: 'GST', align: 'right', width: '110px', cell: (l) => <span className="tabular">{formatMoney(l.tax_paise)}</span> },
  { id: 'refund', header: 'Refund', align: 'right', width: '130px', cell: (l) => <span className="type-amount">{formatMoney(l.total_paise)}</span> },
]

function ReturnDetail({ ret }: { ret: ReturnRecord }) {
  useDocumentTitle(`Return ${ret.number}`)
  const units = ret.lines.reduce((sum, l) => sum + l.quantity, 0)
  const restocked = ret.lines.filter((l) => l.disposition === 'sellable').reduce((sum, l) => sum + l.quantity, 0)
  const held = ret.lines.filter((l) => l.disposition === 'inspection').reduce((sum, l) => sum + l.quantity, 0)
  const { refund } = ret
  return (
    <>
      <PageHeader
        title={`Return ${ret.number}`}
        description={`${formatSaleTime(ret.created_at)} · ${unitsLabel(units)} · refund ${formatMoney(ret.total_paise)}`}
        actions={<ButtonLink to={`/admin/transactions/${ret.invoice_no}`}>Open {ret.invoice_no}</ButtonLink>}
      />
      {held > 0 && (
        <InlineAlert tone="warning" title="Items on inspection hold" className="mb-5">
          {unitsLabel(held)} from this return {held === 1 ? 'is' : 'are'} on hold and not in stock. If they turn out to be sellable,
          add them back with a stock adjustment that names {ret.number}.
        </InlineAlert>
      )}
      <div className="grid gap-4 lg:gap-5">
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:gap-5">
          <Card aria-labelledby="return-heading">
            <CardHeader id="return-heading" title="Return" />
            <CardBody>
              <Facts>
                <Fact label="Return no." value={<span className="tabular">{ret.number}</span>} />
                <Fact label="Date & time" value={formatSaleTime(ret.created_at)} />
                <Fact label="Recorded by" value={ret.created_by_name} />
                <Fact
                  label="Original bill"
                  value={
                    <Link to={`/admin/transactions/${ret.invoice_no}`} className="tabular text-primary hover:underline">
                      {ret.invoice_no}
                    </Link>
                  }
                />
                <Fact label="Sold on" value={formatSaleTime(ret.sale_created_at)} />
                <Fact label="Customer" value="Walk-in" />
                <Fact label="Reason" value={REASON_LABELS[ret.reason]} />
                {ret.note && <Fact label="Note" value={ret.note} />}
                <Fact label="Stock" value={restocked ? `${unitsLabel(restocked)} back into stock` : 'No stock change'} />
              </Facts>
            </CardBody>
          </Card>
          <Card aria-labelledby="refund-heading">
            <CardHeader id="refund-heading" title="Refund" />
            <CardBody className="grid gap-3">
              <Facts>
                <Fact label="Method" value={PAYMENT_LABELS[refund.method]} />
                <Fact label="Amount" value={<span className="tabular">{formatMoney(refund.amount_paise)}</span>} />
                {refund.reference && <Fact label="Reference" value={<span className="tabular break-all">{refund.reference}</span>} />}
                <Fact label="Recorded" value={`${formatSaleTime(refund.recorded_at)} by ${refund.recorded_by_name}`} />
              </Facts>
              {isManuallyRecorded(refund.method) ? (
                <InlineAlert tone="warning" title="Manually recorded">
                  Staff entered this {PAYMENT_LABELS[refund.method]} refund reference. It hasn’t been verified with a payment
                  gateway or bank.
                </InlineAlert>
              ) : (
                <p className="type-helper">Cash handed back at the counter, as recorded by staff.</p>
              )}
            </CardBody>
          </Card>
        </div>
        <Card aria-labelledby="lines-heading">
          <CardHeader
            id="lines-heading"
            title="Items returned"
            description="Refunds come from what the customer paid for each item, including its share of the bill discount."
          />
          <DataTable caption="Items returned" columns={LINE_COLUMNS} rows={ret.lines} getRowId={(l) => l.id} empty={null} minWidth="720px" />
        </Card>
        <Card aria-labelledby="refund-totals-heading">
          <CardHeader id="refund-totals-heading" title="Refund breakdown" />
          <CardBody>
            <RefundTotals figures={ret} />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
