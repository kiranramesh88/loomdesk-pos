import { Suspense, useRef } from 'react'
import { Link, Outlet, useMatches } from 'react-router'

import { BrandMark } from '@/components/brand/Brand'
import { useMe } from '@/features/auth/api'
import { useStore } from '@/features/store/api'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { accountLabel } from '@/layouts/admin/accountLabel'
import { Avatar } from '@/layouts/admin/Avatar'
import { UserMenu } from '@/layouts/admin/UserMenu'
import type { Me } from '@/types/domain'

import { MobileBottomNav } from './MobileBottomNav'
import { mobilePath, type MobileRouteHandle } from './mobileNav'
import { MobilePageSkeleton } from './MobilePageStates'

/** The deepest matched route's handle: the page title and the current bottom tab. */
function useMobileHandle(): MobileRouteHandle {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]!.handle as Partial<MobileRouteHandle> | undefined
    if (handle?.title && handle.tab) return handle as MobileRouteHandle
  }
  return { title: 'Mobile admin', tab: 'more' }
}

/**
 * Mobile admin shell for /admin/mobile/* (inside RequireRole(['admin'])): a compact header, the page,
 * and a fixed bottom nav. It uses the same session and API as the desktop admin, so the server's
 * role checks apply unchanged. Wider screens get the same single column, centred.
 */
export function MobileAdminLayout() {
  const { data: me } = useMe()
  const handle = useMobileHandle()
  useDocumentTitle(`${handle.title} · Mobile admin`)
  const mainRef = useRef<HTMLElement>(null)

  if (!me) return null // RequireRole only renders this once the session is known.

  return (
    <div className="flex min-h-dvh flex-col bg-bg print:bg-white">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2.5 focus:type-body focus:font-strong focus:text-primary focus:shadow-overlay"
      >
        Skip to content
      </a>
      <MobileHeader me={me} />
      <main
        ref={mainRef}
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[640px] flex-1 px-3 pt-4 pb-[calc(88px+env(safe-area-inset-bottom))] outline-none min-[390px]:px-4 print:p-0"
      >
        <Suspense fallback={<MobilePageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <MobileBottomNav current={handle.tab} />
    </div>
  )
}

function MobileHeader({ me }: { me: Me }) {
  const store = useStore()
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-14 max-w-[640px] items-center justify-between gap-3 px-3 min-[390px]:px-4">
        <Link to={mobilePath()} className="flex min-w-0 items-center gap-2.5 rounded-control" aria-label="Mobile admin overview">
          <BrandMark className="size-[30px] [&_svg]:size-[17px]" />
          <span className="min-w-0">
            <span className="block text-title font-brand tracking-[-0.5px] text-ink">loomdesk</span>
            <span className="block truncate type-caption">{store.data ? `${store.data.name} · Admin` : 'Mobile admin'}</span>
          </span>
        </Link>
        <UserMenu
          me={me}
          trigger={
            <button
              type="button"
              aria-label={accountLabel(me)}
              className="grid size-11 shrink-0 place-items-center rounded-control transition-control hover:bg-surface-muted"
            >
              <Avatar me={me} className="size-[32px]" />
            </button>
          }
        />
      </div>
    </header>
  )
}
