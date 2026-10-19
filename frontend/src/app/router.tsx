import { FileQuestion, ShieldX } from 'lucide-react'
import { createBrowserRouter, Link, type RouteObject } from 'react-router'

import { StatusScreen } from '@/components/feedback/StatusScreen'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ALL_ROLES } from '@/types/domain'

import { HomeRedirect, RequireRole } from './guards'
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

// Route map: docs/frontend_implementation_plan.md §2. Scaffold pages are replaced phase by phase.
export const router = createBrowserRouter([
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
      { path: '/admin/*', element: <ScaffoldPage area="Admin workspace" phase={2} /> },
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
])
