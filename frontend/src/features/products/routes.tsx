import type { RouteObject } from 'react-router'

import { AdminNotFound } from '@/layouts/admin/AdminPageStates'
import type { AdminRouteHandle } from '@/layouts/admin/adminNav'

const title = (t: string): AdminRouteHandle => ({ title: t })

// Plan §2: /admin/products, /new, /:productId, /:productId/edit. Pages load with the first visit.
export const productRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/ProductListPage')).ProductListPage }),
  },
  {
    path: 'new',
    handle: title('Add product'),
    lazy: async () => ({ Component: (await import('./pages/ProductFormPages')).ProductCreatePage }),
  },
  {
    path: ':productId',
    handle: title('Product'),
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./pages/ProductDetailPage')).ProductDetailPage }),
      },
      {
        path: 'edit',
        handle: title('Edit product'),
        lazy: async () => ({ Component: (await import('./pages/ProductFormPages')).ProductEditPage }),
      },
    ],
  },
  { path: '*', element: <AdminNotFound />, handle: title('Page not found') },
]
