import { Suspense, useRef } from 'react'
import { Outlet } from 'react-router'

import { TooltipProvider } from '@/components/ui/Tooltip'
import { useMe } from '@/features/auth/api'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

import { AdminPageSkeleton } from './AdminPageStates'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopbar } from './AdminTopbar'
import { useAdminTitle } from './useAdminTitle'

/**
 * Admin shell for /admin/* (rendered inside RequireRole(['admin'])). The sidebar and topbar stay
 * mounted while page chunks load or fail, so only <main> shows the skeleton or error.
 */
export function AdminLayout() {
  const { data: me } = useMe()
  const title = useAdminTitle()
  useDocumentTitle(title)
  const mainRef = useRef<HTMLElement>(null)

  if (!me) return null // RequireRole only renders this once the session is known.

  return (
    // Here rather than in AppProviders so Radix's positioning code stays out of the main bundle.
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-dvh bg-bg">
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
        <AdminSidebar me={me} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar me={me} title={title} />
          <main
            ref={mainRef}
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1680px] px-3 pt-4 pb-10 outline-none sm:px-[15px] sm:pt-[19px] md:px-[22px] md:pt-[23px] lg:px-[30px] lg:pt-[27px]"
          >
            <Suspense fallback={<AdminPageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
