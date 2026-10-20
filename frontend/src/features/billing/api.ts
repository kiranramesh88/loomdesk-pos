import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type {
  Approver,
  BillingCategory,
  BillingSettings,
  BillRequest,
  CheckoutRequest,
  Quote,
  Sale,
  SellableProductPage,
} from '@/types/domain'

// Retry only transient failures (network or 5xx), never 4xx answers.
const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

export const PAGE_SIZE = 48

export interface CatalogueFilter {
  q: string
  category: number | null
}

function productParams({ q, category }: CatalogueFilter, page = 1): Record<string, string> {
  const params: Record<string, string> = { page_size: String(PAGE_SIZE), page: String(page) }
  if (q.trim()) params.q = q.trim()
  if (category) params.category = String(category)
  return params
}

const fetchProductPage = (params: Record<string, string>, signal?: AbortSignal) =>
  apiFetch<SellableProductPage>(`/billing/products/?${new URLSearchParams(params)}`, { signal })

export function useBillingSettings() {
  return useQuery({
    queryKey: queryKeys.billing.settings,
    queryFn: ({ signal }) => apiFetch<BillingSettings>('/billing/settings/', { signal }),
    staleTime: 10 * 60_000,
    retry: retryTransient,
  })
}

export function useBillingCategories() {
  return useQuery({
    queryKey: queryKeys.billing.categories,
    queryFn: ({ signal }) => apiFetch<BillingCategory[]>('/billing/categories/', { signal }),
    staleTime: 10 * 60_000,
    retry: retryTransient,
  })
}

export function useApprovers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.billing.approvers,
    queryFn: ({ signal }) => apiFetch<Approver[]>('/billing/approvers/', { signal }),
    enabled,
    staleTime: 5 * 60_000,
    retry: retryTransient,
  })
}

/** Sellable products, a page at a time. Stock is kept for 30 s (plan §6.3); a sale refetches it. */
export function useSellableProducts(filter: CatalogueFilter) {
  const base = productParams(filter)
  return useInfiniteQuery({
    queryKey: queryKeys.billing.productList(base),
    queryFn: ({ pageParam, signal }) => fetchProductPage(productParams(filter, pageParam), signal),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: retryTransient,
  })
}

/** First page for an exact search, from the cache when fresh. Used when a barcode scan presses Enter. */
export function fetchProductsNow(client: QueryClient, q: string) {
  const params = productParams({ q, category: null })
  return client.fetchInfiniteQuery({
    queryKey: queryKeys.billing.productList(params),
    queryFn: ({ signal }) => fetchProductPage(params, signal),
    initialPageParam: 1,
    staleTime: 30_000,
  })
}

/** The server's price, discount and GST for the current bill. The bill panel shows only these. */
export function useQuote(bill: BillRequest) {
  return useQuery({
    queryKey: queryKeys.billing.quote(bill),
    queryFn: ({ signal }) => apiFetch<Quote>('/sales/quote/', { method: 'POST', body: bill, signal }),
    enabled: bill.lines.length > 0,
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

export interface CheckoutVariables {
  body: CheckoutRequest
  idempotencyKey: string
}

/**
 * Complete the sale. Never retried automatically: the cashier retries, with the same key, so a
 * lost response can't create a second sale. No optimistic updates; stock and lists refetch.
 */
export function useCheckout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: CheckoutVariables) =>
      apiFetch<Sale>('/sales/', { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
    onSuccess: (sale) => {
      client.setQueryData(queryKeys.sales.detail(sale.invoice_no), sale)
      // A sale changes stock in the till's catalogue and the admin catalogue. Transactions,
      // inventory and reports join this list when those modules exist.
      void client.invalidateQueries({ queryKey: queryKeys.billing.products })
      void client.invalidateQueries({ queryKey: queryKeys.products.all })
    },
    onError: (error) => {
      // Prices, stock or availability moved since the quote: re-price the bill and refresh stock.
      if (error instanceof ApiError && (error.status === 409 || error.status === 400)) {
        void client.invalidateQueries({ queryKey: queryKeys.billing.quotes })
        void client.invalidateQueries({ queryKey: queryKeys.billing.products })
      }
    },
  })
}

export function useSale(invoiceNo: string) {
  return useQuery({
    queryKey: queryKeys.sales.detail(invoiceNo),
    queryFn: ({ signal }) => apiFetch<Sale>(`/sales/${encodeURIComponent(invoiceNo)}/`, { signal }),
    // A saved sale never changes.
    staleTime: Infinity,
    retry: retryTransient,
  })
}
