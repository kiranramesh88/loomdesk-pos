import { Download, FileQuestion } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { buttonClass } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { SkeletonText } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { formatWhen } from '@/features/inventory/labels'
import { useStore } from '@/features/store/api'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { cx } from '@/lib/cx'
import { ApiError } from '@/lib/http'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { Report } from '@/types/domain'

import { exportHref, useReport, useReportLibrary } from '../api'
import { Definitions, MetricStrip } from '../components/ReportParts'
import { ReportCell } from '../components/ReportCell'
import { Trend } from '../components/Trend'
import { addDays, matchingPreset, PRESET_LABELS, presetRange, rangeLabel, type PresetKey } from '../dates'
import { apiParams, rangeIsBackwards, readReportParams, writeReportParams, type ReportParams } from '../reportParams'

/** More than this many rows is a job for the full admin's table or the CSV. */
const ROWS_SHOWN = 50
const CUSTOM = 'custom'
const back = { to: mobilePath('reports'), label: 'Reports' }

const PRESETS: ChipOption[] = [
  ...(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => ({ value: key, label: PRESET_LABELS[key] })),
  { value: CUSTOM, label: 'Custom' },
]

/** `/admin/mobile/reports/:reportKey`: a report's dates, figures, trend and rows as stacked cards, with CSV export. */
export function MobileReportPage() {
  const { reportKey = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const params = readReportParams(search)
  const store = useStore()
  const meta = useReportLibrary().data?.find((r) => r.key === reportKey)
  const usesDates = meta?.uses_dates ?? true
  const backwards = rangeIsBackwards(params)
  const query = apiParams(params, usesDates)
  const report = useReport(reportKey, query, { enabled: !backwards })
  const data = report.data?.key === reportKey ? report.data : undefined
  const today = store.data?.today ?? data?.period?.date_to ?? ''
  const from = params.from || data?.period?.date_from || (today ? addDays(today, -29) : '')
  const to = params.to || data?.period?.date_to || today
  const title = data?.title ?? meta?.title ?? 'Report'
  useDocumentTitle(title)
  const update = (next: Partial<ReportParams>) =>
    setSearch(writeReportParams({ ...params, ...next, filters: { ...params.filters, ...next.filters } }), { replace: true })
  const preset = from && to && today ? (matchingPreset(from, to, today) ?? CUSTOM) : '30d'

  if (report.error instanceof ApiError && report.error.status === 404) {
    return (
      <>
        <MobilePageHeader title="Report not found" back={back} />
        <Card>
          <EmptyState icon={<FileQuestion />} title="There’s no such report" description="Choose one from the reports list." />
        </Card>
      </>
    )
  }

  return (
    <>
      <MobilePageHeader
        title={title}
        description={data?.description ?? meta?.description}
        back={back}
        actions={
          data && !backwards ? (
            <a href={exportHref(reportKey, query)} download className={buttonClass('secondary', 'lg')}>
              <Download aria-hidden />
              Export CSV
            </a>
          ) : undefined
        }
      />
      <div className="grid gap-4">
        {usesDates && today && (
          <div className="grid gap-3">
            <ChipGroup
              label="Dates"
              hideLabel
              options={PRESETS}
              value={preset}
              onValueChange={(v) => v !== CUSTOM && update(presetRange(v as PresetKey, today))}
            />
            {preset === CUSTOM && (
              <div className="grid grid-cols-2 gap-3">
                <TextField label="From" type="date" size="lg" max={to || today} value={from} onChange={(e) => e.target.value && update({ from: e.target.value, to })} />
                <TextField
                  label="To"
                  type="date"
                  size="lg"
                  min={from}
                  max={today}
                  value={to}
                  onChange={(e) => e.target.value && update({ from, to: e.target.value })}
                  error={backwards ? 'Ends before the start date' : undefined}
                />
              </div>
            )}
          </div>
        )}
        {data && data.filters.length > 0 && (
          <div className="grid gap-3">
            {data.filters.map((f) => (
              <ChipGroup
                key={f.key}
                label={f.label}
                options={[{ value: '', label: 'All' }, ...f.options]}
                value={params.filters[f.key as keyof ReportParams['filters']] ?? ''}
                onValueChange={(value) => update({ filters: { [f.key]: value } })}
              />
            ))}
          </div>
        )}
        <p className="px-1 type-helper" aria-live="polite">
          {usesDates
            ? from && to && !backwards
              ? `Showing ${rangeLabel(from, to)} (store dates).`
              : 'Choose a start date on or before the end date.'
            : data
              ? `Stock as it is now (${formatWhen(data.generated_at)}).`
              : 'Stock as it is now.'}
        </p>
        {report.error instanceof ApiError && report.error.status === 400 && (
          <InlineAlert tone="danger">{Object.values(report.error.fields).flat()[0] ?? report.error.message}</InlineAlert>
        )}
        {report.isError && !(report.error instanceof ApiError && report.error.status === 400) ? (
          <Card>
            <ErrorState title="This report couldn’t load" message={report.error.message} onRetry={() => void report.refetch()} retrying={report.isFetching} />
          </Card>
        ) : !data ? (
          !report.isError && (
            <Card role="status" aria-label="Loading report" className="p-4">
              <SkeletonText lines={6} />
            </Card>
          )
        ) : (
          <ReportBody report={data} busy={report.isPlaceholderData} />
        )}
      </div>
    </>
  )
}

function ReportBody({ report, busy }: { report: Report; busy: boolean }) {
  const [titleColumn, ...rest] = report.columns
  const trend = report.trend && report.rows.length > 1 ? report.trend : null
  const shown = report.rows.slice(0, ROWS_SHOWN)
  return (
    <>
      <section aria-label="Summary">
        <MetricStrip metrics={report.summary} busy={busy} />
      </section>
      {trend && (
        <MobilePanel title={`${report.columns.find((c) => c.key === trend.y)?.label ?? ''} by day`}>
          <div className="px-3 pb-4">
            <Trend
              label={report.columns.find((c) => c.key === trend.y)?.label ?? ''}
              points={report.rows.map((r) => ({ date: String(r[trend.x]), value: Number(r[trend.y]) }))}
            />
          </div>
        </MobilePanel>
      )}
      <MobilePanel
        title="Details"
        description={
          report.rows.length > ROWS_SHOWN
            ? `The first ${ROWS_SHOWN} of ${report.rows.length.toLocaleString('en-IN')} rows. Export the CSV for all of them.`
            : `${report.rows.length.toLocaleString('en-IN')} ${report.rows.length === 1 ? 'row' : 'rows'}.`
        }
        className={cx(busy && 'opacity-70')}
      >
        {shown.length === 0 || !titleColumn ? (
          <EmptyState icon={<FileQuestion />} title="Nothing to show" description={report.uses_dates ? 'Nothing was recorded in these dates.' : 'No stock matches.'} />
        ) : (
          <ul aria-label="Details" className="divide-y divide-line-soft border-t border-line-soft">
            {shown.map((row, i) => (
              <li key={i} className="pt-3">
                <p className="px-4 pb-2 type-body font-strong break-words text-ink-2">
                  <ReportCell column={titleColumn} value={row[titleColumn.key]} mobile />
                </p>
                <MobileFacts>
                  {rest.map((c) => (
                    <MobileFact key={c.key} label={c.label}>
                      <ReportCell column={c} value={row[c.key]} mobile />
                    </MobileFact>
                  ))}
                </MobileFacts>
              </li>
            ))}
          </ul>
        )}
      </MobilePanel>
      <MobilePanel title="How these figures are worked out">
        <div className="px-4 pb-4">
          <Definitions definitions={report.definitions} />
        </div>
      </MobilePanel>
    </>
  )
}
