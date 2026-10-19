import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const TONES: Record<StatusTone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-neutral-bg text-neutral',
  info: 'bg-primary-soft text-primary',
}

export interface StatusBadgeProps {
  tone: StatusTone
  /** Always a word ("Paid", "Low stock") — colour is never the only signal. */
  children: ReactNode
  className?: string
}

/** Feature code maps its own statuses to a tone, e.g. stock state → StatusBadge. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-caption font-strong whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
