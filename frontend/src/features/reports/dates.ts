/** Store-date arithmetic on "YYYY-MM-DD" strings, in UTC so the viewer's time zone never shifts a day. */

const DATE = /^\d{4}-\d{2}-\d{2}$/

export const isDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const startOfMonth = (date: string) => `${date.slice(0, 8)}01`

export type PresetKey = 'today' | '7d' | '30d' | 'month'

export const PRESET_LABELS: Record<PresetKey, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
}

export function presetRange(key: PresetKey, today: string): { from: string; to: string } {
  switch (key) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '30d':
      return { from: addDays(today, -29), to: today }
    case 'month':
      return { from: startOfMonth(today), to: today }
  }
}

export function matchingPreset(from: string, to: string, today: string): PresetKey | undefined {
  return (Object.keys(PRESET_LABELS) as PresetKey[]).find((key) => {
    const range = presetRange(key, today)
    return range.from === from && range.to === to
  })
}

const dayMonth = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const full = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const at = (date: string) => new Date(`${date}T00:00:00Z`)

/** "20 Oct 2026", or "14 Oct – 20 Oct 2026" (the year shown once when both ends share it). */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return full.format(at(from))
  const start = from.slice(0, 4) === to.slice(0, 4) ? dayMonth.format(at(from)) : full.format(at(from))
  return `${start} – ${full.format(at(to))}`
}

/** "14 Oct", for chart axes. */
export const shortDay = (date: string) => dayMonth.format(at(date))
