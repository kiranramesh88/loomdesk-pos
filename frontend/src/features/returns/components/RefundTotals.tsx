import { formatMoney } from '@/lib/money'

/** A return's refund, built up from what the customer paid for the items. */
export function RefundTotals({
  figures,
}: {
  figures: { subtotal_paise: number; discount_paise: number; taxable_paise: number; tax_paise: number; total_paise: number }
}) {
  const row = (label: string, paise: number, negative = false) => (
    <div className="flex justify-between gap-3">
      <dt className="min-w-0 type-body text-ink-3">{label}</dt>
      <dd className="tabular whitespace-nowrap type-body text-ink-2">
        {negative && paise > 0 && '−'}
        {formatMoney(paise)}
      </dd>
    </div>
  )
  return (
    <dl className="grid gap-1.5">
      {row('Items at the price charged', figures.subtotal_paise)}
      {figures.discount_paise > 0 && row('Their share of the bill discount', figures.discount_paise, true)}
      {row('Taxable value', figures.taxable_paise)}
      {row('GST refunded', figures.tax_paise)}
      <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
        <dt className="type-section">Refund</dt>
        <dd className="tabular text-price font-bold text-ink">{formatMoney(figures.total_paise)}</dd>
      </div>
    </dl>
  )
}
