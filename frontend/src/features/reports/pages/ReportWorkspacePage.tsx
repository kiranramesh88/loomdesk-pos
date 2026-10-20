import { ArrowLeft, Download, FileQuestion } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonStyles'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/Select'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { formatWhen } from '@/features/inventory/labels'
import { useStore } from '@/features/store/api'
import { cx } from '@/lib/cx'
import { ApiError } from '@/lib/http'
import type { ReportRow } from '@/types/domain'

import { exportHref, useReport, useReportLibrary } from '../api'
import { reportColumns } from '../cells'
import { DateRangeBar } from '../components/DateRangeBar'
import { Definitions, MetricStrip } from '../components/ReportParts'
import { Trend } from '../components/Trend'
import { addDays, rangeLabel } from '../dates'
import { apiParams, rangeIsBackwards, readReportParams, writeReportParams, type ReportParams } from '../reportParams'

const ALL = 'all'
/** Rows drawn at first: thousands of rows take seconds to draw and to re-sort. */
const SHOWN = 500

type Row = ReportRow & { _row: number }

/** `/admin/reports/:reportKey`: dates and filters, headline figures, a trend where there is one, a sortable table and CSV export. */
export function ReportWorkspacePage() {
  const { reportKey = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const params = readReportParams(search)
  const library = useReportLibrary()
  const store = useStore()
  const meta = library.data?.find((r) => r.key === reportKey)
  const usesDates = meta?.uses_dates ?? true
  const backwards = rangeIsBackwards(params)
  const query = apiParams(params, usesDates)
  // "Show all" applies to one report and query; new dates or filters start at SHOWN again.
  const view = `${reportKey}?${new URLSearchParams(query)}`
  const [showAllFor, setShowAllFor] = useState<string>()
  const showAll = showAllFor === view
  const report = useReport(reportKey, query, { enabled: !backwards })
  const data = report.data?.key === reportKey ? report.data : undefined
  const today = store.data?.today ?? data?.period?.date_to ?? ''
  // The dates on screen: the URL's, or the server's default (the last 30 days) until one is chosen.
  const from = params.from || data?.period?.date_from || (today ? addDays(today, -29) : '')
  const to = params.to || data?.period?.date_to || today
  const title = data?.title ?? meta?.title ?? 'Report'

  const update = (next: Partial<ReportParams>) =>
    setSearch(writeReportParams({ ...params, ...next, filters: { ...params.filters, ...next.filters } }), { replace: true })

  const columns = useMemo(() => reportColumns(data?.columns ?? []), [data?.columns])
  const rows = useMemo<Row[] | undefined>(() => data?.rows.map((r, i) => ({ ...r, _row: i })), [data?.rows])
  const trend = data?.trend && data.rows.length > 1 ? data.trend : null
  const trendLabel = trend ? (data?.columns.find((c) => c.key === trend.y)?.label ?? '') : ''
  const missing = report.error instanceof ApiError && report.error.status === 404
  const badQuery = report.error instanceof ApiError && report.error.status === 400

  if (missing) {
    return (
      <Card>
        <EmptyState
          icon={<FileQuestion />}
          title="There’s no such report"
          description="It may have been renamed. Choose one from the reports list."
          action={
            <ButtonLink to="/admin/reports" icon={<ArrowLeft />}>
              All reports
            </ButtonLink>
          }
        />
      </Card>
    )
  }

  return (
    <>
      <PageHeader
        title={title}
        description={data?.description ?? meta?.description}
        actions={
          <>
            <ButtonLink to="/admin/reports" variant="ghost" icon={<ArrowLeft />}>
              All reports
            </ButtonLink>
            {data && !backwards ? (
              <a href={exportHref(reportKey, query)} download className={buttonClass('secondary', 'md')}>
                <Download aria-hidden />
                Export CSV
              </a>
            ) : (
              <span aria-disabled className={cx(buttonClass('secondary', 'md'), 'pointer-events-none text-ink-disabled')}>
                <Download aria-hidden />
                Export CSV
              </span>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:gap-5">
        <Card aria-label="Report options">
          <CardBody className="grid gap-3 pt-4">
            <div className="flex flex-wrap items-start gap-3">
              {usesDates && today && <DateRangeBar today={today} from={from} to={to} onChange={(range) => update(range)} />}
              {data?.filters.map((f) => (
                <Select
                  key={f.key}
                  label={f.label}
                  hideLabel
                  className="w-full sm:w-[200px]"
                  options={[{ value: ALL, label: `All: ${f.label.toLowerCase()}` }, ...f.options]}
                  value={params.filters[f.key as keyof ReportParams['filters']] ?? ALL}
                  onValueChange={(value) => update({ filters: { [f.key]: value === ALL ? '' : value } })}
                />
              ))}
            </div>
            <p className="type-helper" aria-live="polite">
              {usesDates
                ? from && to && !backwards
                  ? `Showing ${rangeLabel(from, to)} (store dates).`
                  : 'Choose a start date on or before the end date.'
                : data
                  ? `Stock as it is now (${formatWhen(data.generated_at)}).`
                  : 'Stock as it is now.'}
            </p>
          </CardBody>
        </Card>

        {badQuery && (
          <InlineAlert tone="danger" title="These dates or filters can’t be used">
            {Object.values((report.error as ApiError).fields).flat()[0] ?? report.error?.message}
          </InlineAlert>
        )}
        {report.isError && !badQuery ? (
          <Card>
            <ErrorState title="This report couldn’t load" message={report.error.message} onRetry={() => void report.refetch()} retrying={report.isFetching} />
          </Card>
        ) : !data ? (
          !badQuery && (
            <div aria-busy className="grid gap-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-[68px] rounded-card" />
                ))}
              </div>
              <Card>
                <CardBody className="pt-5">
                  <SkeletonText lines={6} />
                </CardBody>
              </Card>
            </div>
          )
        ) : (
          <>
            <section aria-label="Summary">
              <MetricStrip metrics={data.summary} busy={report.isPlaceholderData} />
            </section>
            {trend && (
              <Card aria-labelledby="trend-heading">
                <CardHeader id="trend-heading" title={`${trendLabel} by day`} />
                <CardBody>
                  <Trend label={trendLabel} points={data.rows.map((r) => ({ date: String(r[trend.x]), value: Number(r[trend.y]) }))} />
                </CardBody>
              </Card>
            )}
            <Card aria-labelledby="table-heading">
              <CardHeader
                id="table-heading"
                title="Details"
                description={`${data.rows.length.toLocaleString('en-IN')} ${data.rows.length === 1 ? 'row' : 'rows'}. Choose a column heading to sort.`}
              />
              {data.truncated && (
                <div className="px-4 pb-3 sm:px-5">
                  <InlineAlert tone="warning">The report stops at 5,000 rows. Choose fewer dates to see the rest.</InlineAlert>
                </div>
              )}
              <div aria-busy={report.isPlaceholderData || undefined} className={cx(report.isPlaceholderData && 'opacity-70')}>
                <DataTable
                  key={reportKey}
                  caption={title}
                  columns={columns}
                  rows={rows}
                  getRowId={(r) => r._row}
                  empty={<EmptyState icon={<FileQuestion />} title="Nothing to show" description={usesDates ? 'Nothing was recorded in these dates.' : 'No stock matches.'} />}
                  minWidth={columns.length > 6 ? '960px' : '640px'}
                  limit={showAll ? undefined : SHOWN}
                />
              </div>
              {!showAll && data.rows.length > SHOWN && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3.5 sm:px-5">
                  <p className="type-helper">
                    Showing the first {SHOWN} of {data.rows.length.toLocaleString('en-IN')} rows, in the order chosen. The CSV has every row.
                  </p>
                  <Button onClick={() => setShowAllFor(view)}>Show all {data.rows.length.toLocaleString('en-IN')} rows</Button>
                </div>
              )}
            </Card>
            <Card aria-labelledby="definitions-heading">
              <CardHeader id="definitions-heading" title="How these figures are worked out" />
              <CardBody>
                <Definitions definitions={data.definitions} />
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
