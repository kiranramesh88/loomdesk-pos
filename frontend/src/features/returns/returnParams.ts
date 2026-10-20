import type { ReturnDisposition } from '@/types/domain'

/** Return search and filters, mirrored in the URL (?q=&from=&to=&disposition=&page=). */
export interface ReturnParams {
  q: string
  /** Store dates, YYYY-MM-DD. */
  from: string
  to: string
  disposition: ReturnDisposition | ''
  page: number
}

export const PAGE_SIZE = 25

export const DISPOSITIONS: readonly ReturnDisposition[] = ['sellable', 'damaged', 'inspection']

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))

export function readParams(search: URLSearchParams): ReturnParams {
  const page = Number(search.get('page'))
  const disposition = search.get('disposition') as ReturnDisposition
  const from = search.get('from') ?? ''
  const to = search.get('to') ?? ''
  return {
    q: search.get('q')?.trim() ?? '',
    from: isDate(from) ? from : '',
    to: isDate(to) ? to : '',
    disposition: DISPOSITIONS.includes(disposition) ? disposition : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

export function writeParams(params: ReturnParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.disposition) search.set('disposition', params.disposition)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function listQuery(params: ReturnParams): Record<string, string> {
  const query: Record<string, string> = { page: String(params.page), page_size: String(PAGE_SIZE) }
  if (params.q) query.q = params.q
  if (params.from) query.date_from = params.from
  if (params.to) query.date_to = params.to
  if (params.disposition) query.disposition = params.disposition
  return query
}

export const hasFilters = (params: ReturnParams) => !!(params.q || params.from || params.to || params.disposition)

export const rangeIsBackwards = (params: ReturnParams) => !!(params.from && params.to && params.from > params.to)
