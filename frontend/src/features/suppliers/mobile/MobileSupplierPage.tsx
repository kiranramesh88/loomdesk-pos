import { ClipboardList, Mail, Monitor, Phone, Scale, Truck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { buttonClass } from '@/components/ui/buttonStyles'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'
import { KpiCard } from '@/components/ui/KpiCard'
import { Pagination } from '@/components/ui/Pagination'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import type { PurchaseStatus, SupplierDetail } from '@/types/domain'

import { useSupplier, useSupplierPayments, useSupplierPurchases, useSupplierStatement } from '../api'
import { balanceLabel, formatDay, PAYMENT_METHOD_LABELS, PURCHASE_STATUS_LABELS, SUPPLIER_STATUS_LABELS } from '../labels'
import { PURCHASE_PAGE_SIZE, parseSupplierId } from '../supplierParams'
import { MobilePurchaseRows } from './MobilePurchaseRows'

const back = { to: mobilePath('suppliers'), label: 'Suppliers' }

function Figures({ s }: { s: SupplierDetail }) {
  return (
    <section aria-label="Recorded figures" className="grid grid-cols-2 gap-2.5">
      <KpiCard label="Recorded balance" icon={Scale} value={formatMoney(Math.abs(s.balance_paise))} footnote={balanceLabel(s.balance_paise)} />
      <KpiCard label="Goods received" icon={Truck} value={formatMoney(s.received_paise)} footnote="GST included" />
      <KpiCard label="Payments recorded" icon={Wallet} value={formatMoney(s.paid_paise)} footnote="Not bank-verified" />
      <KpiCard label="Awaiting goods" icon={ClipboardList} value={formatMoney(s.awaiting_paise)} footnote="Not owed until received" />
    </section>
  )
}

type PurchaseFilter = PurchaseStatus | 'all'
const PURCHASE_CHIPS: ChipOption<PurchaseFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'ordered', label: 'Awaiting' },
  { value: 'received', label: 'Received' },
]

function Purchases({ s }: { s: SupplierDetail }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<PurchaseFilter>('all')
  const purchases = useSupplierPurchases(s.id, page, status === 'all' ? '' : status)
  const data = purchases.data
  return (
    <MobilePanel title="Purchases" description="Stock is added only when a purchase is received.">
      <div className="px-4 pb-3">
        <ChipGroup
          label="Purchase status"
          hideLabel
          columns={3}
          options={PURCHASE_CHIPS}
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        />
      </div>
      {purchases.isError ? (
        <ErrorState message={purchases.error.message} onRetry={() => void purchases.refetch()} retrying={purchases.isRefetching} />
      ) : !data ? (
        <MobileRowsSkeleton label="Loading purchases" />
      ) : data.results.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={status === 'all' ? 'No purchases yet' : `No ${PURCHASE_STATUS_LABELS[status].label.toLowerCase()} purchases`}
        />
      ) : (
        <MobilePurchaseRows purchases={data.results} />
      )}
      {data && data.count > PURCHASE_PAGE_SIZE && !purchases.isError && (
        <Pagination
          size="touch"
          page={page}
          pageSize={PURCHASE_PAGE_SIZE}
          count={data.count}
          busy={purchases.isPlaceholderData}
          onPage={setPage}
          label="Purchase pages"
          noun="purchases"
        />
      )}
    </MobilePanel>
  )
}

function Payments({ s }: { s: SupplierDetail }) {
  const [page, setPage] = useState(1)
  const payments = useSupplierPayments(s.id, page)
  const data = payments.data
  return (
    <MobilePanel title="Recorded payments" description="Entered by staff. None is verified against a bank or payment gateway.">
      {payments.isError ? (
        <ErrorState message={payments.error.message} onRetry={() => void payments.refetch()} retrying={payments.isRefetching} />
      ) : !data ? (
        <MobileRowsSkeleton rows={2} label="Loading payments" />
      ) : data.results.length === 0 ? (
        <EmptyState icon={<Wallet />} title="No payments recorded" />
      ) : (
        <ul aria-label="Recorded payments" className="divide-y divide-line-soft border-t border-line-soft">
          {data.results.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="type-body font-strong text-ink-2">{PAYMENT_METHOD_LABELS[p.method]}</p>
                <p className="type-helper">
                  {formatDay(p.paid_on)}
                  {p.reference && <span className="tabular break-all"> · Ref. {p.reference}</span>}
                </p>
                <p className="type-caption">
                  Recorded by {p.recorded_by_name ?? 'staff'} · {p.gateway_verified ? 'Verified' : 'Not verified'}
                </p>
              </div>
              <span className="shrink-0 type-amount">{formatMoney(p.amount_paise)}</span>
            </li>
          ))}
        </ul>
      )}
      {data && data.count > PURCHASE_PAGE_SIZE && !payments.isError && (
        <Pagination
          size="touch"
          page={page}
          pageSize={PURCHASE_PAGE_SIZE}
          count={data.count}
          busy={payments.isPlaceholderData}
          onPage={setPage}
          label="Payment pages"
          noun="payments"
        />
      )}
    </MobilePanel>
  )
}

function Statement({ s }: { s: SupplierDetail }) {
  const statement = useSupplierStatement(s.id)
  const entries = statement.data?.entries
  return (
    <MobilePanel title="Statement" description="Received purchases and recorded payments, oldest first, with the running recorded balance.">
      {statement.isError ? (
        <ErrorState message={statement.error.message} onRetry={() => void statement.refetch()} retrying={statement.isRefetching} />
      ) : !entries ? (
        <MobileRowsSkeleton label="Loading statement" />
      ) : entries.length === 0 ? (
        <EmptyState icon={<Scale />} title="Nothing recorded yet" />
      ) : (
        <ul aria-label="Statement entries" className="divide-y divide-line-soft border-t border-line-soft">
          {entries.map((e, i) => (
            <li key={`${e.kind}-${e.reference}-${i}`} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                {e.kind === 'purchase' ? (
                  <Link
                    to={mobilePath(`purchases/${e.reference}`)}
                    className="inline-flex min-h-8 items-center type-body font-strong tabular text-primary hover:underline"
                  >
                    {e.reference}
                  </Link>
                ) : (
                  <p className="type-body font-strong text-ink-2">{e.detail}</p>
                )}
                <p className="type-helper break-all">
                  {e.kind === 'purchase' ? `Goods received · ${e.detail}` : e.reference ? `Ref. ${e.reference}` : 'No reference'}
                </p>
                <p className="type-caption tabular">{formatDay(e.date)}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="type-amount">{e.debit_paise ? `+${formatMoney(e.debit_paise)}` : `−${formatMoney(e.credit_paise)}`}</div>
                <div className="type-caption tabular">Balance {formatMoney(e.balance_paise)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {statement.data && statement.data.entries.length > 0 && (
        <p className="border-t border-line-soft px-4 py-3 type-helper">
          Recorded balance: <span className="font-strong text-ink-2">{balanceLabel(statement.data.balance_paise)}</span>. This is
          an operational record, not a bank-reconciled account.
        </p>
      )}
    </MobilePanel>
  )
}

function Profile({ s }: { s: SupplierDetail }) {
  const status = SUPPLIER_STATUS_LABELS[s.status]
  return (
    <>
      <MobilePageHeader
        title={s.name}
        description={s.category}
        back={back}
        actions={
          (s.phone || s.email) && (
            <>
              {s.phone && (
                <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} className={buttonClass('secondary', 'lg')}>
                  <Phone aria-hidden />
                  Call
                </a>
              )}
              {s.email && (
                <a href={`mailto:${s.email}`} className={buttonClass('secondary', 'lg')}>
                  <Mail aria-hidden />
                  Email
                </a>
              )}
            </>
          )
        }
      />
      <div className="grid gap-4">
        {s.status !== 'active' && (
          <p className="flex flex-wrap items-center gap-2 type-body">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            New purchases can’t be recorded. Its history is kept.
          </p>
        )}
        <Figures s={s} />
        <MobilePanel title="Contact">
          <MobileFacts>
            <MobileFact label="Contact person">{s.contact_name || '—'}</MobileFact>
            <MobileFact label="Phone">{s.phone ? <span className="tabular">{s.phone}</span> : '—'}</MobileFact>
            <MobileFact label="Email">{s.email ? <span className="break-all">{s.email}</span> : '—'}</MobileFact>
            <MobileFact label="GSTIN">{s.gstin ? <span className="tabular">{s.gstin}</span> : '—'}</MobileFact>
            <MobileFact label="State">{s.state || '—'}</MobileFact>
            <MobileFact label="Address">
              <span className="whitespace-pre-line">{s.address || '—'}</span>
            </MobileFact>
            {s.notes && (
              <MobileFact label="Notes">
                <span className="whitespace-pre-line">{s.notes}</span>
              </MobileFact>
            )}
          </MobileFacts>
        </MobilePanel>
        <Purchases s={s} />
        <Payments s={s} />
        <Statement s={s} />
        <ButtonLink to={`/admin/suppliers/${s.id}`} size="lg" icon={<Monitor />}>
          Edit or record in the full admin
        </ButtonLink>
      </div>
    </>
  )
}

/** `/admin/mobile/suppliers/:supplierId`: contact, recorded figures, purchases, payments and the statement. Read-only. */
export function MobileSupplierPage() {
  const id = parseSupplierId(useParams().supplierId)
  const supplier = useSupplier(id)
  if (id === null || (supplier.error instanceof ApiError && supplier.error.status === 404)) {
    return (
      <>
        <MobilePageHeader title="Supplier not found" back={back} />
        <Card>
          <EmptyState
            icon={<Truck />}
            title="No supplier at this address"
            description="Suppliers are deactivated, never deleted, so search the list."
            action={<ButtonLink to={back.to}>Back to suppliers</ButtonLink>}
          />
        </Card>
      </>
    )
  }
  if (supplier.isError) {
    return (
      <>
        <MobilePageHeader title="Supplier" back={back} />
        <Card>
          <ErrorState message={supplier.error.message} onRetry={() => void supplier.refetch()} retrying={supplier.isRefetching} />
        </Card>
      </>
    )
  }
  if (!supplier.data) {
    return (
      <>
        <MobilePageHeader title="Supplier" back={back} />
        <Card role="status" aria-label="Loading supplier" className="p-4">
          <SkeletonText lines={5} />
        </Card>
      </>
    )
  }
  return <Profile s={supplier.data} />
}
