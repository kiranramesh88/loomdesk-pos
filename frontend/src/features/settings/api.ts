import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type { StoreSettings, StoreSettingsUpdate } from '@/types/domain'

const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

export function useStoreSettings() {
  return useQuery({
    queryKey: queryKeys.store.settings,
    queryFn: ({ signal }) => apiFetch<StoreSettings>('/store/settings/', { signal }),
    retry: retryTransient,
  })
}

/**
 * Save part of the settings. Afterwards the shell's store card, the till's settings and any open quote
 * refetch; the server applies the new rules to every bill priced from now on, whatever a till has cached.
 */
export function useUpdateStoreSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: StoreSettingsUpdate) => apiFetch<StoreSettings>('/store/settings/', { method: 'PATCH', body }),
    onSuccess: (saved) => {
      client.setQueryData(queryKeys.store.settings, saved)
      void client.invalidateQueries({ queryKey: queryKeys.store.detail, exact: true })
      void client.invalidateQueries({ queryKey: queryKeys.billing.settings })
      void client.invalidateQueries({ queryKey: queryKeys.billing.quotes })
    },
  })
}
