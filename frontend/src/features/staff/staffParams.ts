import type { Role } from '@/types/domain'

export type StaffStatus = 'active' | 'pending' | 'inactive'

/** Staff search and filters, mirrored in the URL (?q=&role=&status=&page=). */
export interface StaffParams {
  q: string
  role: Role | ''
  status: StaffStatus | ''
  page: number
}

export const PAGE_SIZE = 25

export const ROLES: readonly Role[] = ['admin', 'senior_cashier', 'cashier']
export const STATUSES: readonly StaffStatus[] = ['active', 'pending', 'inactive']

export function readParams(search: URLSearchParams): StaffParams {
  const page = Number(search.get('page'))
  const role = search.get('role') as Role
  const status = search.get('status') as StaffStatus
  return {
    q: search.get('q')?.trim() ?? '',
    role: ROLES.includes(role) ? role : '',
    status: STATUSES.includes(status) ? status : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

export function writeParams(params: StaffParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.role) search.set('role', params.role)
  if (params.status) search.set('status', params.status)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function listQuery(params: StaffParams): Record<string, string> {
  const query: Record<string, string> = { page: String(params.page), page_size: String(PAGE_SIZE) }
  if (params.q) query.q = params.q
  if (params.role) query.role = params.role
  if (params.status) query.status = params.status
  return query
}

export const hasFilters = (params: StaffParams) => !!(params.q || params.role || params.status)
