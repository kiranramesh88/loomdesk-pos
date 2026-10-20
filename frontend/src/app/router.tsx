import { FileQuestion, ShieldX } from 'lucide-react'
import { Suspense } from 'react'
import { createBrowserRouter, Link, type RouteObject } from 'react-router'

import { PageLoader } from '@/components/feedback/PageLoader'
import { StatusScreen } from '@/components/feedback/StatusScreen'
import { ADMIN_NAV, type AdminRouteHandle } from '@/layouts/admin/adminNav'
import { AdminNotFound, AdminRouteError, AdminShellError } from '@/layouts/admin/AdminPageStates'
import { MobileRouteError } from '@/layouts/mobile/MobilePageStates'
import { billingRoutes } from '@/features/billing/routes'
import { productRoutes } from '@/features/products/routes'
import { transactionRoutes } from '@/features/transactions/routes'
import { inventoryRoutes } from '@/features/inventory/routes'
import { supplierRoutes } from '@/features/suppliers/routes'
import { returnRoutes } from '@/features/returns/routes'
import { staffRoutes } from '@/features/staff/routes'
import { settingsRoutes } from '@/features/settings/routes'
import { reportRoutes } from '@/features/reports/routes'
import { overviewRoutes } from '@/features/overview/routes'
import { mobileRoutes } from '@/layouts/mobile/mobileRoutes'
import { ALL_ROLES } from '@/types/domain'

import { HomeRedirect, RequireRole } from './guards'
import { AdminLayout, AdminPlaceholderPage, BillingLayout, MobileAdminLayout } from './lazyPages'

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

// Built modules supply their own child routes; the rest show a placeholder until their phase.
const MODULE_ROUTES: Partial<Record<string, RouteObject[]>> = {
  '': overviewRoutes,
  products: productRoutes,
  transactions: transactionRoutes,
  inventory: inventoryRoutes,
  suppliers: supplierRoutes,
  returns: returnRoutes,
  staff: staffRoutes,
  settings: settingsRoutes,
  reports: reportRoutes,
}

// One route per nav item, so titles, active links and nested paths come from the same config.
// `<path>/*` keeps deep links such as /admin/returns/12 inside their placeholder module.
const adminRoutes: RouteObject[] = [
  ...ADMIN_NAV.map((item): RouteObject => {
    const handle: AdminRouteHandle = { title: item.label }
    const children = MODULE_ROUTES[item.path]
    // Overview ('') is a pathless parent, so /admin itself renders its index route.
    if (children) return item.path ? { path: item.path, handle, children } : { handle, children }
    const element = <AdminPlaceholderPage item={item} />
    return item.path ? { path: `${item.path}/*`, element, handle } : { index: true, element, handle }
  }),
  { path: '*', element: <AdminNotFound />, handle: { title: 'Page not found' } satisfies AdminRouteHandle },
]

// Route map: docs/frontend_implementation_plan.md §2.
export const routes: RouteObject[] = [
  ...devRoutes,
  { path: '/', element: <HomeRedirect /> },
  // Lazy like the admin shell, so form libraries (react-hook-form, zod) stay out of the entry chunk.
  {
    path: '/login',
    lazy: async () => ({ Component: (await import('@/features/auth/pages/LoginPage')).LoginPage }),
    hydrateFallbackElement: <PageLoader />,
  },
  // Public like sign-in: the one-time link from an admin is the credential (decision D5).
  {
    path: '/set-password/:uid/:token',
    lazy: async () => ({ Component: (await import('@/features/staff/pages/SetPasswordPage')).SetPasswordPage }),
    hydrateFallbackElement: <PageLoader />,
  },
  {
    element: <RequireRole roles={ALL_ROLES} />,
    children: [
      {
        path: '/billing',
        element: (
          <Suspense fallback={<PageLoader />}>
            <BillingLayout />
          </Suspense>
        ),
        errorElement: <AdminShellError />,
        hydrateFallbackElement: <PageLoader />,
        children: [{ errorElement: <AdminRouteError />, children: billingRoutes }],
      },
    ],
  },
  {
    element: <RequireRole roles={['admin']} />,
    children: [
      // Listed before /admin so the mandatory mobile route always resolves to the mobile shell.
      {
        path: '/admin/mobile',
        element: (
          <Suspense fallback={<PageLoader />}>
            <MobileAdminLayout />
          </Suspense>
        ),
        errorElement: <AdminShellError />,
        children: [{ errorElement: <MobileRouteError />, children: mobileRoutes }],
      },
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
