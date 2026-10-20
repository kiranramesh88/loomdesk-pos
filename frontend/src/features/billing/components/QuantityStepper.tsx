import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'

import { IconButton } from '@/components/ui/IconButton'
import { cx } from '@/lib/cx'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  max: number
  /** Names the item, e.g. "Classic Cotton Shirt, M · Blue", for the buttons' and input's labels. */
  itemLabel: string
  size?: 'sm' | 'md'
  invalid?: boolean
  describedBy?: string
}

/** − / number / +. Typing commits on blur or Enter and is kept between 1 and `max`. */
export function QuantityStepper({ value, onChange, max, itemLabel, size = 'sm', invalid, describedBy }: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const limit = Math.max(1, max)

  const commit = () => {
    if (draft === null) return
    const typed = Number.parseInt(draft, 10)
    setDraft(null)
    if (Number.isFinite(typed)) onChange(Math.min(limit, Math.max(1, typed)))
  }

  return (
    <div className="flex items-center gap-1">
      <IconButton
        label={`Decrease quantity of ${itemLabel}`}
        icon={<Minus />}
        variant="outline"
        size={size}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      />
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Quantity of ${itemLabel}`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
        className={cx(
          'w-10 rounded-control border bg-surface text-center tabular text-body font-strong text-ink-2',
          size === 'sm' ? 'h-control-sm' : 'h-control',
          invalid ? 'border-danger' : 'border-control-border',
        )}
      />
      <IconButton
        label={`Increase quantity of ${itemLabel}`}
        icon={<Plus />}
        variant="outline"
        size={size}
        disabled={value >= limit}
        onClick={() => onChange(value + 1)}
      />
    </div>
  )
}
