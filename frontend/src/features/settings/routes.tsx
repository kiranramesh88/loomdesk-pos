import type { RouteObject } from 'react-router'

import { AdminNotFound } from '@/layouts/admin/AdminPageStates'
import type { AdminRouteHandle } from '@/layouts/admin/adminNav'

export const settingsRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/SettingsPage')).SettingsPage }),
  },
  { path: '*', element: <AdminNotFound />, handle: { title: 'Page not found' } satisfies AdminRouteHandle },
]
