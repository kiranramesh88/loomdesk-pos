import { SearchX, Truck } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileList, MobilePageHeader, MobilePanel, MobileRow } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { ApiError } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'
import type { SupplierStatus } from '@/types/domain'

import { useSuppliers } from '../api'
import { SUPPLIER_STATUS_LABELS } from '../labels'
import { hasFilters, PAGE_SIZE, readParams, STATUSES, writeParams, type SupplierParams } from '../supplierParams'

type StatusChoice = SupplierStatus | 'all'

const STATUS_CHIPS: ChipOption<StatusChoice>[] = [
  { value: 'all', label: 'All' },
  ...STATUSES.map((s) => ({ value: s, label: SUPPLIER_STATUS_LABELS[s].label })),
]

/** `/admin/mobile/suppliers`: find a supplier by name, contact, phone or GSTIN. */
export function MobileSuppliersPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const suppliers = useSuppliers(params)
  const update = useCallback(
    (next: Partial<SupplierParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const query = useDebouncedSearch(params.q, (q) => update({ q }))
  const data = suppliers.data
  const pageMissing = suppliers.error instanceof ApiError && suppliers.error.status === 404

  return (
    <>
      <MobilePageHeader
        title="Suppliers"
        description="Recorded balance is received purchases minus payments recorded by staff."
        back={{ to: mobilePath('more'), label: 'More' }}
      />
      <div className="mb-4 grid gap-3">
        <SearchInput label="Search suppliers" size="lg" placeholder="Name, contact, phone or GSTIN…" value={query.value} onValueChange={query.type} />
        <ChipGroup
          label="Status"
          hideLabel
          options={STATUS_CHIPS}
          value={params.status || 'all'}
          onValueChange={(v) => update({ status: v === 'all' ? '' : v })}
        />
      </div>
      <MobilePanel title="Suppliers" description={data ? `${data.count.toLocaleString('en-IN')} found.` : undefined}>
        {pageMissing ? (
          <EmptyState icon={<SearchX />} title="That page doesn’t exist" action={<Button onClick={() => update({})}>Go to the first page</Button>} />
        ) : suppliers.isError ? (
          <ErrorState message={suppliers.error.message} onRetry={() => void suppliers.refetch()} retrying={suppliers.isRefetching} />
        ) : !data ? (
          <MobileRowsSkeleton rows={4} label="Loading suppliers" />
        ) : data.results.length === 0 ? (
          hasFilters(params) ? (
            <EmptyState icon={<SearchX />} title="No suppliers match" description="Try another name, phone or GSTIN." />
          ) : (
            <EmptyState icon={<Truck />} title="No suppliers yet" description="Suppliers are added in the full admin." />
          )
        ) : (
          <MobileList label="Suppliers">
            {data.results.map((s) => (
              <MobileRow
                key={s.id}
                to={mobilePath(`suppliers/${s.id}`)}
                title={s.name}
                meta={
                  <>
                    {s.status !== 'active' && <StatusBadge tone="neutral">{SUPPLIER_STATUS_LABELS[s.status].label}</StatusBadge>}
                    <span>{s.category}</span>
                    {s.phone && <span className="tabular">{s.phone}</span>}
                  </>
                }
                aside={
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="type-amount">{formatMoney(Math.abs(s.balance_paise))}</span>
                    <span className="type-caption">{s.balance_paise > 0 ? 'due' : s.balance_paise < 0 ? 'in advance' : 'nothing due'}</span>
                  </div>
                }
              />
            ))}
          </MobileList>
        )}
        {data && data.count > 0 && !suppliers.isError && (
          <Pagination
            size="touch"
            page={params.page}
            pageSize={PAGE_SIZE}
            count={data.count}
            busy={suppliers.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Supplier pages"
            noun="suppliers"
          />
        )}
      </MobilePanel>
    </>
  )
}
