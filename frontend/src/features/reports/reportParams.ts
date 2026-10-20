import { isDate } from './dates'

/** Filter keys any report may take; each report lists the ones it uses (`report.filters`). */
export const FILTER_KEYS = ['category', 'state', 'reason', 'action'] as const

export interface ReportParams {
  /** Store dates; empty means the server's default (the last 30 days). */
  from: string
  to: string
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>
}

/** Read `?from=&to=&category=…`, dropping malformed dates (old bookmarks, hand-edited links). */
export function readReportParams(search: URLSearchParams): ReportParams {
  const from = search.get('from') ?? ''
  const to = search.get('to') ?? ''
  const filters: ReportParams['filters'] = {}
  for (const key of FILTER_KEYS) {
    const value = search.get(key)
    if (value) filters[key] = value
  }
  return { from: isDate(from) ? from : '', to: isDate(to) ? to : '', filters }
}

export function writeReportParams(params: ReportParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  for (const [key, value] of Object.entries(params.filters)) if (value) search.set(key, value)
  return search
}

/** The API's names: `date_from`/`date_to` plus the filters. */
export function apiParams(params: ReportParams, usesDates = true): Record<string, string> {
  return {
    ...(usesDates && params.from ? { date_from: params.from } : {}),
    ...(usesDates && params.to ? { date_to: params.to } : {}),
    ...Object.fromEntries(Object.entries(params.filters).filter(([, v]) => v)),
  }
}

export const rangeIsBackwards = (params: Pick<ReportParams, 'from' | 'to'>) => !!params.from && !!params.to && params.from > params.to
