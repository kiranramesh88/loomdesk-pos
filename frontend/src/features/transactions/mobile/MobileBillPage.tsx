import { Printer } from 'lucide-react'

import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { formatMoney } from '@/lib/money'
import type { Sale } from '@/types/domain'

import { SaleGate } from '../components/SaleGate'
import { Lines, PaymentCard, Totals } from '../components/SaleSections'
import { formatSaleTime, itemsLabel, SALE_STATUS_LABELS } from '../labels'

const BILLS = mobilePath('bills')
const back = { to: BILLS, label: 'Bills' }

function BillSkeleton() {
  return (
    <Card role="status" aria-label="Loading bill" className="p-4">
      <SkeletonText lines={6} />
    </Card>
  )
}

function Bill({ sale }: { sale: Sale }) {
  const status = SALE_STATUS_LABELS[sale.status]
  const units = sale.lines.reduce((sum, line) => sum + line.quantity, 0)
  return (
    <>
      <MobilePageHeader
        title={`Invoice ${sale.invoice_no}`}
        description={`${itemsLabel(units)} · ${formatMoney(sale.total_paise)}`}
        back={back}
        actions={
          <ButtonLink to="receipt" variant="primary" size="lg" icon={<Printer />}>
            Reprint receipt
          </ButtonLink>
        }
      />
      <div className="grid gap-4">
        <MobilePanel title="Bill">
          <MobileFacts>
            <MobileFact label="Status">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </MobileFact>
            <MobileFact label="Date & time">{formatSaleTime(sale.created_at)}</MobileFact>
            <MobileFact label="Cashier">{sale.cashier_name}</MobileFact>
            {sale.discount_approved_by_name && <MobileFact label="Discount approved by">{sale.discount_approved_by_name}</MobileFact>}
          </MobileFacts>
        </MobilePanel>
        <PaymentCard sale={sale} />
        <Card aria-labelledby="items-heading">
          <CardHeader id="items-heading" title="Items sold" description="As saved at the time of sale." />
          <Lines lines={sale.lines} />
        </Card>
        <MobilePanel title="Totals and tax">
          <div className="px-4 pb-4">
            <Totals sale={sale} />
          </div>
        </MobilePanel>
        <MobilePanel title="Store" description="As printed on this receipt.">
          <MobileFacts>
            <MobileFact label="Name">
              {sale.store.name} ({sale.store.code})
            </MobileFact>
            <MobileFact label="GSTIN">{sale.store.gstin || 'Not recorded'}</MobileFact>
          </MobileFacts>
        </MobilePanel>
      </div>
    </>
  )
}

/** `/admin/mobile/bills/:invoiceNo`: the saved sale. Read-only: nothing here writes to the server. */
export function MobileBillPage() {
  return (
    <SaleGate
      listPath={BILLS}
      loading={<BillSkeleton />}
      frame={(state) => (
        <>
          <MobilePageHeader title="Bill" back={back} />
          {state}
        </>
      )}
    >
      {(sale) => <Bill sale={sale} />}
    </SaleGate>
  )
}
