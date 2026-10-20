import {
  ArrowLeftRight,
  Boxes,
  ChartColumn,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Tag,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type AdminNavGroup = 'workspace' | 'setup'

export interface AdminNavItem {
  /** Path under /admin ('' is the Overview index). Its route also matches nested paths. */
  path: string
  label: string
  /** One sentence for the module's page header. */
  description: string
  icon: LucideIcon
  group: AdminNavGroup
  /** Implementation phase that builds the module (plan §1). Omitted when not yet scheduled. */
  phase?: number
}

/**
 * The single source for the admin sidebar, collapsed rail, phone drawer, route table and
 * page titles, so the label you click, the highlighted item and the title always agree.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { path: '', label: 'Overview', description: 'Today’s sales, bills and stock at a glance.', icon: LayoutDashboard, group: 'workspace', phase: 11 },
  { path: 'products', label: 'Products', description: 'Catalogue, variants, prices and photos.', icon: Tag, group: 'workspace', phase: 3 },
  { path: 'inventory', label: 'Inventory', description: 'Stock levels, adjustments and movement history.', icon: Boxes, group: 'workspace', phase: 6 },
  { path: 'transactions', label: 'Transactions', description: 'Completed bills, payments and receipt reprints.', icon: ReceiptText, group: 'workspace', phase: 5 },
  { path: 'returns', label: 'Returns', description: 'Returned items, refunds and restocking.', icon: ArrowLeftRight, group: 'workspace', phase: 11 },
  { path: 'suppliers', label: 'Suppliers', description: 'Supplier profiles, purchases and payments.', icon: Truck, group: 'workspace', phase: 7 },
  { path: 'staff', label: 'Staff & access', description: 'Staff accounts, roles and approval PINs.', icon: Users, group: 'workspace', phase: 11 },
  { path: 'reports', label: 'Reports', description: 'Sales, tax and stock reports with CSV export.', icon: ChartColumn, group: 'workspace', phase: 11 },
  { path: 'settings', label: 'Settings', description: 'Store details, tax and discount rules.', icon: Settings, group: 'setup', phase: 11 },
]

export const ADMIN_NAV_GROUPS: ReadonlyArray<{ id: AdminNavGroup; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'setup', label: 'Setup' },
]

export const adminHref = (item: AdminNavItem) => (item.path ? `/admin/${item.path}` : '/admin')

/** Route `handle` for admin pages; the topbar and document title read it. */
export interface AdminRouteHandle {
  title: string
}
