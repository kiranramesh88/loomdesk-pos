import { Monitor, UserX } from 'lucide-react'
import { useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { ApiError } from '@/lib/http'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { StaffMember } from '@/types/domain'

import { parseStaffId, useStaffMember } from '../api'
import { canHavePin, formatWhen, lastSignIn, ROLE_LABELS, STATUS_LABELS, staffStatus } from '../labels'

const back = { to: mobilePath('staff'), label: 'Staff' }

/** `/admin/mobile/staff/:staffId`: one account, read-only. Role, PIN and access changes stay in the full admin. */
export function MobileStaffMemberPage() {
  const id = parseStaffId(useParams().staffId)
  return id === null ? <Missing /> : <Load id={id} />
}

function Load({ id }: { id: number }) {
  const member = useStaffMember(id)
  if (member.isPending) {
    return (
      <>
        <MobilePageHeader title="Staff account" back={back} />
        <Card role="status" aria-label="Loading staff account" className="p-4">
          <SkeletonText lines={5} />
        </Card>
      </>
    )
  }
  if (member.isError) {
    if (member.error instanceof ApiError && member.error.status === 404) return <Missing />
    return (
      <>
        <MobilePageHeader title="Staff account" back={back} />
        <Card>
          <ErrorState title="This account couldn’t load" message={member.error.message} onRetry={() => void member.refetch()} retrying={member.isFetching} />
        </Card>
      </>
    )
  }
  return <Detail member={member.data} />
}

function Missing() {
  return (
    <>
      <MobilePageHeader title="Account not found" back={back} />
      <Card>
        <EmptyState icon={<UserX />} title="No staff account here" description="It may be a mistyped link. Accounts are never deleted, only deactivated." />
      </Card>
    </>
  )
}

function Detail({ member }: { member: StaffMember }) {
  useDocumentTitle(member.full_name)
  const status = STATUS_LABELS[staffStatus(member)]
  const role = ROLE_LABELS[member.role]
  return (
    <>
      <MobilePageHeader
        title={member.full_name}
        description={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        back={back}
        actions={
          <ButtonLink to={`/admin/staff/${member.id}`} size="lg" icon={<Monitor />}>
            Manage in full admin
          </ButtonLink>
        }
      />
      <div className="grid gap-4">
        <MobilePanel title="Account">
          <MobileFacts>
            <MobileFact label="Email">
              <span className="break-all">{member.email}</span>
            </MobileFact>
            <MobileFact label="Role">{role.label}</MobileFact>
            <MobileFact label="Approval PIN">{canHavePin(member.role) ? (member.has_pin ? 'Set' : 'Not set') : 'Not used by cashiers'}</MobileFact>
            <MobileFact label="Last sign-in">{lastSignIn(member)}</MobileFact>
            <MobileFact label="Added">{formatWhen(member.date_joined)}</MobileFact>
          </MobileFacts>
          <p className="border-t border-line-soft px-4 py-3 type-helper">{role.summary}</p>
        </MobilePanel>
      </div>
    </>
  )
}
