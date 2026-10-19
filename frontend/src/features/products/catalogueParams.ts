import type { ProductStatus, StockState } from '@/types/domain'

/** Catalogue search, filters, sort and page, mirrored in the URL (?q=&category=&status=&stock=&sort=&page=). */
export interface CatalogueParams {
  q: string
  category: string
  status: ProductStatus | ''
  stock: StockState | ''
  sort: SortKey
  page: number
}

export const SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: '-updated', label: 'Recently updated' },
  { value: 'price', label: 'Price (low to high)' },
  { value: '-price', label: 'Price (high to low)' },
  { value: 'stock', label: 'Stock (lowest first)' },
  { value: '-stock', label: 'Stock (highest first)' },
] as const

export type SortKey = (typeof SORTS)[number]['value']

export const PAGE_SIZE = 20

const STATUSES: readonly ProductStatus[] = ['active', 'inactive']
const STOCK_STATES: readonly StockState[] = ['in_stock', 'low_stock', 'out_of_stock']

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | '' =>
  allowed.includes(value as T) ? (value as T) : ''

/** Read the URL, ignoring values the API would reject (old bookmarks, hand-edited links). */
export function readParams(search: URLSearchParams): CatalogueParams {
  const page = Number(search.get('page'))
  const category = search.get('category') ?? ''
  return {
    q: search.get('q')?.trim() ?? '',
    category: /^\d+$/.test(category) ? category : '',
    status: pick(search.get('status'), STATUSES),
    stock: pick(search.get('stock'), STOCK_STATES),
    sort: pick(search.get('sort'), SORTS.map((s) => s.value)) || 'name',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** Only non-default values go in the URL, so a clean catalogue is just /admin/products. */
export function writeParams(params: CatalogueParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.category) search.set('category', params.category)
  if (params.status) search.set('status', params.status)
  if (params.stock) search.set('stock', params.stock)
  if (params.sort !== 'name') search.set('sort', params.sort)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function toQueryString(params: CatalogueParams): string {
  const query = new URLSearchParams({ page: String(params.page), page_size: String(PAGE_SIZE), ordering: params.sort })
  if (params.q) query.set('q', params.q)
  if (params.category) query.set('category', params.category)
  if (params.status) query.set('status', params.status)
  if (params.stock) query.set('stock', params.stock)
  return query.toString()
}

export const hasFilters = (params: CatalogueParams) => !!(params.q || params.category || params.status || params.stock)
