import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type {
  InventoryPage,
  Purchase,
  PurchaseLineInput,
  PurchaseListPage,
  PurchaseQuote,
  PurchaseStatus,
  PurchaseWrite,
  SupplierDetail,
  SupplierPage,
  SupplierPayment,
  SupplierPaymentPage,
  SupplierPaymentWrite,
  SupplierStatement,
  SupplierWrite,
} from '@/types/domain'

import { listQuery, PURCHASE_PAGE_SIZE, type SupplierParams } from './supplierParams'

// Retry only transient failures (network or 5xx), never 4xx answers.
const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

const toSearch = (query: Record<string, string>) => new URLSearchParams(query).toString()

export function useSuppliers(params: SupplierParams) {
  const query = listQuery(params)
  return useQuery({
    queryKey: queryKeys.suppliers.list(query),
    queryFn: ({ signal }) => apiFetch<SupplierPage>(`/suppliers/?${toSearch(query)}`, { signal }),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

export function useSupplierCategories() {
  return useQuery({
    queryKey: queryKeys.suppliers.categories,
    queryFn: ({ signal }) => apiFetch<string[]>('/suppliers/categories/', { signal }),
    retry: retryTransient,
  })
}

export function useSupplier(id: number | null) {
  return useQuery({
    queryKey: queryKeys.suppliers.detail(id ?? 0),
    queryFn: ({ signal }) => apiFetch<SupplierDetail>(`/suppliers/${id}/`, { signal }),
    enabled: id !== null,
    retry: retryTransient,
  })
}

export function useSupplierPurchases(id: number, page: number, status: PurchaseStatus | '') {
  const query: Record<string, string> = { page: String(page), page_size: String(PURCHASE_PAGE_SIZE) }
  if (status) query.status = status
  return useQuery({
    queryKey: queryKeys.suppliers.purchases(id, query),
    queryFn: ({ signal }) => apiFetch<PurchaseListPage>(`/suppliers/${id}/purchases/?${toSearch(query)}`, { signal }),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

/** Purchases from every supplier, newest first; filter by status and search number, invoice or supplier. */
export function useAllPurchases(params: { q: string; status: PurchaseStatus | ''; page: number }) {
  const query: Record<string, string> = { page: String(params.page), page_size: String(PURCHASE_PAGE_SIZE) }
  if (params.q) query.q = params.q
  if (params.status) query.status = params.status
  return useQuery({
    queryKey: queryKeys.suppliers.allPurchases(query),
    queryFn: ({ signal }) => apiFetch<PurchaseListPage>(`/suppliers/purchases/?${toSearch(query)}`, { signal }),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

/** Payments recorded by staff for one supplier, newest first. None is gateway- or bank-verified. */
export function useSupplierPayments(id: number, page: number) {
  const query = { page: String(page), page_size: String(PURCHASE_PAGE_SIZE) }
  return useQuery({
    queryKey: queryKeys.suppliers.payments(id, query),
    queryFn: ({ signal }) => apiFetch<SupplierPaymentPage>(`/suppliers/${id}/payments/?${toSearch(query)}`, { signal }),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

export function useSupplierStatement(id: number) {
  return useQuery({
    queryKey: queryKeys.suppliers.statement(id),
    queryFn: ({ signal }) => apiFetch<SupplierStatement>(`/suppliers/${id}/statement/`, { signal }),
    retry: retryTransient,
  })
}

export function usePurchase(number: string | null) {
  return useQuery({
    queryKey: queryKeys.suppliers.purchase(number ?? ''),
    queryFn: ({ signal }) => apiFetch<Purchase>(`/suppliers/purchases/${number}/`, { signal }),
    enabled: number !== null,
    retry: retryTransient,
  })
}

/** The server's totals for the lines being entered; the browser never does GST maths. */
export function usePurchaseQuote(lines: PurchaseLineInput[]) {
  return useQuery({
    queryKey: queryKeys.suppliers.quote(lines),
    queryFn: ({ signal }) => apiFetch<PurchaseQuote>('/suppliers/purchases/quote/', { method: 'POST', body: { lines }, signal }),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

function useRefreshSuppliers() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: queryKeys.suppliers.all })
}

export function useCreateSupplier() {
  const refresh = useRefreshSuppliers()
  return useMutation({
    mutationFn: (body: SupplierWrite) => apiFetch<SupplierDetail>('/suppliers/', { method: 'POST', body }),
    onSuccess: refresh,
  })
}

export function useUpdateSupplier(id: number) {
  const refresh = useRefreshSuppliers()
  return useMutation({
    mutationFn: (body: Partial<SupplierWrite>) => apiFetch<SupplierDetail>(`/suppliers/${id}/`, { method: 'PATCH', body }),
    onSuccess: refresh,
  })
}

/**
 * Record a purchase. The key is made when the form opens, so a retried or double submission
 * returns the first purchase instead of recording a second one. Stock doesn't change yet.
 */
export function useRecordPurchase(supplierId: number, key: string) {
  const refresh = useRefreshSuppliers()
  return useMutation({
    mutationFn: (body: PurchaseWrite) =>
      apiFetch<Purchase>(`/suppliers/${supplierId}/purchases/`, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
    onSuccess: refresh,
  })
}

export function useUpdatePurchase(number: string) {
  const refresh = useRefreshSuppliers()
  return useMutation({
    mutationFn: (body: PurchaseWrite) => apiFetch<Purchase>(`/suppliers/purchases/${number}/`, { method: 'PUT', body }),
    onSuccess: refresh,
  })
}

/** Receive the goods. Stock changes, so inventory and both catalogues refetch too. Never optimistic. */
export function useReceivePurchase(number: string) {
  const client = useQueryClient()
  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.suppliers.all })
    void client.invalidateQueries({ queryKey: queryKeys.inventory.all })
    void client.invalidateQueries({ queryKey: queryKeys.reports.all })
    void client.invalidateQueries({ queryKey: queryKeys.products.all })
    void client.invalidateQueries({ queryKey: queryKeys.billing.products })
  }
  return useMutation({
    mutationFn: () => apiFetch<Purchase>(`/suppliers/purchases/${number}/receive/`, { method: 'POST' }),
    onSuccess: refresh,
    // A 409 means another submission already received (or closed) it: show the current state.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) refresh()
    },
  })
}

export function useCancelPurchase(number: string) {
  const refresh = useRefreshSuppliers()
  return useMutation({
    mutationFn: (reason: string) => apiFetch<Purchase>(`/suppliers/purchases/${number}/cancel/`, { method: 'POST', body: { reason } }),
    onSuccess: refresh,
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) void refresh()
    },
  })
}

export function useRecordPayment(supplierId: number, key: string) {
  const refresh = useRefreshSuppliers()
  return useMutation({
    mutationFn: (body: SupplierPaymentWrite) =>
      apiFetch<SupplierPayment>(`/suppliers/${supplierId}/payments/`, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
    onSuccess: refresh,
  })
}

/** Sellable variants matching a search, for adding lines to a purchase. Reuses the inventory list. */
export function useVariantSearch(q: string) {
  const query = { q, status: 'active', page: '1', page_size: '8', ordering: 'product' }
  return useQuery({
    queryKey: queryKeys.inventory.list(query),
    queryFn: ({ signal }) => apiFetch<InventoryPage>(`/inventory/variants/?${toSearch(query)}`, { signal }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}
