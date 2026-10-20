import { Boxes, ClipboardList, History, LayoutDashboard, Menu, ReceiptText, Truck, type LucideIcon } from 'lucide-react'

export type MobileTab = 'overview' | 'inventory' | 'bills' | 'more'

/** Every mobile admin path starts here (plan §2: the mandatory `/admin/mobile/`). */
export const MOBILE_BASE = '/admin/mobile'

export const mobilePath = (path = '') => (path ? `${MOBILE_BASE}/${path}` : MOBILE_BASE)

/** Route `handle` for mobile pages: the document title and which bottom tab is current. */
export interface MobileRouteHandle {
  title: string
  tab: MobileTab
}

export interface MobileTabItem {
  id: MobileTab
  label: string
  icon: LucideIcon
  to: string
}

/**
 * Bottom navigation (spec §5.10 asks for Overview, Products, Bills, More). Inventory takes the
 * Products slot: on a phone the admin looks up stock by product, size and colour, and editing the
 * catalogue stays in the full admin, linked from More.
 */
export const MOBILE_TABS: readonly MobileTabItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, to: mobilePath() },
  { id: 'inventory', label: 'Inventory', icon: Boxes, to: mobilePath('inventory') },
  { id: 'bills', label: 'Bills', icon: ReceiptText, to: mobilePath('bills') },
  { id: 'more', label: 'More', icon: Menu, to: mobilePath('more') },
]

export interface MobileMoreItem {
  label: string
  description: string
  icon: LucideIcon
  to: string
}

/** Sections reached from More. Each is a working mobile page; nothing here is a placeholder. */
export const MOBILE_MORE: readonly MobileMoreItem[] = [
  { label: 'Suppliers', description: 'Contacts, purchases, payments and statements.', icon: Truck, to: mobilePath('suppliers') },
  { label: 'Purchases', description: 'Goods awaiting delivery, and receiving them into stock.', icon: ClipboardList, to: mobilePath('purchases') },
  { label: 'Stock movements', description: 'Every stock change, with its reason and who made it.', icon: History, to: mobilePath('inventory/movements') },
]
