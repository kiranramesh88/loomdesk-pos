import { SearchX, Users } from 'lucide-react'
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
import { useDebouncedSearch } from '@/lib/useDebouncedSearch'

import { useStaffList } from '../api'
import { ROLE_LABELS, STATUS_LABELS, staffStatus } from '../labels'
import { hasFilters, PAGE_SIZE, readParams, STATUSES, writeParams, type StaffParams, type StaffStatus } from '../staffParams'

type Choice = StaffStatus | 'all'

const CHIPS: ChipOption<Choice>[] = [{ value: 'all', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s].label }))]

/** `/admin/mobile/staff`: who has an account, their role and whether they can sign in. Changes are made in the full admin. */
export function MobileStaffPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const staff = useStaffList(params)
  const update = useCallback(
    (next: Partial<StaffParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const query = useDebouncedSearch(params.q, (q) => update({ q }))
  const data = staff.data
  const pageMissing = staff.error instanceof ApiError && staff.error.status === 404

  return (
    <>
      <MobilePageHeader
        title="Staff & access"
        description="Accounts, roles and approval PINs. Add staff or change access in the full admin."
        back={{ to: mobilePath('more'), label: 'More' }}
      />
      <div className="mb-4 grid gap-3">
        <SearchInput label="Search staff" size="lg" placeholder="Name or email…" value={query.value} onValueChange={query.type} />
        <ChipGroup label="Status" hideLabel options={CHIPS} value={params.status || 'all'} onValueChange={(v) => update({ status: v === 'all' ? '' : v })} />
      </div>
      <MobilePanel title="Staff" description={data ? `${data.count.toLocaleString('en-IN')} found.` : undefined}>
        {pageMissing ? (
          <EmptyState icon={<SearchX />} title="That page doesn’t exist" action={<Button onClick={() => update({})}>Go to the first page</Button>} />
        ) : staff.isError ? (
          <ErrorState message={staff.error.message} onRetry={() => void staff.refetch()} retrying={staff.isRefetching} />
        ) : !data ? (
          <MobileRowsSkeleton rows={4} label="Loading staff" />
        ) : data.results.length === 0 ? (
          hasFilters(params) ? (
            <EmptyState icon={<SearchX />} title="No staff match" description="Try another name, or clear the filter." />
          ) : (
            <EmptyState icon={<Users />} title="No staff yet" />
          )
        ) : (
          <MobileList label="Staff">
            {data.results.map((m) => {
              const status = STATUS_LABELS[staffStatus(m)]
              return (
                <MobileRow
                  key={m.id}
                  to={mobilePath(`staff/${m.id}`)}
                  title={m.full_name}
                  meta={
                    <>
                      <span>{ROLE_LABELS[m.role].label}</span>
                      <span className="break-all">{m.email}</span>
                    </>
                  }
                  aside={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                />
              )
            })}
          </MobileList>
        )}
        {data && data.count > 0 && !staff.isError && (
          <Pagination
            size="touch"
            page={params.page}
            pageSize={PAGE_SIZE}
            count={data.count}
            busy={staff.isPlaceholderData}
            onPage={(page) => update({ page })}
            label="Staff pages"
            noun="accounts"
          />
        )}
      </MobilePanel>
    </>
  )
}
