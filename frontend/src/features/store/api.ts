import { useQuery } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type { Store } from '@/types/domain'

/** Store identity for the admin shell (admins only; GET /store/). */
export function useStore() {
  return useQuery({
    queryKey: queryKeys.store.detail,
    queryFn: () => apiFetch<Store>('/store/'),
    staleTime: 30 * 60_000,
    // Retry only transient failures (network or 5xx), never 4xx answers.
    retry: (count, error) => error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2,
  })
}
