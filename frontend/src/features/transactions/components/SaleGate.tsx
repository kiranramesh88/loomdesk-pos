import { FileQuestion } from 'lucide-react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { ApiError } from '@/lib/http'
import type { Sale } from '@/types/domain'

import { isInvoiceNo, useSale } from '../api'

interface SaleGateProps {
  /** Shown while the sale loads. */
  loading: ReactNode
  children: (sale: Sale) => ReactNode
}

/**
 * Loads the saved sale named in the URL and renders the not-found, error and loading states
 * shared by the transaction detail and its receipt. Malformed invoice numbers never hit the API.
 */
export function SaleGate({ loading, children }: SaleGateProps) {
  const invoiceNo = useParams().invoiceNo
  if (!isInvoiceNo(invoiceNo)) return <TransactionMissing invoiceNo={invoiceNo ?? ''} />
  return (
    <LoadSale invoiceNo={invoiceNo} loading={loading}>
      {children}
    </LoadSale>
  )
}

function LoadSale({ invoiceNo, loading, children }: SaleGateProps & { invoiceNo: string }) {
  const sale = useSale(invoiceNo)
  if (sale.isPending) return loading
  if (sale.isError) {
    if (sale.error instanceof ApiError && sale.error.status === 404) return <TransactionMissing invoiceNo={invoiceNo} />
    return (
      <Card>
        <ErrorState
          title="This transaction couldn’t load"
          message={sale.error.message}
          onRetry={() => void sale.refetch()}
          retrying={sale.isFetching}
        />
      </Card>
    )
  }
  return children(sale.data)
}

export function TransactionMissing({ invoiceNo }: { invoiceNo: string }) {
  return (
    <Card>
      <EmptyState
        icon={<FileQuestion />}
        title="No transaction with that invoice number"
        description={
          invoiceNo
            ? `“${invoiceNo.slice(0, 40)}” doesn’t match a saved bill. Check the number, or search the transactions list.`
            : 'Check the invoice number, or search the transactions list.'
        }
        action={<ButtonLink to="/admin/transactions">Back to transactions</ButtonLink>}
      />
    </Card>
  )
}
