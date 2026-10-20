import type { RouteObject } from 'react-router'

import type { MobileRouteHandle, MobileTab } from './mobileNav'
import { MobileNotFound } from './MobilePageStates'

const handle = (title: string, tab: MobileTab): MobileRouteHandle => ({ title, tab })

// Plan §2: /admin/mobile/*. Each page is lazy, so opening one tab doesn't download the others.
export const mobileRoutes: RouteObject[] = [
  {
    index: true,
    handle: handle('Overview', 'overview'),
    lazy: async () => ({ Component: (await import('@/features/overview/mobile/MobileOverviewPage')).MobileOverviewPage }),
  },
  {
    path: 'inventory',
    children: [
      {
        index: true,
        handle: handle('Inventory', 'inventory'),
        lazy: async () => ({ Component: (await import('@/features/inventory/mobile/MobileInventoryPage')).MobileInventoryPage }),
      },
      {
        path: 'movements',
        handle: handle('Stock movements', 'inventory'),
        lazy: async () => ({ Component: (await import('@/features/inventory/mobile/MobileMovementsPage')).MobileMovementsPage }),
      },
      {
        path: ':variantId',
        handle: handle('Stock', 'inventory'),
        lazy: async () => ({ Component: (await import('@/features/inventory/mobile/MobileVariantPage')).MobileVariantPage }),
      },
      {
        path: ':variantId/adjust',
        handle: handle('Adjust stock', 'inventory'),
        lazy: async () => ({ Component: (await import('@/features/inventory/mobile/MobileAdjustPage')).MobileAdjustPage }),
      },
    ],
  },
  {
    path: 'bills',
    children: [
      {
        index: true,
        handle: handle('Bills', 'bills'),
        lazy: async () => ({ Component: (await import('@/features/transactions/mobile/MobileBillsPage')).MobileBillsPage }),
      },
      {
        path: ':invoiceNo',
        handle: handle('Bill', 'bills'),
        lazy: async () => ({ Component: (await import('@/features/transactions/mobile/MobileBillPage')).MobileBillPage }),
      },
      {
        path: ':invoiceNo/receipt',
        handle: handle('Receipt', 'bills'),
        lazy: async () => ({ Component: (await import('@/features/transactions/mobile/MobileReceiptPage')).MobileReceiptPage }),
      },
    ],
  },
  {
    path: 'more',
    handle: handle('More', 'more'),
    lazy: async () => ({ Component: (await import('./MobileMorePage')).MobileMorePage }),
  },
  {
    path: 'suppliers',
    children: [
      {
        index: true,
        handle: handle('Suppliers', 'more'),
        lazy: async () => ({ Component: (await import('@/features/suppliers/mobile/MobileSuppliersPage')).MobileSuppliersPage }),
      },
      {
        path: ':supplierId',
        handle: handle('Supplier', 'more'),
        lazy: async () => ({ Component: (await import('@/features/suppliers/mobile/MobileSupplierPage')).MobileSupplierPage }),
      },
    ],
  },
  {
    path: 'purchases',
    children: [
      {
        index: true,
        handle: handle('Purchases', 'more'),
        lazy: async () => ({ Component: (await import('@/features/suppliers/mobile/MobilePurchasesPage')).MobilePurchasesPage }),
      },
      {
        path: ':purchaseNo',
        handle: handle('Purchase', 'more'),
        lazy: async () => ({ Component: (await import('@/features/suppliers/mobile/MobilePurchasePage')).MobilePurchasePage }),
      },
    ],
  },
  { path: '*', element: <MobileNotFound />, handle: handle('Page not found', 'more') },
]
