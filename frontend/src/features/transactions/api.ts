import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import { useRefreshAfterReturn } from '@/features/returns/api'
import type { Sale, SaleCashier, SalePage, SalesSummary } from '@/types/domain'

import { filterQuery, listQuery, rangeIsBackwards, type TransactionParams } from './transactionParams'

// The receipt and the transaction detail read the same saved sale, from the same cache entry.
export { useSale } from '@/features/billing/api'

// Retry only transient failures (network or 5xx), never 4xx answers.
const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

const toSearch = (query: Record<string, string>) => new URLSearchParams(query).toString()

/** Sales history, newest first. The server scopes it by role; this page is admin-only. */
export function useTransactions(params: TransactionParams) {
  const query = listQuery(params)
  return useQuery({
    queryKey: queryKeys.sales.list(query),
    queryFn: ({ signal }) => apiFetch<SalePage>(`/sales/?${toSearch(query)}`, { signal }),
    enabled: !rangeIsBackwards(params),
    // Keep the current page on screen while the next search or page loads.
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

/** The latest bills, newest first (mobile overview). */
export function useRecentSales(count: number) {
  const query = { page: '1', page_size: String(count) }
  return useQuery({
    queryKey: queryKeys.sales.list(query),
    queryFn: ({ signal }) => apiFetch<SalePage>(`/sales/?${toSearch(query)}`, { signal }),
    retry: retryTransient,
  })
}

/** Completed sales matching the same filters as the list (admin only). `enabled: false` waits, e.g. for the store's date. */
export function useSalesSummary(params: TransactionParams, { enabled = true }: { enabled?: boolean } = {}) {
  const query = filterQuery(params)
  return useQuery({
    queryKey: queryKeys.sales.summary(query),
    queryFn: ({ signal }) => apiFetch<SalesSummary>(`/sales/summary/?${toSearch(query)}`, { signal }),
    enabled: enabled && !rangeIsBackwards(params),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

/** Staff who have recorded a sale, for the cashier filter. Includes deactivated accounts. */
export function useSaleCashiers() {
  return useQuery({
    queryKey: queryKeys.sales.cashiers,
    queryFn: ({ signal }) => apiFetch<SaleCashier[]>('/sales/cashiers/', { signal }),
    staleTime: 5 * 60_000,
    retry: retryTransient,
  })
}

/**
 * Void today's bill made by mistake (Admin only; the server checks the role, the day and that nothing was
 * returned). Stock goes back, so everything a return refreshes refreshes too. Never optimistic; a 409 means
 * someone else voided it or recorded a return first, so the current state is fetched.
 */
export function useVoidSale(invoiceNo: string) {
  const refresh = useRefreshAfterReturn()
  return useMutation({
    mutationFn: (reason: string) => apiFetch<Sale>(`/sales/${encodeURIComponent(invoiceNo)}/void/`, { method: 'POST', body: { reason } }),
    onSuccess: refresh,
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) refresh()
    },
  })
}

/** Invoice numbers look like LD-000123; anything else is shown as not found without a request. */
export const isInvoiceNo = (value: string | undefined): value is string => !!value && /^[A-Z]{2,10}-\d{1,12}$/.test(value)
