import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

import { CONTROL_TEXT, controlBox } from './controlStyles'
import { Field } from './Field'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  optional?: boolean
  size?: 'md' | 'lg'
  /** Inside the field on the left, e.g. a "₹" prefix or icon. */
  leading?: ReactNode
  /** Inside the field on the right, e.g. a show-password IconButton. */
  trailing?: ReactNode
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, optional, size = 'md', leading, trailing, id, className, disabled, ...rest },
  ref,
) {
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} optional={optional} id={id} className={className}>
      {(control) => (
        <div className={cx(controlBox({ invalid: !!error, disabled }), size === 'lg' && 'h-control-lg', 'focus-ring-within')}>
          {leading && <span className="flex shrink-0 items-center pl-3 text-muted [&_svg]:size-4">{leading}</span>}
          <input
            ref={ref}
            disabled={disabled}
            className={cx(
              'h-full min-w-0 flex-1 rounded-control bg-transparent focus-visible:outline-none',
              leading ? 'pl-2' : 'pl-3.5',
              trailing ? 'pr-1' : 'pr-3.5',
              CONTROL_TEXT,
            )}
            {...control}
            {...rest}
          />
          {trailing && <span className="flex shrink-0 items-center pr-1.5">{trailing}</span>}
        </div>
      )}
    </Field>
  )
})
