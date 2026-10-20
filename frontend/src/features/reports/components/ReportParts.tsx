import { cx } from '@/lib/cx'
import type { Report, ReportMetric } from '@/types/domain'

import { formatValue } from '../format'

/** The report's headline figures as a row of label/value pairs. */
export function MetricStrip({ metrics, busy }: { metrics: readonly ReportMetric[]; busy?: boolean }) {
  return (
    <dl
      aria-busy={busy || undefined}
      className={cx('grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5', busy && 'opacity-70')}
    >
      {metrics.map((m) => (
        <div key={m.key} className="flex min-w-0 flex-col gap-0.5 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
          <dt className="type-helper font-medium">{m.label}</dt>
          <dd className={cx('type-amount text-price break-words', m.kind === 'money' && m.value < 0 && 'text-danger')}>
            {formatValue(m.kind, m.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** "How these figures are worked out": every term the report uses, as the server defines it. */
export function Definitions({ definitions }: { definitions: Report['definitions'] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {definitions.map((d) => (
        <div key={d.term} className="min-w-0">
          <dt className="type-label">{d.term}</dt>
          <dd className="type-helper">{d.meaning}</dd>
        </div>
      ))}
    </dl>
  )
}
