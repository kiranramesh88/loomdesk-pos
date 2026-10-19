import { FileQuestion, ShieldX } from 'lucide-react'
import { Suspense } from 'react'
import { createBrowserRouter, Link, type RouteObject } from 'react-router'

import { PageLoader } from '@/components/feedback/PageLoader'
import { StatusScreen } from '@/components/feedback/StatusScreen'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ADMIN_NAV, type AdminRouteHandle } from '@/layouts/admin/adminNav'
import { AdminNotFound, AdminRouteError, AdminShellError } from '@/layouts/admin/AdminPageStates'
import { ALL_ROLES } from '@/types/domain'

import { HomeRedirect, RequireRole } from './guards'
import { AdminLayout, AdminPlaceholderPage } from './lazyPages'
import { ScaffoldPage } from './ScaffoldPage'

const homeLink = (
  <Link to="/" className="type-body font-semibold text-primary hover:underline">
    Go to my workspace
  </Link>
)

// Component gallery for development only; the import.meta.env.DEV guard keeps it out of production bundles.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/ui',
        lazy: async () => ({ Component: (await import('@/features/dev/DesignSystemPage')).DesignSystemPage }),
      },
    ]
  : []

// One route per nav item, so titles, active links and nested paths come from the same config.
// `products/*` keeps /admin/products/12 inside Products until Phase 4 adds the real child routes.
const adminRoutes: RouteObject[] = [
  ...ADMIN_NAV.map((item): RouteObject => {
    const handle: AdminRouteHandle = { title: item.label }
    const element = <AdminPlaceholderPage item={item} />
    return item.path ? { path: `${item.path}/*`, element, handle } : { index: true, element, handle }
  }),
  { path: '*', element: <AdminNotFound />, handle: { title: 'Page not found' } satisfies AdminRouteHandle },
]

// Route map: docs/frontend_implementation_plan.md §2. Scaffold pages are replaced phase by phase.
export const routes: RouteObject[] = [
  ...devRoutes,
  { path: '/', element: <HomeRedirect /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireRole roles={ALL_ROLES} />,
    children: [{ path: '/billing/*', element: <ScaffoldPage area="Billing portal" phase={3} /> }],
  },
  {
    element: <RequireRole roles={['admin']} />,
    children: [
      // Listed before /admin/* so the mandatory mobile route always resolves to the mobile shell.
      { path: '/admin/mobile/*', element: <ScaffoldPage area="Mobile admin" phase={8} /> },
      {
        path: '/admin',
        element: (
          <Suspense fallback={<PageLoader />}>
            <AdminLayout />
          </Suspense>
        ),
        errorElement: <AdminShellError />,
        // Pathless wrapper: a page error renders inside the shell's <main>, not over it.
        children: [{ errorElement: <AdminRouteError />, children: adminRoutes }],
      },
    ],
  },
  {
    path: '/403',
    element: (
      <StatusScreen
        icon={<ShieldX className="size-6" />}
        title="You don’t have access to this page"
        description="Your role doesn’t include this area. Ask a store administrator if you need access."
        actions={homeLink}
      />
    ),
  },
  {
    path: '*',
    element: (
      <StatusScreen
        icon={<FileQuestion className="size-6" />}
        title="Page not found"
        description="The address may be mistyped, or the page may have moved."
        actions={homeLink}
      />
    ),
  },
]

export const router = createBrowserRouter(routes)
