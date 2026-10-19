import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '@/lib/cx'

/** White panel with a light border: the base container for page sections (prototype `.panel`). */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('min-w-0 overflow-hidden rounded-panel border border-line bg-surface shadow-panel', className)} {...rest}>
      {children}
    </section>
  )
}

interface CardHeaderProps {
  title: string
  description?: ReactNode
  /** Compact secondary actions (text links, a small button or a menu). */
  actions?: ReactNode
  /** Heading level for the title; defaults to h2 (pages own the h1). */
  as?: 'h2' | 'h3'
  id?: string
}

export function CardHeader({ title, description, actions, as: Heading = 'h2', id }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-[18px] pb-4">
      <div className="min-w-0">
        <Heading id={id} className="type-section">
          {title}
        </Heading>
        {description && <p className="mt-0.5 type-section-desc">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('px-5 pb-[18px]', className)}>{children}</div>
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('flex items-center justify-end gap-2 border-t border-line-soft px-5 py-3.5', className)}>{children}</div>
  )
}
