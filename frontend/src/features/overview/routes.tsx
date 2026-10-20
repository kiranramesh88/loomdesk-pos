import type { RouteObject } from 'react-router'

export const overviewRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/OverviewPage')).OverviewPage }),
  },
]
