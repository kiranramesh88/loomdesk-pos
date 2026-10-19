import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const TONES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: 'border-primary-border bg-surface-tint text-ink-3 [&>svg]:text-primary', icon: <Info /> },
  success: { box: 'border-transparent bg-success-bg text-success', icon: <CircleCheck /> },
  warning: { box: 'border-transparent bg-warning-bg text-warning', icon: <TriangleAlert /> },
  danger: { box: 'border-transparent bg-danger-bg text-danger', icon: <CircleAlert /> },
}

export interface InlineAlertProps {
  tone?: AlertTone
  title?: string
  children: ReactNode
  className?: string
}

/**
 * Message shown in place, next to what it is about (form errors, dialog notes).
 * Danger alerts are announced immediately; others politely.
 */
export function InlineAlert({ tone = 'info', title, children, className }: InlineAlertProps) {
  const { box, icon } = TONES[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('flex items-start gap-2.5 rounded-control border px-3.5 py-3 type-body [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', box, className)}
    >
      {icon}
      <div className="min-w-0">
        {title && <p className="font-strong">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}
