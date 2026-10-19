import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type { Category, ProductDetail, ProductPage, ProductStatus, ProductWrite, TaxRule } from '@/types/domain'

import { toQueryString, type CatalogueParams } from './catalogueParams'

const BASE = '/catalog/products/'

// Retry only transient failures (network or 5xx), never 4xx answers.
const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

export function useProducts(params: CatalogueParams) {
  const query = toQueryString(params)
  return useQuery({
    queryKey: queryKeys.products.list(Object.fromEntries(new URLSearchParams(query))),
    queryFn: ({ signal }) => apiFetch<ProductPage>(`${BASE}?${query}`, { signal }),
    // Keep the current page on screen while the next search or page loads.
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

/** Route ids are digits; anything else (/admin/products/abc) is treated as not found without a request. */
export const parseProductId = (raw: string | undefined) => (raw && /^\d+$/.test(raw) ? Number(raw) : null)

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: queryKeys.products.detail(id ?? 0),
    queryFn: ({ signal }) => apiFetch<ProductDetail>(`${BASE}${id}/`, { signal }),
    enabled: id !== null,
    retry: retryTransient,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.catalog.categories,
    queryFn: ({ signal }) => apiFetch<Category[]>('/catalog/categories/', { signal }),
    staleTime: 10 * 60_000,
    retry: retryTransient,
  })
}

export function useTaxRules() {
  return useQuery({
    queryKey: queryKeys.catalog.taxRules,
    queryFn: ({ signal }) => apiFetch<TaxRule[]>('/catalog/tax-rules/', { signal }),
    staleTime: 10 * 60_000,
    retry: retryTransient,
  })
}

/** Product saves change stock (opening stock), so lists, details and future inventory views refetch. */
function useSaved() {
  const client = useQueryClient()
  return (product: ProductDetail) => {
    client.setQueryData(queryKeys.products.detail(product.id), product)
    return client.invalidateQueries({ queryKey: queryKeys.products.lists })
  }
}

export function useCreateProduct() {
  const saved = useSaved()
  return useMutation({
    mutationFn: (body: ProductWrite) => apiFetch<ProductDetail>(BASE, { method: 'POST', body }),
    onSuccess: saved,
  })
}

export function useUpdateProduct(id: number) {
  const saved = useSaved()
  return useMutation({
    mutationFn: (body: Partial<ProductWrite>) => apiFetch<ProductDetail>(`${BASE}${id}/`, { method: 'PATCH', body }),
    onSuccess: saved,
  })
}

export function useSetProductStatus(id: number) {
  const saved = useSaved()
  return useMutation({
    mutationFn: (status: ProductStatus) =>
      apiFetch<ProductDetail>(`${BASE}${id}/`, { method: 'PATCH', body: { status } }),
    onSuccess: saved,
  })
}

/** Photo changes are applied after the product saves, so the id is passed per call (new products only get one then). */
export function useProductImage() {
  const saved = useSaved()
  const upload = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => {
      const body = new FormData()
      body.append('image', file)
      return apiFetch<ProductDetail>(`${BASE}${id}/image/`, { method: 'POST', body })
    },
    onSuccess: saved,
  })
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch<ProductDetail>(`${BASE}${id}/image/`, { method: 'DELETE' }),
    onSuccess: saved,
  })
  return { upload, remove }
}
