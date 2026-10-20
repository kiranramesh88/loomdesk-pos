import { FileQuestion, Monitor } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { ReturnRecord } from '@/types/domain'

import { isReturnNo, useReturn } from '../api'
import { DISPOSITION_LABELS, formatSaleTime, isManuallyRecorded, PAYMENT_LABELS, REASON_LABELS, unitsLabel } from '../labels'
import { RefundTotals } from '../components/RefundTotals'

const back = { to: mobilePath('returns'), label: 'Returns' }

/** `/admin/mobile/returns/:returnNo`: a recorded return, read-only. */
export function MobileReturnPage() {
  const number = useParams().returnNo
  return isReturnNo(number) ? <LoadReturn number={number} /> : <Missing number={number ?? ''} />
}

function LoadReturn({ number }: { number: string }) {
  const ret = useReturn(number)
  if (ret.isPending) {
    return (
      <>
        <MobilePageHeader title={`Return ${number}`} back={back} />
        <Card role="status" aria-label="Loading return" className="p-4">
          <SkeletonText lines={6} />
        </Card>
      </>
    )
  }
  if (ret.isError) {
    if (ret.error instanceof ApiError && ret.error.status === 404) return <Missing number={number} />
    return (
      <>
        <MobilePageHeader title={`Return ${number}`} back={back} />
        <Card>
          <ErrorState title="This return couldn’t load" message={ret.error.message} onRetry={() => void ret.refetch()} retrying={ret.isFetching} />
        </Card>
      </>
    )
  }
  return <Detail ret={ret.data} />
}

function Missing({ number }: { number: string }) {
  return (
    <>
      <MobilePageHeader title="Return not found" back={back} />
      <Card>
        <EmptyState
          icon={<FileQuestion />}
          title="No return with that number"
          description={number ? `“${number.slice(0, 40)}” doesn’t match a recorded return.` : 'Check the return number.'}
        />
      </Card>
    </>
  )
}

function Detail({ ret }: { ret: ReturnRecord }) {
  useDocumentTitle(`Return ${ret.number}`)
  const units = ret.lines.reduce((sum, l) => sum + l.quantity, 0)
  const held = ret.lines.filter((l) => l.disposition === 'inspection').reduce((sum, l) => sum + l.quantity, 0)
  const { refund } = ret
  return (
    <>
      <MobilePageHeader
        title={`Return ${ret.number}`}
        description={`${unitsLabel(units)} · refund ${formatMoney(ret.total_paise)}`}
        back={back}
        actions={
          <ButtonLink to={`/admin/returns/${ret.number}`} size="lg" icon={<Monitor />}>
            Open in full admin
          </ButtonLink>
        }
      />
      <div className="grid gap-4">
        {held > 0 && (
          <InlineAlert tone="warning" title="Items on inspection hold">
            {unitsLabel(held)} {held === 1 ? 'is' : 'are'} on hold and not in stock. A stock adjustment naming {ret.number} puts them back if
            they’re sellable.
          </InlineAlert>
        )}
        <MobilePanel title="Return">
          <MobileFacts>
            <MobileFact label="Date & time">{formatSaleTime(ret.created_at)}</MobileFact>
            <MobileFact label="Original bill">
              <Link to={mobilePath(`bills/${ret.invoice_no}`)} className="tabular font-strong text-primary hover:underline">
                {ret.invoice_no}
              </Link>
            </MobileFact>
            <MobileFact label="Customer">Walk-in</MobileFact>
            <MobileFact label="Reason">{REASON_LABELS[ret.reason]}</MobileFact>
            {ret.note && <MobileFact label="Note">{ret.note}</MobileFact>}
            <MobileFact label="Recorded by">{ret.created_by_name}</MobileFact>
          </MobileFacts>
        </MobilePanel>
        <MobilePanel title="Items returned">
          <ul aria-label="Items returned" className="divide-y divide-line-soft border-t border-line-soft">
            {ret.lines.map((l) => {
              const went = DISPOSITION_LABELS[l.disposition]
              return (
                <li key={l.id} className="grid gap-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 type-body font-strong break-words text-ink-2">{l.product_name}</span>
                    <span className="type-amount">{formatMoney(l.total_paise)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 type-helper">
                    <span className="tabular">{l.variant_sku}</span>
                    <span>
                      {l.size} / {l.colour}
                    </span>
                    <span>
                      {l.quantity} of {l.sold_quantity} sold
                    </span>
                    <StatusBadge tone={went.tone}>{went.label}</StatusBadge>
                  </div>
                </li>
              )
            })}
          </ul>
        </MobilePanel>
        <MobilePanel title="Refund">
          <MobileFacts>
              <MobileFact label="Method">{PAYMENT_LABELS[refund.method]}</MobileFact>
              {refund.reference && (
                <MobileFact label="Reference">
                  <span className="tabular break-all">{refund.reference}</span>
                </MobileFact>
              )}
              <MobileFact label="Recorded">{`${formatSaleTime(refund.recorded_at)} by ${refund.recorded_by_name}`}</MobileFact>
          </MobileFacts>
          <div className="grid gap-3 px-4 pb-4">
            {isManuallyRecorded(refund.method) && (
              <InlineAlert tone="warning" title="Manually recorded">
                Staff entered this {PAYMENT_LABELS[refund.method]} refund. It hasn’t been verified with a payment gateway or bank.
              </InlineAlert>
            )}
            <RefundTotals figures={ret} />
          </div>
        </MobilePanel>
      </div>
    </>
  )
}
