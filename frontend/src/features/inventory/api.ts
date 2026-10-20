import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type {
  InventoryPage,
  InventorySummary,
  InventoryVariant,
  MovementPage,
  StockAdjustment,
  StockAdjustmentResult,
} from '@/types/domain'

import {
  listQuery,
  movementQuery,
  rangeIsBackwards,
  type InventoryParams,
  type MovementParams,
} from './inventoryParams'

// Retry only transient failures (network or 5xx), never 4xx answers.
const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

const toSearch = (query: Record<string, string>) => new URLSearchParams(query).toString()

export function useInventory(params: InventoryParams) {
  const query = listQuery(params)
  return useQuery({
    queryKey: queryKeys.inventory.list(query),
    queryFn: ({ signal }) => apiFetch<InventoryPage>(`/inventory/variants/?${toSearch(query)}`, { signal }),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

export function useInventorySummary() {
  return useQuery({
    queryKey: queryKeys.inventory.summary,
    queryFn: ({ signal }) => apiFetch<InventorySummary>('/inventory/summary/', { signal }),
    retry: retryTransient,
  })
}

/** One variant, for the movement history's heading. Variant ids are digits; anything else is not found. */
export function useInventoryVariant(id: string) {
  return useQuery({
    queryKey: queryKeys.inventory.variant(Number(id)),
    queryFn: ({ signal }) => apiFetch<InventoryVariant>(`/inventory/variants/${id}/`, { signal }),
    enabled: id !== '',
    retry: retryTransient,
  })
}

export function useMovements(params: MovementParams) {
  const query = movementQuery(params)
  return useQuery({
    queryKey: queryKeys.inventory.movements(query),
    queryFn: ({ signal }) => apiFetch<MovementPage>(`/inventory/movements/?${toSearch(query)}`, { signal }),
    enabled: !rangeIsBackwards(params),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

/**
 * Record a stock adjustment. Never retried and never optimistic: the server compares the
 * previewed on-hand figure under a row lock and answers 409 `stock_changed` if it moved.
 */
export function useAdjustStock() {
  const client = useQueryClient()
  const refreshStock = () => {
    // Stock shows in inventory, the admin catalogue and the till's catalogue.
    void client.invalidateQueries({ queryKey: queryKeys.inventory.all })
    void client.invalidateQueries({ queryKey: queryKeys.reports.all })
    void client.invalidateQueries({ queryKey: queryKeys.products.all })
    void client.invalidateQueries({ queryKey: queryKeys.billing.products })
  }
  return useMutation({
    mutationFn: (body: StockAdjustment) =>
      apiFetch<StockAdjustmentResult>('/inventory/adjustments/', { method: 'POST', body }),
    onSuccess: refreshStock,
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 400)) refreshStock()
    },
  })
}
