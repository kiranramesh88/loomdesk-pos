import { forwardRef, type TextareaHTMLAttributes } from 'react'

import { cx } from '@/lib/cx'

import { CONTROL_TEXT } from './controlStyles'
import { Field } from './Field'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
  optional?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, id, className, rows = 3, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} id={id} className={className}>
      {(control) => (
        <textarea
          ref={ref}
          rows={rows}
          className={cx(
            'w-full resize-y rounded-control border bg-surface px-3.5 py-2.5 transition-control disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-surface-muted',
            error ? 'border-danger' : 'border-control-border hover:border-muted',
            CONTROL_TEXT,
          )}
          {...control}
          {...rest}
        />
      )}
    </Field>
  )
})
