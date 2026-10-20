import { ArrowLeft, FileQuestion, Printer } from 'lucide-react'
import { useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { ApiError } from '@/lib/http'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

import { useSale } from '../api'
import { Paper, Receipt } from '../components/Receipt'

/** `/billing/receipt/:invoiceNo` — the saved sale as a printable receipt (plan §2, §7). */
export function ReceiptPage() {
  const invoiceNo = useParams().invoiceNo ?? ''
  const sale = useSale(invoiceNo)
  useDocumentTitle(`Receipt ${invoiceNo}`)

  return (
    <div className="mx-auto w-full max-w-[460px] px-3 py-5 sm:py-8 print:max-w-[90mm] print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <ButtonLink to="/billing" icon={<ArrowLeft />}>
          Back to billing
        </ButtonLink>
        {sale.data && (
          <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
            Print receipt
          </Button>
        )}
      </div>

      {sale.isPending ? (
        <Paper>
          <div role="status" aria-label="Loading receipt" className="grid gap-4">
            <Skeleton className="mx-auto h-5 w-40" />
            <SkeletonText lines={3} />
            <SkeletonText lines={4} />
          </div>
        </Paper>
      ) : sale.isError ? (
        <Paper>
          {sale.error instanceof ApiError && sale.error.status === 404 ? (
            <EmptyState
              icon={<FileQuestion />}
              title={`No receipt for ${invoiceNo}`}
              description="Check the invoice number. Cashiers can open receipts for their own sales only."
            />
          ) : (
            <ErrorState title="The receipt couldn’t load" message={sale.error.message} onRetry={() => void sale.refetch()} retrying={sale.isFetching} />
          )}
        </Paper>
      ) : (
        <Receipt sale={sale.data} />
      )}
    </div>
  )
}
