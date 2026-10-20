import { Link } from 'react-router'

import { cx } from '@/lib/cx'

import { MOBILE_TABS, type MobileTab } from './mobileNav'

/**
 * Fixed bottom navigation (prototype `.phone-bottom-nav`). The current tab comes from the route
 * handle, so a child page such as a supplier highlights More. Each item is at least 56px tall.
 */
export function MobileBottomNav({ current }: { current: MobileTab }) {
  return (
    <nav
      aria-label="Mobile admin"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <ul className="mx-auto grid max-w-[640px] grid-cols-4">
        {MOBILE_TABS.map((tab) => {
          const active = tab.id === current
          return (
            <li key={tab.id}>
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-caption transition-control',
                  'text-muted hover:text-ink-3 aria-[current=page]:font-bold aria-[current=page]:text-primary',
                )}
              >
                <tab.icon aria-hidden className="size-5" />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
