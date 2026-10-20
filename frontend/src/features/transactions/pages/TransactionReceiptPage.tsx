import { ArrowLeft, Printer } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { SkeletonText } from '@/components/ui/Skeleton'
import { Paper, Receipt } from '@/features/billing/components/Receipt'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { Sale } from '@/types/domain'

import { SaleGate } from '../components/SaleGate'

/**
 * `/admin/transactions/:invoiceNo/receipt`: reprint the saved receipt, in the same design the
 * till prints. Reading a sale never writes anything, so reprinting can't change it or its stock.
 */
export function TransactionReceiptPage() {
  return (
    <div className="mx-auto w-full max-w-[460px] print:max-w-[90mm]">
      <SaleGate
        loading={
          <Paper>
            <div role="status" aria-label="Loading receipt">
              <SkeletonText lines={6} />
            </div>
          </Paper>
        }
      >
        {(sale) => <Reprint sale={sale} />}
      </SaleGate>
    </div>
  )
}

function Reprint({ sale }: { sale: Sale }) {
  useDocumentTitle(`Receipt ${sale.invoice_no}`)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <ButtonLink to=".." relative="path" icon={<ArrowLeft />}>
          Back to {sale.invoice_no}
        </ButtonLink>
        <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
          Print receipt
        </Button>
      </div>
      <p className="mb-4 type-helper print:hidden">A copy of the saved receipt. Printing it doesn’t change the sale or stock.</p>
      <Receipt sale={sale} />
    </>
  )
}
