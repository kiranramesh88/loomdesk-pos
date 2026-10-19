import type { FormHTMLAttributes, ReactNode } from 'react'

import { cx } from '@/lib/cx'

/**
 * Form layout pieces. Labels sit above controls (each control renders its own),
 * complex forms split into FormSections, and FormActions keeps Cancel apart from Save.
 */
export function Form({ className, children, ...rest }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form noValidate className={cx('flex flex-col gap-6', className)} {...rest}>
      {children}
    </form>
  )
}

interface FormSectionProps {
  title: string
  description?: string
  children: ReactNode
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-4 border-t border-line-soft pt-5 first:border-t-0 first:pt-0">
      <legend className="float-left w-full type-section">
        {title}
        {description && <span className="mt-0.5 block type-section-desc">{description}</span>}
      </legend>
      {children}
    </fieldset>
  )
}

/** One or two columns; two collapses to one on phones. Give a child `sm:col-span-2` to span both. */
export function FormGrid({ columns = 2, children }: { columns?: 1 | 2; children: ReactNode }) {
  return <div className={cx('grid gap-4', columns === 2 && 'sm:grid-cols-2')}>{children}</div>
}

/** Secondary action (Cancel) first, the one primary action last. */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('flex flex-wrap items-center justify-end gap-2', className)}>{children}</div>
}
