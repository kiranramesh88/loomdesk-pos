import type { PaymentMethod } from '@/types/domain'

/** Transaction search and filters, mirrored in the URL (?q=&from=&to=&cashier=&method=&page=). Plan §2. */
export interface TransactionParams {
  q: string
  /** Store dates, YYYY-MM-DD. */
  from: string
  to: string
  cashier: string
  method: PaymentMethod | ''
  page: number
}

export const PAGE_SIZE = 25

export const METHODS: readonly PaymentMethod[] = ['cash', 'upi', 'card']

const DATE = /^\d{4}-\d{2}-\d{2}$/

const isDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(value))

/** Read the URL, dropping values the API would reject (old bookmarks, hand-edited links). */
export function readParams(search: URLSearchParams): TransactionParams {
  const page = Number(search.get('page'))
  const cashier = search.get('cashier') ?? ''
  const method = search.get('method') as PaymentMethod
  const from = search.get('from') ?? ''
  const to = search.get('to') ?? ''
  return {
    q: search.get('q')?.trim() ?? '',
    from: isDate(from) ? from : '',
    to: isDate(to) ? to : '',
    cashier: /^\d+$/.test(cashier) ? cashier : '',
    method: METHODS.includes(method) ? method : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** Only non-default values go in the URL, so the unfiltered list is just /admin/transactions. */
export function writeParams(params: TransactionParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.cashier) search.set('cashier', params.cashier)
  if (params.method) search.set('method', params.method)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

/** The API's filter names. The summary takes the same filters, so it describes exactly the listed bills. */
export function filterQuery(params: TransactionParams): Record<string, string> {
  const query: Record<string, string> = {}
  if (params.q) query.q = params.q
  if (params.from) query.date_from = params.from
  if (params.to) query.date_to = params.to
  if (params.cashier) query.cashier = params.cashier
  if (params.method) query.method = params.method
  return query
}

export const listQuery = (params: TransactionParams): Record<string, string> => ({
  ...filterQuery(params),
  page: String(params.page),
  page_size: String(PAGE_SIZE),
})

export const hasFilters = (params: TransactionParams) =>
  !!(params.q || params.from || params.to || params.cashier || params.method)

/** A start date after the end date: the API refuses it, so the page explains instead of asking. */
export const rangeIsBackwards = (params: TransactionParams) => !!(params.from && params.to && params.from > params.to)
