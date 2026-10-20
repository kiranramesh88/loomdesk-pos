import type { StatusTone } from '@/components/ui/StatusBadge'
import type { AdjustmentKind, InventoryVariant, MovementType } from '@/types/domain'

export { STOCK_LABELS } from '@/features/products/labels'

export const MOVEMENT_LABELS: Record<MovementType, { label: string; tone: StatusTone }> = {
  opening: { label: 'Opening stock', tone: 'neutral' },
  purchase: { label: 'Purchase received', tone: 'info' },
  sale: { label: 'Sale', tone: 'info' },
  return: { label: 'Customer return', tone: 'info' },
  adjust_add: { label: 'Adjustment (add)', tone: 'success' },
  adjust_remove: { label: 'Adjustment (remove)', tone: 'warning' },
  count: { label: 'Stock count', tone: 'neutral' },
}

export const ADJUSTMENT_KINDS: { value: AdjustmentKind; label: string; quantityLabel: string }[] = [
  { value: 'add', label: 'Add stock', quantityLabel: 'Units to add' },
  { value: 'remove', label: 'Remove stock', quantityLabel: 'Units to remove' },
  { value: 'count', label: 'Set counted', quantityLabel: 'Counted quantity' },
]

/** "+4", "−3" or "0", with a real minus sign. */
export const formatDelta = (delta: number) => (delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0')

/** The on-hand figure an adjustment would leave; null while the quantity isn't a whole number. */
export function resultingQuantity(kind: AdjustmentKind, current: number, quantity: number | null): number | null {
  if (quantity === null) return null
  if (kind === 'add') return current + quantity
  if (kind === 'remove') return current - quantity
  return quantity
}

/** Whole numbers only: "3" → 3; "", "2.5", "-1" or "3e2" → null. */
export const parseQuantity = (value: string): number | null => (/^\d{1,6}$/.test(value.trim()) ? Number(value.trim()) : null)

const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** "20 Oct 2026, 4:05 pm" in the viewer's local time. */
export const formatWhen = (iso: string) => when.format(new Date(iso))

/** Where a movement's reference leads: sales to their transaction, purchase receipts to their purchase. */
export function referencePath(reference: string): string | null {
  if (/^LD-\d+$/.test(reference)) return `/admin/transactions/${reference}`
  if (/^PUR-\d+$/.test(reference)) return `/admin/suppliers/purchases/${reference}`
  return null
}

/** "Classic Cotton Shirt · M / Blue" */
export const variantName = (v: Pick<InventoryVariant, 'size' | 'colour'> & { product: { name: string } }) =>
  `${v.product.name} · ${v.size} / ${v.colour}`
