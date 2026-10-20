import { useId } from 'react'

import { cx } from '@/lib/cx'

export interface ChipOption<V extends string = string> {
  value: V
  label: string
}

interface ChipGroupProps<V extends string> {
  /** Names the group for screen readers; shown above the chips unless `hideLabel`. */
  label: string
  hideLabel?: boolean
  options: readonly ChipOption<V>[]
  value: V
  onValueChange: (value: V) => void
  /** Equal-width columns (e.g. 3 for a segmented choice); otherwise chips wrap at their own width. */
  columns?: 2 | 3
  error?: string
  className?: string
}

/**
 * Single-choice chips (a radio group): a touch-sized alternative to a select for short option
 * lists, e.g. phone filters. Chips wrap rather than scroll sideways. 44px tall (plan §4 touch target).
 */
export function ChipGroup<V extends string>({
  label,
  hideLabel,
  options,
  value,
  onValueChange,
  columns,
  error,
  className,
}: ChipGroupProps<V>) {
  const id = useId()
  return (
    <div className={cx('min-w-0', className)}>
      <p id={`${id}-label`} className={cx('mb-1.5 type-label', hideLabel && 'sr-only')}>
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(
          'gap-2',
          columns ? 'grid' : 'flex flex-wrap',
          columns === 2 && 'grid-cols-2',
          columns === 3 && 'grid-cols-3',
        )}
      >
        {options.map((option) => {
          const checked = option.value === value
          return (
            <label
              key={option.value}
              className={cx(
                'focus-ring-within flex h-control-lg cursor-pointer items-center justify-center rounded-control border px-3.5 text-center type-body font-strong transition-control',
                checked ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink-3 hover:border-primary-border',
              )}
            >
              <input
                type="radio"
                name={id}
                value={option.value}
                checked={checked}
                onChange={() => onValueChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 type-helper text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
