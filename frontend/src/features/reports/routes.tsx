import type { RouteObject } from 'react-router'

import type { AdminRouteHandle } from '@/layouts/admin/adminNav'

// Plan §2: /admin/reports (the library) and /admin/reports/:reportKey (the workspace, ?from=&to=&…).
export const reportRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/ReportLibraryPage')).ReportLibraryPage }),
  },
  {
    path: ':reportKey',
    handle: { title: 'Report' } satisfies AdminRouteHandle,
    lazy: async () => ({ Component: (await import('./pages/ReportWorkspacePage')).ReportWorkspacePage }),
  },
]
