import { Select } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'

import { matchingPreset, PRESET_LABELS, presetRange, type PresetKey } from '../dates'

const CUSTOM = 'custom'

interface DateRangeBarProps {
  /** The store's date, from the server. */
  today: string
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}

/** A preset (today, 7 or 30 days, this month) or any two store dates. One range drives the whole page. */
export function DateRangeBar({ today, from, to, onChange }: DateRangeBarProps) {
  const preset = matchingPreset(from, to, today) ?? CUSTOM
  const options = [
    ...(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => ({ value: key, label: PRESET_LABELS[key] })),
    { value: CUSTOM, label: 'Custom dates' },
  ]
  const backwards = !!from && !!to && from > to
  return (
    <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[minmax(0,180px)_repeat(2,minmax(0,160px))]">
      <Select
        label="Dates"
        hideLabel
        className="col-span-2 sm:col-span-1"
        options={options}
        value={preset}
        onValueChange={(value) => value !== CUSTOM && onChange(presetRange(value as PresetKey, today))}
      />
      <TextField
        label="From date"
        hideLabel
        type="date"
        leading={<span aria-hidden className="type-helper">From</span>}
        value={from}
        max={to || today}
        onChange={(event) => event.target.value && onChange({ from: event.target.value, to })}
      />
      <TextField
        label="To date"
        hideLabel
        type="date"
        leading={<span aria-hidden className="type-helper">To</span>}
        value={to}
        min={from || undefined}
        max={today}
        onChange={(event) => event.target.value && onChange({ from, to: event.target.value })}
        error={backwards ? 'Ends before the start date' : undefined}
      />
    </div>
  )
}
