import type { StatusTone } from '@/components/ui/StatusBadge'
import type { PaymentMethod, SaleStatus } from '@/types/domain'

export { formatSaleTime, PAYMENT_LABELS } from '@/features/billing/receipt'

export const SALE_STATUS_LABELS: Record<SaleStatus, { label: string; tone: StatusTone }> = {
  completed: { label: 'Completed', tone: 'success' },
}

export const itemsLabel = (count: number) => `${count.toLocaleString('en-IN')} ${count === 1 ? 'item' : 'items'}`

export const billsLabel = (count: number) => `${count.toLocaleString('en-IN')} ${count === 1 ? 'bill' : 'bills'}`

/** Cash is counted at the till; UPI and card are references the cashier typed in. */
export const isManuallyRecorded = (method: PaymentMethod) => method !== 'cash'

// Two formatters: en-IN's combined weekday + date output puts a comma before the year ("20 Oct, 2026").
const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short' })
const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** "Mon, 19 Oct 2026" for a store date (YYYY-MM-DD), without shifting it through the browser's time zone. */
export function formatStoreDate(date: string) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const value = new Date(y, m - 1, d)
  return `${weekday.format(value)}, ${day.format(value)}`
}
