import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { API_BASE, ApiError, apiFetch } from '@/lib/http'
import { queryKeys } from '@/lib/queryKeys'
import type { Report, ReportListItem } from '@/types/domain'

const retryTransient = (count: number, error: Error) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500) && count < 2

/** The reports the server implements (admin only). */
export function useReportLibrary() {
  return useQuery({
    queryKey: queryKeys.reports.library,
    queryFn: ({ signal }) => apiFetch<ReportListItem[]>('/reports/', { signal }),
    staleTime: 30 * 60_000,
    retry: retryTransient,
  })
}

const query = (params: Record<string, string>) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''))
  return search.size ? `?${search}` : ''
}

/**
 * One report with `date_from`/`date_to` and its filters. Changing them keeps the previous figures on
 * screen (marked as updating) instead of blanking the page.
 */
export function useReport(key: string, params: Record<string, string>, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.reports.report(key, params),
    queryFn: ({ signal }) => apiFetch<Report>(`/reports/${encodeURIComponent(key)}/${query(params)}`, { signal }),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === key ? keepPreviousData(previous) : undefined),
    retry: retryTransient,
    enabled: options.enabled ?? true,
  })
}

/** The CSV download for the same report, dates and filters: a plain link, so the browser saves the file. */
export const exportHref = (key: string, params: Record<string, string>) => `${API_BASE}/reports/${encodeURIComponent(key)}/export/${query(params)}`
