import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type { LoginRequest, Me, Role, Session } from '@/types/domain'

/**
 * The signed-in user, or null when there is no session. `/auth/session/` answers 200 either
 * way, so being signed out isn't an HTTP error (and doesn't log one in the console). It also
 * sets the CSRF cookie that login needs.
 */
async function fetchMe(): Promise<Me | null> {
  const session = await apiFetch<Session>('/auth/session/')
  return session.user
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    // Retry only transient failures (network or 5xx), never 4xx answers.
    retry: (count, error) => error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: LoginRequest) =>
      apiFetch<Me>('/auth/login/', { method: 'POST', body: credentials }),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.auth.me, me),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout/', { method: 'POST' }),
    onSettled: (_data, error) => {
      // If the server didn't end the session (e.g. offline), keep the user where they are so
      // the UI doesn't claim they're signed out. An already-expired session counts as success.
      if (error && !(error instanceof ApiError && error.isUnauthenticated)) return
      // Drop every cached record from the previous user before anyone else signs in.
      queryClient.clear()
      queryClient.setQueryData(queryKeys.auth.me, null)
    },
  })
}

/** Where each role lands after signing in. */
export function homePathFor(role: Role): string {
  return role === 'admin' ? '/admin' : '/billing'
}

/** Only follow same-app relative paths from ?next= (never "//evil.example"). */
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return null
  return next
}
