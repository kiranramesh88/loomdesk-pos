import { ArrowRight, Plus, SearchX, Truck } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { SupplierListItem } from '@/types/domain'

import { useSupplierCategories, useSuppliers } from '../api'
import { SupplierToolbar } from '../components/SupplierToolbar'
import { SUPPLIER_STATUS_LABELS } from '../labels'
import { hasFilters, PAGE_SIZE, readParams, writeParams, type SupplierParams } from '../supplierParams'

function Contact({ s }: { s: SupplierListItem }) {
  const parts = [s.contact_name, s.phone, s.email].filter(Boolean)
  if (!parts.length) return <span className="type-helper">Not recorded</span>
  return (
    <div className="min-w-0">
      {s.contact_name && <div className="break-words text-ink-2">{s.contact_name}</div>}
      {s.phone && <div className="type-helper tabular">{s.phone}</div>}
      {s.email && <div className="type-helper break-all">{s.email}</div>}
    </div>
  )
}

/** Positive: owed to the supplier. Negative: paid ahead of goods received. */
function Balance({ paise }: { paise: number }) {
  return (
    <div>
      <div className="type-amount">{formatMoney(Math.abs(paise))}</div>
      {paise < 0 && <div className="type-caption">paid in advance</div>}
    </div>
  )
}

const statusBadge = (s: SupplierListItem) => (
  <StatusBadge tone={SUPPLIER_STATUS_LABELS[s.status].tone}>{SUPPLIER_STATUS_LABELS[s.status].label}</StatusBadge>
)

const COLUMNS: Column<SupplierListItem>[] = [
  {
    id: 'name',
    header: 'Supplier',
    cell: (s) => (
      <Link to={String(s.id)} className="font-strong break-words text-ink-2 hover:text-primary hover:underline">
        {s.name}
      </Link>
    ),
  },
  { id: 'category', header: 'Category', width: '170px', cell: (s) => <span className="break-words">{s.category}</span> },
  { id: 'contact', header: 'Contact', width: '260px', cell: (s) => <Contact s={s} /> },
  { id: 'balance', header: 'Recorded balance', align: 'right', width: '170px', cell: (s) => <Balance paise={s.balance_paise} /> },
  { id: 'status', header: 'Status', width: '110px', cell: statusBadge },
]

function SupplierCards({ rows }: { rows: SupplierListItem[] }) {
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {rows.map((s) => (
        <li key={s.id}>
          <Link
            to={String(s.id)}
            className="flex items-center gap-3 px-4 py-3.5 transition-control hover:bg-surface-muted focus-visible:bg-surface-muted"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-strong break-words text-ink-2">{s.name}</span>
                <Balance paise={s.balance_paise} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 type-helper">
                {statusBadge(s)}
                <span>{s.category}</span>
                {(s.contact_name || s.phone) && <span>{[s.contact_name, s.phone].filter(Boolean).join(' · ')}</span>}
              </div>
            </div>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function CardsSkeleton() {
  return (
    <div aria-hidden className="divide-y divide-line-soft border-t border-line-soft">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-4">
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  )
}

export function SupplierListPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const suppliers = useSuppliers(params)
  const categories = useSupplierCategories()
  const wide = useMediaQuery(MEDIA.wide)

  const update = useCallback(
    (next: Partial<SupplierParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])

  const data = suppliers.data
  const empty = hasFilters(params) ? (
    <EmptyState
      icon={<SearchX />}
      title="No suppliers match"
      description="Try another name, phone or GSTIN, or clear the filters."
      action={<Button onClick={clear}>Clear filters</Button>}
    />
  ) : (
    <EmptyState
      icon={<Truck />}
      title="No suppliers yet"
      description="Add the businesses you buy stock from, then record purchases against them."
      action={<ButtonLink to="new">Add supplier</ButtonLink>}
    />
  )
  const pageMissing = suppliers.error instanceof ApiError && suppliers.error.status === 404

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy from, what you’ve received and what the records say is due."
        actions={
          <ButtonLink to="new" variant="primary" icon={<Plus />}>
            Add supplier
          </ButtonLink>
        }
      />
      <Card aria-label="Suppliers">
        <SupplierToolbar params={params} categories={categories.data} onChange={update} onClear={clear} />
        {pageMissing ? (
          <EmptyState
            icon={<SearchX />}
            title="That page doesn’t exist"
            description="There are fewer pages of suppliers now."
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : wide ? (
          <DataTable
            caption="Suppliers"
            columns={COLUMNS}
            rows={data?.results}
            getRowId={(s) => s.id}
            isLoading={suppliers.isPending}
            error={suppliers.error}
            onRetry={() => void suppliers.refetch()}
            retrying={suppliers.isRefetching}
            empty={empty}
            minWidth="820px"
          />
        ) : suppliers.error ? (
          <ErrorState message={suppliers.error.message} onRetry={() => void suppliers.refetch()} retrying={suppliers.isRefetching} />
        ) : !data ? (
          <CardsSkeleton />
        ) : data.results.length === 0 ? (
          empty
        ) : (
          <SupplierCards rows={data.results} />
        )}
        {data && data.count > 0 && !suppliers.error && (
          <Pagination
            page={params.page}
            pageSize={PAGE_SIZE}
            count={data.count}
            busy={suppliers.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Supplier pages"
            noun="suppliers"
          />
        )}
      </Card>
      <p className="mt-3 type-helper">
        Recorded balance is received purchases minus payments recorded here. Payments are entered by staff and aren’t verified
        against a bank statement.
      </p>
    </>
  )
}
