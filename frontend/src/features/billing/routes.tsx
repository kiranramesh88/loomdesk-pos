import type { RouteObject } from 'react-router'

import { BillingNotFound } from './components/BillingNotFound'

// Plan §2: /billing (variant, payment and success are dialogs, not routes) and /billing/receipt/:invoiceNo.
export const billingRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./pages/CheckoutPage')).CheckoutPage }),
  },
  {
    path: 'receipt/:invoiceNo',
    lazy: async () => ({ Component: (await import('./pages/ReceiptPage')).ReceiptPage }),
  },
  { path: '*', element: <BillingNotFound /> },
]
