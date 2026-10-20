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
  /** Where "not found" sends the reader back to; the mobile admin passes its own bills list. */
  listPath?: string
  /** Wraps the loading, missing and error states, e.g. in a page header with a back link. */
  frame?: (state: ReactNode) => ReactNode
}

const unframed = (state: ReactNode) => state

/**
 * Loads the saved sale named in the URL and renders the not-found, error and loading states
 * shared by the transaction detail and its receipt. Malformed invoice numbers never hit the API.
 */
export function SaleGate({ loading, children, listPath = DEFAULT_LIST, frame = unframed }: SaleGateProps) {
  const invoiceNo = useParams().invoiceNo
  if (!isInvoiceNo(invoiceNo)) return frame(<TransactionMissing invoiceNo={invoiceNo ?? ''} listPath={listPath} />)
  return (
    <LoadSale invoiceNo={invoiceNo} loading={loading} listPath={listPath} frame={frame}>
      {children}
    </LoadSale>
  )
}

const DEFAULT_LIST = '/admin/transactions'

function LoadSale({ invoiceNo, loading, children, listPath, frame = unframed }: SaleGateProps & { invoiceNo: string }) {
  const sale = useSale(invoiceNo)
  if (sale.isPending) return frame(loading)
  if (sale.isError) {
    if (sale.error instanceof ApiError && sale.error.status === 404) return frame(<TransactionMissing invoiceNo={invoiceNo} listPath={listPath} />)
    return frame(
      <Card>
        <ErrorState
          title="This transaction couldn’t load"
          message={sale.error.message}
          onRetry={() => void sale.refetch()}
          retrying={sale.isFetching}
        />
      </Card>,
    )
  }
  return children(sale.data)
}

export function TransactionMissing({ invoiceNo, listPath = DEFAULT_LIST }: { invoiceNo: string; listPath?: string }) {
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
        action={<ButtonLink to={listPath}>Back to transactions</ButtonLink>}
      />
    </Card>
  )
}
