import { useMemo } from 'react'

import { ApiError } from '@/lib/http'
import type { Quote, QuoteLine } from '@/types/domain'

import { useQuote } from './api'
import { toBillRequest, type BillState } from './bill'

export interface BillQuote {
  /** The server's figures for this exact bill, or the previous bill's while a new quote loads. */
  quote: Quote | undefined
  /** True only when `quote` matches the bill as it is now. Payment needs a current quote. */
  current: boolean
  loading: boolean
  lineFor: (variantId: number) => QuoteLine | undefined
  /** Per-line problems from the server (stock, items no longer sold), keyed by variant id. */
  lineErrors: Record<number, string>
  discountError: string | null
  /** A failure that isn't about one line or the discount (network, server). */
  error: ApiError | null
  retry: () => void
  canPay: boolean
}

export function useBillQuote(bill: BillState): BillQuote {
  const request = useMemo(() => toBillRequest(bill), [bill])
  const query = useQuote(request)
  const apiError = query.error instanceof ApiError ? query.error : null

  return useMemo(() => {
    const lineErrors: Record<number, string> = {}
    let discountError: string | null = null
    let error: ApiError | null = null
    if (apiError && !query.isFetching) {
      for (const [path, messages] of Object.entries(apiError.fields)) {
        const line = /^lines\.(\d+)\./.exec(path)
        const variantId = line ? request.lines[Number(line[1])]?.variant : undefined
        const message = messages[0] ?? 'This item can’t be sold as it is.'
        if (variantId !== undefined) lineErrors[variantId] = message
        else if (path.startsWith('discount')) discountError = message
      }
      if (!Object.keys(lineErrors).length && !discountError) error = apiError
    }

    const current = !!query.data && !query.isPlaceholderData && !query.isFetching && !query.isError
    const byVariant = new Map((query.data?.lines ?? []).map((line) => [line.variant, line]))
    return {
      quote: request.lines.length ? query.data : undefined,
      current,
      loading: request.lines.length > 0 && query.isPending,
      lineFor: (variantId: number) => byVariant.get(variantId),
      lineErrors,
      discountError,
      error,
      retry: () => void query.refetch(),
      canPay: request.lines.length > 0 && current,
    }
  }, [apiError, query, request])
}
