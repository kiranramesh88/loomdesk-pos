import type { ReactNode } from 'react'

import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/money'
import type { Sale } from '@/types/domain'

import { formatRate, formatSaleTime, PAYMENT_LABELS } from '../receipt'

/** The receipt's paper: a card on screen, plain paper when printed. */
export function Paper({ children }: { children: ReactNode }) {
  return (
    <article className="rounded-panel border border-line bg-surface px-5 py-6 shadow-panel sm:px-7 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {children}
    </article>
  )
}

/** Every value here is read from the saved sale; nothing is recalculated in the browser. */
export function Receipt({ sale }: { sale: Sale }) {
  const { store, payment } = sale
  return (
    <Paper>
      <div aria-label={`Receipt ${sale.invoice_no}`} className="text-small text-ink-2 print:text-ink">
        <header className="text-center">
          <h1 className="text-title font-bold text-ink">{store.name}</h1>
          <p className="mt-1 whitespace-pre-line text-ink-3">{store.address}</p>
          <p className="text-ink-3">
            {store.state} · Store {store.code}
          </p>
          {store.gstin && <p className="text-ink-3">GSTIN {store.gstin}</p>}
          <p className="mt-3 type-eyebrow">Tax invoice</p>
        </header>

        <Divider />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <Meta label="Invoice no." value={sale.invoice_no} strong />
          <Meta label="Date" value={formatSaleTime(sale.created_at)} />
          <Meta label="Cashier" value={sale.cashier_name} />
        </dl>

        <Divider />
        <table className="w-full border-collapse">
          <caption className="sr-only">Items sold</caption>
          <thead>
            <tr className="text-left type-caption">
              <th scope="col" className="pb-1.5 font-strong">Item</th>
              <th scope="col" className="pb-1.5 text-right font-strong">Qty × Price</th>
              <th scope="col" className="pb-1.5 text-right font-strong">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((line) => (
              <tr key={line.id} className="align-top">
                <td className="py-1.5 pr-2">
                  <span className="block font-strong text-ink">{line.product_name}</span>
                  <span className="block type-caption">
                    {line.size} · {line.colour} · {line.variant_sku}
                  </span>
                  <span className="block type-caption">
                    HSN {line.hsn_code} · GST {formatRate(line.tax_rate_bp)}
                    {line.discount_paise > 0 && ` · Discount −${formatMoney(line.discount_paise)}`}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular whitespace-nowrap">
                  {line.quantity} × {formatMoney(line.unit_price_paise)}
                </td>
                <td className="py-1.5 pl-2 text-right tabular font-strong whitespace-nowrap">{formatMoney(line.subtotal_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Divider />
        <dl className="grid gap-1">
          <Amount label="Subtotal" paise={sale.subtotal_paise} />
          {sale.discount_paise > 0 && (
            <Amount
              label={sale.discount_approved_by_name ? `Discount (approved by ${sale.discount_approved_by_name})` : 'Discount'}
              paise={sale.discount_paise}
              negative
            />
          )}
          <Amount label="Taxable value" paise={sale.taxable_paise} />
          {sale.tax_breakdown.map((row) => (
            <div key={row.rate_bp} className="grid gap-0.5">
              <Amount label={`CGST ${formatRate(row.rate_bp / 2)} on ${formatMoney(row.taxable_paise)}`} paise={row.cgst_paise} />
              <Amount label={`SGST ${formatRate(row.rate_bp / 2)} on ${formatMoney(row.taxable_paise)}`} paise={row.sgst_paise} />
            </div>
          ))}
        </dl>
        <div className="mt-2.5 flex items-baseline justify-between border-t border-ink-3 pt-2.5">
          <span className="text-panel font-bold text-ink">Total</span>
          <span className="tabular text-price font-bold text-ink">{formatMoney(sale.total_paise)}</span>
        </div>
        <p className="mt-1 type-caption">{sale.prices_include_tax ? 'Prices include GST.' : 'GST added to listed prices.'}</p>

        <Divider />
        <dl className="grid gap-1">
          <Meta label="Paid by" value={PAYMENT_LABELS[payment.method]} strong row />
          {payment.method === 'cash' ? (
            <>
              {payment.tendered_paise !== null && payment.tendered_paise !== undefined && (
                <Amount label="Cash received" paise={payment.tendered_paise} />
              )}
              <Amount label="Change" paise={payment.change_paise} />
            </>
          ) : (
            <>
              <Meta label="Reference" value={payment.reference} row />
              <p className="type-caption">Recorded by the cashier, not gateway-verified.</p>
            </>
          )}
        </dl>

        <p className="mt-5 text-center type-caption">Thank you for shopping with us.</p>
      </div>
    </Paper>
  )
}

function Divider() {
  return <hr aria-hidden className="my-3.5 border-0 border-t border-dashed border-line-strong print:border-ink-3" />
}

function Meta({ label, value, strong, row }: { label: string; value: string; strong?: boolean; row?: boolean }) {
  const content = (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className={cx('text-right tabular', strong && 'font-bold text-ink')}>{value}</dd>
    </>
  )
  return row ? <div className="flex justify-between gap-3">{content}</div> : content
}

function Amount({ label, paise, negative }: { label: string; paise: number; negative?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="min-w-0 text-ink-3">{label}</dt>
      <dd className="tabular whitespace-nowrap">
        {negative && '−'}
        {formatMoney(paise)}
      </dd>
    </div>
  )
}
