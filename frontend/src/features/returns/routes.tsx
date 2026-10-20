import type { RouteObject } from 'react-router'

import { AdminNotFound } from '@/layouts/admin/AdminPageStates'
import type { AdminRouteHandle } from '@/layouts/admin/adminNav'

const title = (t: string): AdminRouteHandle => ({ title: t })

// Plan §2: /admin/returns, /new (?invoice= prefills from a transaction) and /:returnNo.
export const returnRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/ReturnListPage')).ReturnListPage }),
  },
  {
    path: 'new',
    handle: title('New return'),
    lazy: async () => ({ Component: (await import('./pages/ReturnWizardPage')).ReturnWizardPage }),
  },
  {
    path: ':returnNo',
    handle: title('Return'),
    lazy: async () => ({ Component: (await import('./pages/ReturnDetailPage')).ReturnDetailPage }),
  },
  { path: '*', element: <AdminNotFound />, handle: title('Page not found') },
]
