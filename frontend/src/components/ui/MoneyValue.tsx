import { cx } from '@/lib/cx'
import { formatMoney, type Paise } from '@/lib/money'

export interface MoneyValueProps {
  paise: Paise
  /** `₹48,620` for summaries; default keeps paise (`₹48,620.00`) for bills and invoices. */
  wholeRupees?: boolean
  className?: string
}

export function MoneyValue({ paise, wholeRupees, className }: MoneyValueProps) {
  return <span className={cx('tabular whitespace-nowrap', className)}>{formatMoney(paise, { wholeRupees })}</span>
}
