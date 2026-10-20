import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type { SetPasswordLink, SetPasswordRequest, SetupLink, StaffCreate, StaffCreated, StaffMember, StaffPage, StaffUpdate } from '@/types/domain'

import { listQuery, type StaffParams } from './staffParams'

const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

export function useStaffList(params: StaffParams) {
  const query = listQuery(params)
  return useQuery({
    queryKey: queryKeys.staff.list(query),
    queryFn: ({ signal }) => apiFetch<StaffPage>(`/staff/?${new URLSearchParams(query).toString()}`, { signal }),
    placeholderData: keepPreviousData,
    retry: retryTransient,
  })
}

export function useStaffMember(id: number) {
  return useQuery({
    queryKey: queryKeys.staff.detail(id),
    queryFn: ({ signal }) => apiFetch<StaffMember>(`/staff/${id}/`, { signal }),
    retry: retryTransient,
  })
}

/** After any staff change: the account, the lists, and the signed-in user (an admin may rename themselves). */
function useRefreshStaff() {
  const client = useQueryClient()
  return (member?: StaffMember) => {
    if (member) client.setQueryData(queryKeys.staff.detail(member.id), member)
    void client.invalidateQueries({ queryKey: queryKeys.staff.all })
    void client.invalidateQueries({ queryKey: queryKeys.auth.me })
  }
}

export function useCreateStaff() {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: (body: StaffCreate) => apiFetch<StaffCreated>('/staff/', { method: 'POST', body }),
    onSuccess: (created) => refresh(created.staff),
  })
}

export function useUpdateStaff(id: number) {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: (body: StaffUpdate) => apiFetch<StaffMember>(`/staff/${id}/`, { method: 'PATCH', body }),
    onSuccess: refresh,
  })
}

export function useSetActive(id: number) {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: (active: boolean) => apiFetch<StaffMember>(`/staff/${id}/${active ? 'reactivate' : 'deactivate'}/`, { method: 'POST' }),
    onSuccess: refresh,
  })
}

export function useSetPin(id: number) {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: (pin: string) => apiFetch<StaffMember>(`/staff/${id}/pin/`, { method: 'PUT', body: { pin } }),
    onSuccess: refresh,
  })
}

export function useClearPin(id: number) {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: () => apiFetch<StaffMember>(`/staff/${id}/pin/`, { method: 'DELETE' }),
    onSuccess: refresh,
  })
}

/** A new set-password link. The server keeps no copy, so the caller shows it once. */
export function useIssueSetupLink(id: number) {
  const refresh = useRefreshStaff()
  return useMutation({
    mutationFn: () => apiFetch<SetupLink>(`/staff/${id}/setup-link/`, { method: 'POST' }),
    onSuccess: () => refresh(),
  })
}

// --- The public set-password page ---

export function useSetPasswordLink(uid: string, token: string) {
  return useQuery({
    queryKey: queryKeys.auth.setPasswordLink(uid, token),
    queryFn: ({ signal }) => apiFetch<SetPasswordLink>(`/auth/set-password/${encodeURIComponent(uid)}/${encodeURIComponent(token)}/`, { signal }),
    retry: retryTransient,
    staleTime: Infinity,
  })
}

export function useSetPassword() {
  return useMutation({
    mutationFn: (body: SetPasswordRequest) => apiFetch<void>('/auth/set-password/', { method: 'POST', body }),
  })
}

/** Staff ids in the URL are positive integers; anything else is shown as not found without a request. */
export const parseStaffId = (value: string | undefined): number | null =>
  value && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null
