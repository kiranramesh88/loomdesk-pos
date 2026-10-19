import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  /** One short sentence on what the page is for — never a paragraph (spec §4). */
  description?: string
  /** At most one primary Button plus a few secondary actions. Stacks under the title on phones. */
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-3.5 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
      <div className="min-w-0">
        <h1 className="type-page-title">{title}</h1>
        {description && <p className="mt-1 max-w-[690px] type-page-desc">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
