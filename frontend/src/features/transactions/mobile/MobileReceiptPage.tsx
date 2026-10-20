import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { Paper, Receipt } from '@/features/billing/components/Receipt'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobilePageHeader } from '@/layouts/mobile/MobilePage'
import type { Sale } from '@/types/domain'

import { SaleGate } from '../components/SaleGate'

function Reprint({ sale }: { sale: Sale }) {
  return (
    <>
      <div className="print:hidden">
        <MobilePageHeader
          title="Receipt"
          description="A copy of the saved receipt. Printing it doesn’t change the sale or stock."
          back={{ to: mobilePath(`bills/${sale.invoice_no}`), label: sale.invoice_no }}
          actions={
            <Button variant="primary" size="lg" icon={<Printer />} onClick={() => window.print()}>
              Print receipt
            </Button>
          }
        />
      </div>
      <Receipt sale={sale} />
    </>
  )
}

/** `/admin/mobile/bills/:invoiceNo/receipt`: reprint in the till's receipt design. Reading a sale never writes. */
export function MobileReceiptPage() {
  return (
    <div className="mx-auto w-full max-w-[460px] print:max-w-[90mm]">
      <SaleGate
        listPath={mobilePath('bills')}
        frame={(state) => (
          <>
            <MobilePageHeader title="Receipt" back={{ to: mobilePath('bills'), label: 'Bills' }} />
            {state}
          </>
        )}
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
