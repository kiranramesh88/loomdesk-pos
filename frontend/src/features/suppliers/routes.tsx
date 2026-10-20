import type { RouteObject } from 'react-router'

import { AdminNotFound } from '@/layouts/admin/AdminPageStates'
import type { AdminRouteHandle } from '@/layouts/admin/adminNav'

const title = (t: string): AdminRouteHandle => ({ title: t })

const pages = () => import('./pages/SupplierFormPages')
const purchases = () => import('./pages/PurchasePages')

// /admin/suppliers, /new, /:supplierId, /:supplierId/edit, /:supplierId/purchases/new,
// and /purchases/:purchaseNo (+ /edit), the link target of PUR- references in the stock ledger.
export const supplierRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/SupplierListPage')).SupplierListPage }),
  },
  { path: 'new', handle: title('Add supplier'), lazy: async () => ({ Component: (await pages()).SupplierCreatePage }) },
  {
    path: 'purchases/:purchaseNo',
    handle: title('Purchase'),
    children: [
      { index: true, lazy: async () => ({ Component: (await purchases()).PurchaseDetailPage }) },
      { path: 'edit', handle: title('Edit purchase'), lazy: async () => ({ Component: (await purchases()).PurchaseEditPage }) },
    ],
  },
  {
    path: ':supplierId',
    handle: title('Supplier'),
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./pages/SupplierProfilePage')).SupplierProfilePage }),
      },
      { path: 'edit', handle: title('Edit supplier'), lazy: async () => ({ Component: (await pages()).SupplierEditPage }) },
      {
        path: 'purchases/new',
        handle: title('Record purchase'),
        lazy: async () => ({ Component: (await purchases()).PurchaseCreatePage }),
      },
    ],
  },
  { path: '*', element: <AdminNotFound />, handle: title('Page not found') },
]
