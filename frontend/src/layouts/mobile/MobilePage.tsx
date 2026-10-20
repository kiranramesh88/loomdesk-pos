import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cx } from '@/lib/cx'

interface MobilePageHeaderProps {
  title: string
  description?: ReactNode
  /** A back link above the title, for pages below a tab's list. */
  back?: { to: string; label: string }
  /** One or two actions; they take the full width under the title. */
  actions?: ReactNode
}

/** The page's only <h1>, with an optional back link (a 44px target) and actions. */
export function MobilePageHeader({ title, description, back, actions }: MobilePageHeaderProps) {
  return (
    <header className="mb-4">
      {back && (
        <Link
          to={back.to}
          className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-control px-2 type-body font-strong text-ink-3 transition-control hover:bg-surface-muted"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
      )}
      <h1 className="type-page-title break-words">{title}</h1>
      {description && <p className="mt-1 type-page-desc">{description}</p>}
      {actions && <div className="mt-3.5 flex flex-wrap gap-2 [&>*]:flex-1">{actions}</div>}
    </header>
  )
}

interface MobilePanelProps {
  title: string
  description?: string
  /** A small link on the right of the title, e.g. "View all". */
  action?: { to: string; label: string }
  children: ReactNode
  className?: string
}

/** A titled card section (prototype `.phone-panel`). Its own loading or error state stays inside it. */
export function MobilePanel({ title, description, action, children, className }: MobilePanelProps) {
  return (
    <section aria-label={title} className={cx('overflow-hidden rounded-card border border-line bg-surface shadow-card', className)}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="min-w-0 pt-1">
          <h2 className="type-section">{title}</h2>
          {description && <p className="mt-0.5 type-section-desc">{description}</p>}
        </div>
        {action && (
          <Link
            to={action.to}
            className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-control px-2 type-body font-strong text-primary hover:underline"
          >
            {action.label}
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export function MobileList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="divide-y divide-line-soft border-t border-line-soft">
      {children}
    </ul>
  )
}

interface MobileRowProps {
  to: string
  /** The row's name, e.g. a product or invoice number. */
  title: ReactNode
  /** Secondary lines under the title. */
  meta?: ReactNode
  /** Right-aligned value: an amount, a quantity or a status. */
  aside?: ReactNode
}

/** A tappable list row (prototype `.phone-list-row`): title and metadata, a value on the right, a chevron. */
export function MobileRow({ to, title, meta, aside }: MobileRowProps) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-control hover:bg-surface-muted focus-visible:bg-surface-muted"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="type-body font-strong break-words text-ink-2">{title}</span>
          {meta && <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 type-helper">{meta}</div>}
        </div>
        {aside && <div className="shrink-0 text-right">{aside}</div>}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
      </Link>
    </li>
  )
}

/** Label and value pairs, one per line: the mobile version of a detail page's facts. */
export function MobileFacts({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 px-4 pb-4">{children}</dl>
}

export function MobileFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 type-helper">{label}</dt>
      <dd className="min-w-0 text-right type-body break-words text-ink-2">{children}</dd>
    </div>
  )
}
