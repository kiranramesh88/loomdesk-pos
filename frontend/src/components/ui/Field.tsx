import { useId, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

export interface FieldProps {
  label: string
  /** Keeps the label for screen readers but hides it visually (e.g. toolbar filters). */
  hideLabel?: boolean
  hint?: string
  error?: string
  optional?: boolean
  id?: string
  className?: string
  children: (control: FieldControlProps) => ReactNode
}

/** Label above, hint or error below, ids wired for assistive tech. Shared by every form control. */
export function Field({ label, hideLabel, hint, error, optional, id, className, children }: FieldProps) {
  const autoId = useId()
  const controlId = id ?? autoId
  const messageId = `${controlId}-message`
  const message = error ?? hint

  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className={cx('type-label', hideLabel && 'sr-only')}>
        {label}
        {optional && <span className="font-regular text-muted"> (optional)</span>}
      </label>
      {children({
        id: controlId,
        'aria-describedby': message ? messageId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {message && (
        <p id={messageId} className={error ? 'type-helper text-danger' : 'type-helper'}>
          {message}
        </p>
      )}
    </div>
  )
}
