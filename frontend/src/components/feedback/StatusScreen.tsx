import type { ReactNode } from 'react'

interface StatusScreenProps {
  icon: ReactNode
  title: string
  description: ReactNode
  actions?: ReactNode
}

/** Full-page state for 403/404, session loading failures and similar dead ends. */
export function StatusScreen({ icon, title, description, actions }: StatusScreenProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="flex max-w-[400px] flex-col items-center text-center">
        <div className="mb-4 grid size-12 place-items-center rounded-card bg-primary-soft text-primary" aria-hidden>
          {icon}
        </div>
        <h1 className="type-page-title">{title}</h1>
        <div className="mt-2 type-page-desc">{description}</div>
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </main>
  )
}
