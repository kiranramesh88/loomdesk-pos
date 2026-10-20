import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { formatMoney } from '@/lib/money'

import { shortDay } from '../dates'

export interface TrendPoint {
  date: string
  value: number
}

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })
const axisRupees = (paise: number) => `₹${compact.format(paise / 100)}`

interface TipProps {
  active?: boolean
  payload?: { value?: number; payload?: TrendPoint }[]
  label: string
}

function Tip({ active, payload, label }: TipProps) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2 shadow-panel">
      <p className="type-caption">{shortDay(point.date)}</p>
      <p className="type-amount">
        {label}: {formatMoney(point.value)}
      </p>
    </div>
  )
}

/**
 * One blue line over faint gridlines (spec §5.1), money by store date. Loaded on its own (`LazyTrendChart`)
 * so Recharts stays out of every other page. The SVG is hidden from screen readers: the caller shows a
 * text summary and a table of the same points.
 */
export default function TrendChart({ points, label }: { points: TrendPoint[]; label: string }) {
  return (
    <div aria-hidden className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDay}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-line-strong)' }}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={axisRupees}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
            width={56}
          />
          <Tooltip content={<Tip label={label} />} cursor={{ stroke: 'var(--color-primary-border)' }} />
          <Line
            // Straight segments: a smoothed curve would dip below zero between days.
            type="linear"
            dataKey="value"
            stroke="var(--color-chart-1)"
            strokeWidth={2.25}
            dot={points.length <= 14 ? { r: 2.5, fill: 'var(--color-chart-1)', strokeWidth: 0 } : false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
