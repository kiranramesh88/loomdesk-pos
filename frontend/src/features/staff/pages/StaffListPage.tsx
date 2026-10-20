import { ArrowRight, SearchX, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ApiError } from '@/lib/http'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { StaffCreated, StaffMember } from '@/types/domain'

import { useStaffList } from '../api'
import { SetupLinkDialog } from '../components/SetupLinkDialog'
import { AddStaffDialog } from '../components/StaffDialogs'
import { canHavePin, lastSignIn, ROLE_LABELS, STATUS_LABELS, staffStatus } from '../labels'
import { hasFilters, PAGE_SIZE, readParams, ROLES, STATUSES, writeParams, type StaffParams } from '../staffParams'

const ALL = 'all'
const ROLE_OPTIONS: SelectOption[] = [{ value: ALL, label: 'Every role' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r].label }))]
const STATUS_OPTIONS: SelectOption[] = [{ value: ALL, label: 'Any status' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s].label }))]

function Status({ member }: { member: StaffMember }) {
  const status = STATUS_LABELS[staffStatus(member)]
  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
}

const pinLabel = (m: StaffMember) => (canHavePin(m.role) ? (m.has_pin ? 'Set' : 'Not set') : '—')

const COLUMNS: Column<StaffMember>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (m) => (
      <div className="min-w-0">
        <Link to={String(m.id)} className="font-strong break-words text-ink-2 hover:text-primary hover:underline">
          {m.full_name}
        </Link>
        <div className="type-helper break-all">{m.email}</div>
      </div>
    ),
  },
  { id: 'role', header: 'Role', width: '150px', cell: (m) => ROLE_LABELS[m.role].label },
  { id: 'status', header: 'Status', width: '170px', cell: (m) => <Status member={m} /> },
  {
    id: 'pin',
    header: 'Approval PIN',
    width: '130px',
    cell: (m) => <span className={canHavePin(m.role) ? undefined : 'text-ink-3'}>{pinLabel(m)}</span>,
  },
  { id: 'last', header: 'Last sign-in', width: '190px', cell: (m) => <span className="tabular">{lastSignIn(m)}</span> },
]

function StaffCards({ rows }: { rows: StaffMember[] }) {
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {rows.map((m) => (
        <li key={m.id}>
          <Link
            to={String(m.id)}
            className="flex items-center gap-3 px-4 py-3.5 transition-control hover:bg-surface-muted focus-visible:bg-surface-muted"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-strong break-words text-ink-2">{m.full_name}</span>
                <Status member={m} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 type-helper">
                <span className="break-all">{m.email}</span>
                <span>{ROLE_LABELS[m.role].label}</span>
                {canHavePin(m.role) && <span>PIN {pinLabel(m).toLowerCase()}</span>}
                <span>Last sign-in {lastSignIn(m)}</span>
              </div>
            </div>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Toolbar({ params, onChange, onClear }: { params: StaffParams; onChange: (next: Partial<StaffParams>) => void; onClear: () => void }) {
  // Typing stays local; the URL (and the request) follow once typing pauses.
  const [search, setSearch] = useState(params.q)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const [synced, setSynced] = useState(params.q)
  if (params.q !== synced) {
    setSynced(params.q)
    setSearch(params.q)
  }
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(2,minmax(0,200px))]">
        <SearchInput
          label="Search staff"
          placeholder="Name or email…"
          value={search}
          onValueChange={(value) => {
            setSearch(value)
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => onChange({ q: value.trim() }), 300)
          }}
          className="col-span-2 lg:col-span-1"
        />
        <Select
          label="Role"
          hideLabel
          options={ROLE_OPTIONS}
          value={params.role || ALL}
          onValueChange={(v) => onChange({ role: v === ALL ? '' : (v as StaffParams['role']) })}
        />
        <Select
          label="Status"
          hideLabel
          options={STATUS_OPTIONS}
          value={params.status || ALL}
          onValueChange={(v) => onChange({ status: v === ALL ? '' : (v as StaffParams['status']) })}
        />
      </div>
      {hasFilters(params) && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="type-helper">Showing staff that match the filters.</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              window.clearTimeout(timer.current)
              setSearch('')
              onClear()
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}

/** `/admin/staff`: every account, its role, PIN and last sign-in. Accounts are deactivated, never deleted. */
export function StaffListPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const staff = useStaffList(params)
  const wide = useMediaQuery(MEDIA.wide)
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [created, setCreated] = useState<StaffCreated | null>(null)

  const update = useCallback(
    (next: Partial<StaffParams>) => setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])

  const data = staff.data
  const empty = hasFilters(params) ? (
    <EmptyState
      icon={<SearchX />}
      title="No staff match"
      description="Try another name, role or status, or clear the filters."
      action={<Button onClick={clear}>Clear filters</Button>}
    />
  ) : (
    <EmptyState icon={<Users />} title="No staff yet" description="Add the people who use the till." action={<Button onClick={() => setAdding(true)}>Add staff</Button>} />
  )
  const pageMissing = staff.error instanceof ApiError && staff.error.status === 404

  return (
    <>
      <PageHeader
        title="Staff & access"
        description="Who can sign in, what their role allows, and who can approve discounts."
        actions={
          <Button variant="primary" icon={<UserPlus />} onClick={() => setAdding(true)}>
            Add staff
          </Button>
        }
      />
      <Card aria-label="Staff">
        <Toolbar params={params} onChange={update} onClear={clear} />
        {pageMissing ? (
          <EmptyState
            icon={<SearchX />}
            title="That page doesn’t exist"
            description="There are fewer pages of staff now."
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : wide ? (
          <DataTable
            caption="Staff"
            columns={COLUMNS}
            rows={data?.results}
            getRowId={(m) => m.id}
            isLoading={staff.isPending}
            error={staff.error}
            onRetry={() => void staff.refetch()}
            retrying={staff.isRefetching}
            empty={empty}
            minWidth="860px"
          />
        ) : staff.error ? (
          <ErrorState message={staff.error.message} onRetry={() => void staff.refetch()} retrying={staff.isRefetching} />
        ) : !data ? (
          <div aria-hidden className="grid gap-3 px-4 py-4">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ) : data.results.length === 0 ? (
          empty
        ) : (
          <StaffCards rows={data.results} />
        )}
        {data && data.count > 0 && !staff.error && (
          <Pagination
            page={params.page}
            count={data.count}
            busy={staff.isPlaceholderData}
            onPage={(page) => update({ page })}
            pageSize={PAGE_SIZE}
            label="Staff pages"
            noun="staff"
          />
        )}
      </Card>
      <AddStaffDialog open={adding} onOpenChange={setAdding} onCreated={setCreated} />
      <SetupLinkDialog
        link={created?.setup_link ?? null}
        name={created?.staff.full_name ?? ''}
        onDone={() => {
          const id = created?.staff.id
          setCreated(null)
          if (id) navigate(String(id))
        }}
      />
    </>
  )
}
