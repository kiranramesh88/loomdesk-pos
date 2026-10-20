import type { RouteObject } from 'react-router'

import { AdminNotFound } from '@/layouts/admin/AdminPageStates'
import type { AdminRouteHandle } from '@/layouts/admin/adminNav'

const title = (t: string): AdminRouteHandle => ({ title: t })

// Plan §2: /admin/transactions and /:invoiceNo, plus /:invoiceNo/receipt for reprinting.
export const transactionRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/TransactionListPage')).TransactionListPage }),
  },
  {
    path: ':invoiceNo',
    handle: title('Transaction'),
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./pages/TransactionDetailPage')).TransactionDetailPage }),
      },
      {
        path: 'receipt',
        handle: title('Receipt'),
        lazy: async () => ({ Component: (await import('./pages/TransactionReceiptPage')).TransactionReceiptPage }),
      },
    ],
  },
  { path: '*', element: <AdminNotFound />, handle: title('Page not found') },
]
