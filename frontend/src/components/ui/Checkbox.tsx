import { forwardRef, useId, type InputHTMLAttributes } from 'react'

import { cx } from '@/lib/cx'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: string
  /** One line under the label explaining what checking it does. */
  hint?: string
}

/** Native checkbox (keyboard and form behaviour for free) with the label beside it, not above. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, id, className, disabled, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  return (
    <div className={cx('flex items-start gap-2.5', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        disabled={disabled}
        aria-describedby={hintId}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary disabled:cursor-not-allowed"
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className={cx('type-label', disabled ? 'text-ink-disabled' : 'cursor-pointer')}>
          {label}
        </label>
        {hint && (
          <p id={hintId} className="type-helper">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
})
