import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'

export interface EmptyStateProps {
  icon: ReactNode
  title: string
  /** Say why it is empty and what to do next. */
  description?: string
  action?: ReactNode
  className?: string
}

/** Shown inside the panel or table that has nothing to display. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center px-5 py-10 text-center', className)}>
      <span aria-hidden className="mb-3 grid size-10 place-items-center rounded-control bg-surface-muted text-muted [&_svg]:size-5">
        {icon}
      </span>
      <p className="type-section">{title}</p>
      {description && <p className="mt-1 max-w-[360px] type-helper">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
