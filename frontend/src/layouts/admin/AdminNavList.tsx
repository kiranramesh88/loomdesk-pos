import { NavLink } from 'react-router'

import { Tooltip } from '@/components/ui/Tooltip'
import { cx } from '@/lib/cx'

import { ADMIN_NAV, ADMIN_NAV_GROUPS, adminHref } from './adminNav'

interface AdminNavListProps {
  /** Collapsed icon rail (561–820px): labels become screen-reader text plus a tooltip. */
  rail?: boolean
  /** Called after a link is chosen, e.g. to close the phone drawer. */
  onNavigate?: () => void
}

/** Grouped admin navigation with the prototype's navy item styles and active indicator. */
export function AdminNavList({ rail = false, onNavigate }: AdminNavListProps) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.id} role="group" aria-labelledby={`nav-group-${group.id}`}>
          <p
            id={`nav-group-${group.id}`}
            className={cx(
              'px-3 pb-2 text-caption font-semibold tracking-[0.08em] text-navy-caption uppercase',
              rail && 'sr-only',
            )}
          >
            {group.label}
          </p>
          <ul className="grid gap-1">
            {ADMIN_NAV.filter((item) => item.group === group.id).map((item) => {
              const Icon = item.icon
              return (
                <li key={item.path}>
                  <Tooltip content={item.label} disabled={!rail}>
                    <NavLink
                      to={adminHref(item)}
                      end={item.path === ''}
                      onClick={onNavigate}
                      // A plain string, styled through NavLink's aria-current: the rail's tooltip
                      // trigger (Radix Slot) merges className as a string and can't call a function.
                      className={cx(
                        'flex h-10 items-center gap-3 rounded-control type-nav text-navy-text transition-control hover:bg-navy-3 hover:text-white',
                        'aria-[current=page]:bg-navy-active aria-[current=page]:font-semibold aria-[current=page]:text-white aria-[current=page]:shadow-nav-active',
                        rail ? 'justify-center' : 'px-3',
                      )}
                    >
                      <Icon aria-hidden className="size-[17px] shrink-0" />
                      <span className={rail ? 'sr-only' : 'truncate'}>{item.label}</span>
                    </NavLink>
                  </Tooltip>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
