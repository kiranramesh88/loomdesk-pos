import type { RouteObject } from 'react-router'

import { AdminNotFound } from '@/layouts/admin/AdminPageStates'
import type { AdminRouteHandle } from '@/layouts/admin/adminNav'

const title = (t: string): AdminRouteHandle => ({ title: t })

// Plan §2: /admin/inventory (adjustments open as a dialog) and /admin/inventory/movements.
export const inventoryRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/InventoryPage')).InventoryPage }),
  },
  {
    path: 'movements',
    handle: title('Stock movements'),
    lazy: async () => ({ Component: (await import('./pages/StockMovementsPage')).StockMovementsPage }),
  },
  { path: '*', element: <AdminNotFound />, handle: title('Page not found') },
]
