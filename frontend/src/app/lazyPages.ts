import { lazy } from 'react'

// Admin code is split out of the login/billing bundle and loaded on first visit.
export const AdminLayout = lazy(() => import('@/layouts/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
export const AdminPlaceholderPage = lazy(() =>
  import('@/features/admin/AdminPlaceholderPage').then((m) => ({ default: m.AdminPlaceholderPage })),
)
