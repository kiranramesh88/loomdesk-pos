import { Archive, ArchiveRestore, ArrowRight, ClipboardList, PackageCheck, Pencil, Plus, Scale, Truck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Select, type SelectOption } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/toastContext'
import { formatMoney } from '@/lib/money'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { PurchaseListItem, PurchaseStatus, StatementEntry, SupplierDetail } from '@/types/domain'

import { useSupplierPurchases, useSupplierStatement, useUpdateSupplier } from '../api'
import { RecordPaymentDialog } from '../components/RecordPaymentDialog'
import { balanceLabel, formatDay, PURCHASE_STATUS_LABELS, SUPPLIER_STATUS_LABELS, unitsLabel } from '../labels'
import { PURCHASE_PAGE_SIZE } from '../supplierParams'
import { BackLink, WithSupplier } from './SupplierFormPages'

const purchaseLink = (number: string) => `/admin/suppliers/purchases/${number}`

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ? `min-w-0 ${className}` : 'min-w-0'}>
      <dt className="type-helper">{label}</dt>
      <dd className="mt-0.5 type-body font-strong break-words whitespace-pre-line text-ink-2">{children || '—'}</dd>
    </div>
  )
}

function Figures({ s }: { s: SupplierDetail }) {
  return (
    <section aria-label="Recorded figures" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard label="Recorded balance" icon={Scale} value={formatMoney(Math.abs(s.balance_paise))} footnote={balanceLabel(s.balance_paise)} />
      <KpiCard label="Goods received" icon={PackageCheck} value={formatMoney(s.received_paise)} footnote="Received purchases, GST included" />
      <KpiCard label="Payments recorded" icon={Wallet} value={formatMoney(s.paid_paise)} footnote="Entered by staff, not bank-verified" />
      <KpiCard label="Awaiting goods" icon={Truck} value={formatMoney(s.awaiting_paise)} footnote="Recorded, not owed until received" />
    </section>
  )
}

function StatusAction({ s }: { s: SupplierDetail }) {
  const [open, setOpen] = useState(false)
  const update = useUpdateSupplier(s.id)
  const { toast } = useToast()
  const deactivating = s.status === 'active'
  return (
    <>
      <Button icon={deactivating ? <Archive /> : <ArchiveRestore />} onClick={() => setOpen(true)}>
        {deactivating ? 'Deactivate' : 'Reactivate'}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={deactivating ? `Deactivate ${s.name}?` : `Reactivate ${s.name}?`}
        description={
          deactivating
            ? 'No new purchases can be recorded for them. Their purchases, payments and statement are kept, purchases already awaiting goods can still be received, and you can reactivate them at any time.'
            : 'You’ll be able to record purchases from them again.'
        }
        confirmLabel={deactivating ? 'Deactivate' : 'Reactivate'}
        pendingLabel={deactivating ? 'Deactivating…' : 'Reactivating…'}
        tone={deactivating ? 'danger' : 'primary'}
        onConfirm={async () => {
          await update.mutateAsync({ status: deactivating ? 'inactive' : 'active' })
          toast({ tone: 'success', title: deactivating ? 'Supplier deactivated' : 'Supplier reactivated', description: s.name })
        }}
      />
    </>
  )
}

const purchaseStatus = (p: { status: PurchaseStatus }) => (
  <StatusBadge tone={PURCHASE_STATUS_LABELS[p.status].tone}>{PURCHASE_STATUS_LABELS[p.status].label}</StatusBadge>
)

const PURCHASE_COLUMNS: Column<PurchaseListItem>[] = [
  {
    id: 'number',
    header: 'Purchase',
    width: '130px',
    cell: (p) => (
      <Link to={purchaseLink(p.number)} className="font-strong tabular text-ink-2 hover:text-primary hover:underline">
        {p.number}
      </Link>
    ),
  },
  { id: 'date', header: 'Invoice date', width: '130px', cell: (p) => <span className="tabular">{formatDay(p.purchase_date)}</span> },
  { id: 'invoice', header: 'Supplier invoice', cell: (p) => <span className="break-all tabular">{p.supplier_invoice_no || 'Not entered'}</span> },
  { id: 'items', header: 'Units', align: 'right', width: '90px', cell: (p) => <span className="tabular">{p.item_count}</span> },
  { id: 'total', header: 'Total', align: 'right', width: '140px', cell: (p) => <span className="type-amount">{formatMoney(p.total_paise)}</span> },
  { id: 'status', header: 'Status', width: '150px', cell: purchaseStatus },
]

const STATUS_FILTER: SelectOption[] = [
  { value: 'all', label: 'All purchases' },
  ...(Object.keys(PURCHASE_STATUS_LABELS) as PurchaseStatus[]).map((s) => ({ value: s, label: PURCHASE_STATUS_LABELS[s].label })),
]

function Purchases({ s, canRecord }: { s: SupplierDetail; canRecord: boolean }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<PurchaseStatus | ''>('')
  const purchases = useSupplierPurchases(s.id, page, status)
  const wide = useMediaQuery(MEDIA.wide)
  const data = purchases.data
  const empty = status ? (
    <EmptyState icon={<ClipboardList />} title="No purchases with this status" />
  ) : (
    <EmptyState
      icon={<ClipboardList />}
      title="No purchases yet"
      description="Record a purchase when you order or receive goods from this supplier. Stock goes up only when it’s received."
      action={canRecord ? <ButtonLink to="purchases/new">Record purchase</ButtonLink> : undefined}
    />
  )
  return (
    <Card aria-label="Purchases">
      <CardHeader
        title="Purchases"
        description="Stock is added only when a purchase is received."
        actions={
          <Select
            label="Purchase status"
            hideLabel
            options={STATUS_FILTER}
            value={status || 'all'}
            onValueChange={(v) => {
              setStatus(v === 'all' ? '' : (v as PurchaseStatus))
              setPage(1)
            }}
            className="w-44"
          />
        }
      />
      {purchases.error ? (
        <ErrorState message={purchases.error.message} onRetry={() => void purchases.refetch()} retrying={purchases.isRefetching} />
      ) : wide ? (
        <DataTable
          caption={`Purchases from ${s.name}`}
          columns={PURCHASE_COLUMNS}
          rows={data?.results}
          getRowId={(p) => p.id}
          isLoading={purchases.isPending}
          empty={empty}
          minWidth="760px"
        />
      ) : !data ? (
        <div className="p-5">
          <SkeletonText lines={3} />
        </div>
      ) : data.results.length === 0 ? (
        empty
      ) : (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {data.results.map((p) => (
            <li key={p.id}>
              <Link to={purchaseLink(p.number)} className="flex items-center gap-3 px-4 py-3.5 transition-control hover:bg-surface-muted">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-strong tabular text-ink-2">{p.number}</span>
                    <span className="type-amount">{formatMoney(p.total_paise)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 type-helper">
                    {purchaseStatus(p)}
                    <span className="tabular">{formatDay(p.purchase_date)}</span>
                    <span className="tabular">{unitsLabel(p.item_count)}</span>
                    {p.supplier_invoice_no && <span className="break-all tabular">Inv. {p.supplier_invoice_no}</span>}
                  </div>
                </div>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && data.count > 0 && !purchases.error && (
        <Pagination
          page={page}
          pageSize={PURCHASE_PAGE_SIZE}
          count={data.count}
          busy={purchases.isPlaceholderData}
          onPage={setPage}
          label="Purchase pages"
          noun="purchases"
        />
      )}
    </Card>
  )
}

function EntryLabel({ e }: { e: StatementEntry }) {
  return e.kind === 'purchase' ? (
    <div className="min-w-0">
      <Link to={purchaseLink(e.reference)} className="font-strong tabular text-ink-2 hover:text-primary hover:underline">
        {e.reference}
      </Link>
      <div className="type-helper break-all">Goods received · {e.detail}</div>
    </div>
  ) : (
    <div className="min-w-0">
      <div className="font-strong text-ink-2">{e.detail}</div>
      <div className="type-helper break-all">{e.reference ? `Ref. ${e.reference}` : 'No reference'}</div>
    </div>
  )
}

const money = (paise: number) => (paise ? <span className="type-amount">{formatMoney(paise)}</span> : <span className="type-helper">—</span>)

const STATEMENT_COLUMNS: Column<StatementEntry & { key: string }>[] = [
  { id: 'date', header: 'Date', width: '120px', cell: (e) => <span className="tabular">{formatDay(e.date)}</span> },
  { id: 'entry', header: 'Entry', cell: (e) => <EntryLabel e={e} /> },
  { id: 'owed', header: 'Owed', align: 'right', width: '130px', cell: (e) => money(e.debit_paise) },
  { id: 'paid', header: 'Paid', align: 'right', width: '130px', cell: (e) => money(e.credit_paise) },
  { id: 'balance', header: 'Balance', align: 'right', width: '140px', cell: (e) => <span className="type-amount">{formatMoney(e.balance_paise)}</span> },
]

function Statement({ s }: { s: SupplierDetail }) {
  const statement = useSupplierStatement(s.id)
  const wide = useMediaQuery(MEDIA.abovephone)
  const rows = statement.data?.entries.map((e, i) => ({ ...e, key: `${e.kind}-${e.reference}-${i}` }))
  const empty = (
    <EmptyState icon={<Scale />} title="Nothing recorded yet" description="Received purchases and recorded payments appear here, oldest first." />
  )
  return (
    <Card aria-label="Statement">
      <CardHeader
        title="Statement"
        description="Received purchases and recorded payments, oldest first, with the running recorded balance. Purchases awaiting goods aren’t owed yet."
      />
      {statement.error ? (
        <ErrorState message={statement.error.message} onRetry={() => void statement.refetch()} retrying={statement.isRefetching} />
      ) : wide ? (
        <DataTable
          caption={`Statement for ${s.name}`}
          columns={STATEMENT_COLUMNS}
          rows={rows}
          getRowId={(e) => e.key}
          isLoading={statement.isPending}
          empty={empty}
          minWidth="620px"
        />
      ) : !rows ? (
        <div className="p-5">
          <SkeletonText lines={3} />
        </div>
      ) : rows.length === 0 ? (
        empty
      ) : (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {rows.map((e) => (
            <li key={e.key} className="flex items-start justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <EntryLabel e={e} />
                <div className="type-caption tabular">{formatDay(e.date)}</div>
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
        <p className="border-t border-line-soft px-4 py-3 type-helper sm:px-5">
          Recorded balance: <span className="font-strong text-ink-2">{balanceLabel(statement.data.balance_paise)}</span>. Payments are
          entered by staff and aren’t verified against a bank statement.
        </p>
      )}
    </Card>
  )
}

function Profile({ s }: { s: SupplierDetail }) {
  const [paying, setPaying] = useState(false)
  const status = SUPPLIER_STATUS_LABELS[s.status]
  const active = s.status === 'active'
  return (
    <>
      <BackLink to="/admin/suppliers" label="Suppliers" />
      <PageHeader
        title={s.name}
        description={`${s.category} · ${status.label}`}
        actions={
          <>
            <StatusAction s={s} />
            <ButtonLink to="edit" icon={<Pencil />}>
              Edit
            </ButtonLink>
            <Button icon={<Wallet />} onClick={() => setPaying(true)}>
              Record payment
            </Button>
            {active && (
              <ButtonLink to="purchases/new" variant="primary" icon={<Plus />}>
                Record purchase
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="flex flex-col gap-5">
        {!active && (
          <p className="flex flex-wrap items-center gap-2 type-body">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            Reactivate this supplier to record new purchases. Its history is kept.
          </p>
        )}
        <Figures s={s} />
        <Card aria-label="Supplier details">
          <CardBody className="pt-5 sm:px-6 sm:pt-6 sm:pb-6">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Contact person">{s.contact_name}</Fact>
              <Fact label="Phone">{s.phone}</Fact>
              <Fact label="Email">{s.email}</Fact>
              <Fact label="GSTIN">{s.gstin}</Fact>
              <Fact label="State">{s.state}</Fact>
              <Fact label="Address" className="sm:col-span-2 lg:col-span-3">
                {s.address}
              </Fact>
              {s.notes && (
                <Fact label="Notes" className="sm:col-span-2 lg:col-span-4">
                  {s.notes}
                </Fact>
              )}
            </dl>
          </CardBody>
        </Card>
        <Purchases s={s} canRecord={active} />
        <Statement s={s} />
      </div>
      <RecordPaymentDialog supplier={s} open={paying} onOpenChange={setPaying} />
    </>
  )
}

export function SupplierProfilePage() {
  return <WithSupplier back={() => <BackLink to="/admin/suppliers" label="Suppliers" />}>{(s) => <Profile s={s} />}</WithSupplier>
}

