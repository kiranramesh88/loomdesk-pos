import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
      // Financial and stock mutations must never be retried blindly (plan §6.3).
      mutations: { retry: false },
    },
  })
}
