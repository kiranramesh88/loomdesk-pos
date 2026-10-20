import type { PaymentMethod, TaxBreakdown } from '@/types/domain'

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
}

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** "20 Oct 2026, 4:05 pm" in the till's local time. */
export const formatSaleTime = (iso: string) => dateTime.format(new Date(iso))

export const formatRate = (bp: number) => `${bp / 100}%`

/** "CGST 2.5% + SGST 2.5%": intra-state GST is split equally between the centre and the state. */
export const gstSplitLabel = (row: TaxBreakdown) => `CGST ${formatRate(row.rate_bp / 2)} + SGST ${formatRate(row.rate_bp / 2)}`
