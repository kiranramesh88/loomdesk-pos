import { CircleCheck, Plus, Printer } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Dialog } from '@/components/ui/Dialog'
import { formatMoney } from '@/lib/money'
import type { Sale } from '@/types/domain'

import { PAYMENT_LABELS } from '../receipt'

/** Shown after the server saved the sale. Everything on it comes from that saved sale. */
export function SaleCompleteDialog({ sale, onNewSale }: { sale: Sale | null; onNewSale: () => void }) {
  const units = sale?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0
  return (
    <Dialog
      open={sale !== null}
      onOpenChange={(open) => !open && onNewSale()}
      title="Sale completed"
      description={sale ? `Invoice ${sale.invoice_no} is saved.` : undefined}
      footer={
        sale && (
          <>
            <ButtonLink to={`/billing/receipt/${encodeURIComponent(sale.invoice_no)}`} icon={<Printer />}>
              View & print receipt
            </ButtonLink>
            <Button variant="primary" icon={<Plus />} onClick={onNewSale}>
              New sale
            </Button>
          </>
        )
      }
    >
      {sale && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-success-bg text-success [&_svg]:size-6">
              <CircleCheck />
            </span>
            <div>
              <p className="type-caption">Total paid</p>
              <p className="type-figure">{formatMoney(sale.total_paise)}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-line bg-surface-tint px-4 py-3.5">
            <Item label="Invoice number" value={sale.invoice_no} />
            <Item label="Payment" value={PAYMENT_LABELS[sale.payment.method]} />
            <Item label="Items" value={String(units)} />
            {sale.payment.method === 'cash' ? (
              <Item label="Change to give" value={formatMoney(sale.payment.change_paise)} />
            ) : (
              <Item label="Reference" value={sale.payment.reference} />
            )}
          </dl>
          {sale.payment.method !== 'cash' && (
            <p className="mt-3 type-helper">Recorded by the cashier, not gateway-verified.</p>
          )}
        </div>
      )}
    </Dialog>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption">{label}</dt>
      <dd className="truncate tabular text-body font-strong text-ink-2">{value}</dd>
    </div>
  )
}
