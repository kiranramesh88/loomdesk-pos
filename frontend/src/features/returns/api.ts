import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type { ReturnableSale, ReturnCreate, ReturnPage, ReturnQuote, ReturnRecord, ReturnRequest } from '@/types/domain'

import { listQuery, type ReturnParams } from './returnParams'

// Retry only transient failures (network or 5xx), never 4xx answers.
const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

export function useReturns(params: ReturnParams) {
  const query = listQuery(params)
  return useQuery({
    queryKey: queryKeys.returns.list(query),
    queryFn: ({ signal }) => apiFetch<ReturnPage>(`/returns/?${new URLSearchParams(query).toString()}`, { signal }),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

export function useReturn(number: string) {
  return useQuery({
    queryKey: queryKeys.returns.detail(number),
    queryFn: ({ signal }) => apiFetch<ReturnRecord>(`/returns/${encodeURIComponent(number)}/`, { signal }),
    // A recorded return never changes.
    staleTime: Infinity,
    retry: retryTransient,
  })
}

/** A bill's lines with what was sold, what already came back and what still can. */
export function useReturnableSale(invoiceNo: string | null) {
  return useQuery({
    queryKey: queryKeys.returns.returnable(invoiceNo ?? ''),
    queryFn: ({ signal }) => apiFetch<ReturnableSale>(`/returns/invoice/${encodeURIComponent(invoiceNo ?? '')}/`, { signal }),
    enabled: !!invoiceNo,
    retry: retryTransient,
  })
}

/** The server's refund for the chosen items. Nothing is saved. */
export function useReturnQuote() {
  return useMutation({
    mutationFn: (body: ReturnRequest) => apiFetch<ReturnQuote>('/returns/quote/', { method: 'POST', body }),
  })
}

/** Everything a return or void can change: the sale's state, returns, stock in every list, reports. */
export function useRefreshAfterReturn() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.returns.all })
    void client.invalidateQueries({ queryKey: queryKeys.reports.all })
    void client.invalidateQueries({ queryKey: queryKeys.sales.all })
    void client.invalidateQueries({ queryKey: queryKeys.inventory.all })
    void client.invalidateQueries({ queryKey: queryKeys.products.all })
    void client.invalidateQueries({ queryKey: queryKeys.billing.products })
  }
}

/**
 * Record the return. The key is made when the review step opens, so a retried or double submission
 * returns the first return instead of refunding twice. Never optimistic.
 */
export function useCreateReturn(key: string) {
  const client = useQueryClient()
  const refresh = useRefreshAfterReturn()
  return useMutation({
    mutationFn: (body: ReturnCreate) => apiFetch<ReturnRecord>('/returns/', { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
    // The response is the saved return, so its page opens without a second request.
    onSuccess: (ret) => {
      client.setQueryData(queryKeys.returns.detail(ret.number), ret)
      refresh()
    },
    // Something changed underneath (another return, a void): show the bill as it is now.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) refresh()
    },
  })
}

/** Return numbers look like RET-000012; anything else is shown as not found without a request. */
export const isReturnNo = (value: string | undefined): value is string => !!value && /^RET-\d{1,12}$/.test(value)
