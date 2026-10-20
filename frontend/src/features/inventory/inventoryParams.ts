import type { MovementType, StockState } from '@/types/domain'

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | '' =>
  allowed.includes(value as T) ? (value as T) : ''

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(value))
const readPage = (search: URLSearchParams) => {
  const page = Number(search.get('page'))
  return Number.isInteger(page) && page > 1 ? page : 1
}
const digits = (value: string | null) => (value && /^\d+$/.test(value) ? value : '')

// --- Stock list: /admin/inventory?q=&category=&state=&status=&sort=&page= (plan §2) ---

export const PAGE_SIZE = 25

export const STOCK_STATES: readonly StockState[] = ['in_stock', 'low_stock', 'out_of_stock']
export const ITEM_STATUSES = ['active', 'inactive'] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

export const SORTS = [
  { value: 'product', label: 'Product (A–Z)' },
  { value: 'stock', label: 'Stock (lowest first)' },
  { value: '-stock', label: 'Stock (highest first)' },
  { value: '-moved', label: 'Recently moved' },
] as const
export type SortKey = (typeof SORTS)[number]['value']

export interface InventoryParams {
  q: string
  category: string
  state: StockState | ''
  status: ItemStatus | ''
  sort: SortKey
  page: number
}

export function readParams(search: URLSearchParams): InventoryParams {
  return {
    q: search.get('q')?.trim() ?? '',
    category: digits(search.get('category')),
    state: pick(search.get('state'), STOCK_STATES),
    status: pick(search.get('status'), ITEM_STATUSES),
    sort: pick(search.get('sort'), SORTS.map((s) => s.value)) || 'product',
    page: readPage(search),
  }
}

export function writeParams(params: InventoryParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.category) search.set('category', params.category)
  if (params.state) search.set('state', params.state)
  if (params.status) search.set('status', params.status)
  if (params.sort !== 'product') search.set('sort', params.sort)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function listQuery(params: InventoryParams): Record<string, string> {
  const query: Record<string, string> = { page: String(params.page), page_size: String(PAGE_SIZE), ordering: params.sort }
  if (params.q) query.q = params.q
  if (params.category) query.category = params.category
  if (params.state) query.state = params.state
  if (params.status) query.status = params.status
  return query
}

export const hasFilters = (params: InventoryParams) => !!(params.q || params.category || params.state || params.status)

// --- Movement history: /admin/inventory/movements?q=&variant=&type=&from=&to=&page= ---

export const MOVEMENT_PAGE_SIZE = 30

export const MOVEMENT_TYPES: readonly MovementType[] = [
  'opening',
  'purchase',
  'sale',
  'return',
  'adjust_add',
  'adjust_remove',
  'count',
]

export interface MovementParams {
  q: string
  variant: string
  type: MovementType | ''
  from: string
  to: string
  page: number
}

export function readMovementParams(search: URLSearchParams): MovementParams {
  const from = search.get('from') ?? ''
  const to = search.get('to') ?? ''
  return {
    q: search.get('q')?.trim() ?? '',
    variant: digits(search.get('variant')),
    type: pick(search.get('type'), MOVEMENT_TYPES),
    from: isDate(from) ? from : '',
    to: isDate(to) ? to : '',
    page: readPage(search),
  }
}

export function writeMovementParams(params: MovementParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.variant) search.set('variant', params.variant)
  if (params.type) search.set('type', params.type)
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function movementQuery(params: MovementParams): Record<string, string> {
  const query: Record<string, string> = { page: String(params.page), page_size: String(MOVEMENT_PAGE_SIZE) }
  if (params.q) query.q = params.q
  if (params.variant) query.variant = params.variant
  if (params.type) query.type = params.type
  if (params.from) query.date_from = params.from
  if (params.to) query.date_to = params.to
  return query
}

export const hasMovementFilters = (params: MovementParams) =>
  !!(params.q || params.variant || params.type || params.from || params.to)

export const rangeIsBackwards = (params: MovementParams) => !!(params.from && params.to && params.from > params.to)
