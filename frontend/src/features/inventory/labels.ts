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

export interface AdjustmentErrors {
  kind?: string
  quantity?: string
  reason?: string
}

/**
 * The checks made before sending an adjustment, so the admin hears about them at once. The server
 * repeats every one (and refuses negative stock under a row lock); this is only the early warning.
 */
export function validateAdjustment(kind: AdjustmentKind | null, quantity: string, reason: string, onHand: number): AdjustmentErrors {
  const parsed = parseQuantity(quantity)
  const after = kind ? resultingQuantity(kind, onHand, parsed) : null
  const errors: AdjustmentErrors = {}
  if (!kind) errors.kind = 'Choose add, remove or a counted quantity.'
  if (parsed === null) errors.quantity = 'Enter a whole number of units.'
  else if (kind !== 'count' && parsed < 1) errors.quantity = 'Enter at least 1 unit.'
  else if (parsed > 10_000) errors.quantity = 'Enter 10,000 units or fewer.'
  else if (after !== null && after < 0) errors.quantity = `Only ${onHand} in stock; stock can’t go negative.`
  if (reason.trim().length < 3) errors.reason = 'Say why stock is changing, such as “Damaged in storage”.'
  return errors
}

/** Whole numbers only: "3" → 3; "", "2.5", "-1" or "3e2" → null. */
export const parseQuantity = (value: string): number | null => (/^\d{1,6}$/.test(value.trim()) ? Number(value.trim()) : null)

const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** "20 Oct 2026, 4:05 pm" in the viewer's local time. */
export const formatWhen = (iso: string) => when.format(new Date(iso))

/**
 * Where a movement's reference leads: sales to their transaction, purchase receipts to their purchase.
 * `mobile` keeps the reader inside the mobile admin.
 */
export function referencePath(reference: string, mobile = false): string | null {
  if (/^LD-\d+$/.test(reference)) return mobile ? `/admin/mobile/bills/${reference}` : `/admin/transactions/${reference}`
  if (/^PUR-\d+$/.test(reference)) return mobile ? `/admin/mobile/purchases/${reference}` : `/admin/suppliers/purchases/${reference}`
  return null
}

/** "Classic Cotton Shirt · M / Blue" */
export const variantName = (v: Pick<InventoryVariant, 'size' | 'colour'> & { product: { name: string } }) =>
  `${v.product.name} · ${v.size} / ${v.colour}`
