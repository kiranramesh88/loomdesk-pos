import type { StatusTone } from '@/components/ui/StatusBadge'
import { formatMoney } from '@/lib/money'
import type { GstRateBp, PurchaseStatus, SupplierPaymentMethod, SupplierStatus } from '@/types/domain'

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, { label: string; tone: StatusTone }> = {
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, { label: string; tone: StatusTone }> = {
  ordered: { label: 'Awaiting goods', tone: 'warning' },
  received: { label: 'Received', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const PAYMENT_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  cheque: 'Cheque',
  cash: 'Cash',
}

/** GST rates the server accepts on a purchase line; "auto" leaves the choice to the product's GST rule. */
export const GST_RATES: readonly GstRateBp[] = [0, 500, 1200, 1800, 2800, 4000]
export const AUTO_RATE = 'auto'
export const rateLabel = (bp: number) => `${bp / 100}%`

/** "₹1,200.00 due", "₹50.00 paid in advance" or "Nothing due". */
export function balanceLabel(paise: number): string {
  if (paise > 0) return `${formatMoney(paise)} due`
  if (paise < 0) return `${formatMoney(-paise)} paid in advance`
  return 'Nothing due'
}

const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** A calendar date ("2026-10-20") as "20 Oct 2026", independent of the viewer's time zone. */
export const formatDay = (date: string) => day.format(new Date(`${date}T00:00:00Z`))

const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
export const formatWhen = (iso: string) => when.format(new Date(iso))

/** Today's date in the viewer's time zone, as the date inputs expect. */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export const unitsLabel = (count: number) => `${count.toLocaleString('en-IN')} ${count === 1 ? 'unit' : 'units'}`
