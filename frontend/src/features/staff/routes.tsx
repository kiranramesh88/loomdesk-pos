import type { RouteObject } from 'react-router'

import { AdminNotFound } from '@/layouts/admin/AdminPageStates'
import type { AdminRouteHandle } from '@/layouts/admin/adminNav'

const title = (t: string): AdminRouteHandle => ({ title: t })

// /admin/staff and /admin/staff/:staffId. Adding staff is a dialog on the list.
export const staffRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/StaffListPage')).StaffListPage }),
  },
  {
    path: ':staffId',
    handle: title('Staff account'),
    lazy: async () => ({ Component: (await import('./pages/StaffDetailPage')).StaffDetailPage }),
  },
  { path: '*', element: <AdminNotFound />, handle: title('Page not found') },
]
