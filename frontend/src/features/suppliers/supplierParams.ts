import type { SupplierStatus } from '@/types/domain'

// --- Supplier list: /admin/suppliers?q=&status=&category=&sort=&page= ---

export const PAGE_SIZE = 25
export const PURCHASE_PAGE_SIZE = 10

export const STATUSES: readonly SupplierStatus[] = ['active', 'inactive']

export const SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-balance', label: 'Recorded balance (highest)' },
] as const
export type SortKey = (typeof SORTS)[number]['value']

export interface SupplierParams {
  q: string
  status: SupplierStatus | ''
  category: string
  sort: SortKey
  page: number
}

const readPage = (search: URLSearchParams) => {
  const page = Number(search.get('page'))
  return Number.isInteger(page) && page > 1 ? page : 1
}

export function readParams(search: URLSearchParams): SupplierParams {
  const status = search.get('status')
  const sort = search.get('sort')
  return {
    q: search.get('q')?.trim() ?? '',
    status: STATUSES.includes(status as SupplierStatus) ? (status as SupplierStatus) : '',
    category: search.get('category')?.trim() ?? '',
    sort: SORTS.some((s) => s.value === sort) ? (sort as SortKey) : 'name',
    page: readPage(search),
  }
}

export function writeParams(params: SupplierParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  if (params.category) search.set('category', params.category)
  if (params.sort !== 'name') search.set('sort', params.sort)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function listQuery(params: SupplierParams): Record<string, string> {
  const query: Record<string, string> = { page: String(params.page), page_size: String(PAGE_SIZE), ordering: params.sort }
  if (params.q) query.q = params.q
  if (params.status) query.status = params.status
  if (params.category) query.category = params.category
  return query
}

export const hasFilters = (params: SupplierParams) => !!(params.q || params.status || params.category)

/** Supplier ids in the URL are positive whole numbers; anything else is not found. */
export function parseSupplierId(value: string | undefined): number | null {
  return value && /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : null
}

export const isPurchaseNumber = (value: string | undefined): value is string => !!value && /^PUR-\d{6,}$/.test(value)
