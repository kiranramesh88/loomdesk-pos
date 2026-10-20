import { ArrowLeft, KeyRound, Link2, Pencil, UserCheck, UserMinus, UserX } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/toastContext'
import { useMe } from '@/features/auth/api'
import { Fact, Facts } from '@/features/transactions/components/SaleSections'
import { ApiError } from '@/lib/http'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { SetupLink, StaffMember } from '@/types/domain'

import { parseStaffId, useClearPin, useIssueSetupLink, useSetActive, useStaffMember } from '../api'
import { SetupLinkDialog } from '../components/SetupLinkDialog'
import { EditStaffDialog, PinDialog } from '../components/StaffDialogs'
import { canHavePin, formatWhen, lastSignIn, ROLE_LABELS, STATUS_LABELS, staffStatus } from '../labels'

const backLink = (
  <ButtonLink to="/admin/staff" variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-3 mb-2">
    Staff & access
  </ButtonLink>
)

/** `/admin/staff/:staffId`: one account, its role, PIN and sign-in state, and every change an admin can make. */
export function StaffDetailPage() {
  const id = parseStaffId(useParams().staffId)
  return (
    <>
      {backLink}
      {id ? <LoadStaff id={id} /> : <StaffMissing />}
    </>
  )
}

function StaffMissing() {
  return (
    <Card>
      <EmptyState
        icon={<UserX />}
        title="No staff account here"
        description="It may have been mistyped. Accounts are deactivated, never deleted."
        action={<ButtonLink to="/admin/staff">Back to staff</ButtonLink>}
      />
    </Card>
  )
}

function LoadStaff({ id }: { id: number }) {
  const member = useStaffMember(id)
  if (member.isPending) {
    return (
      <div role="status" aria-label="Loading staff account" className="grid gap-4">
        <Skeleton className="h-7 w-56" />
        <Card>
          <CardBody className="pt-5">
            <SkeletonText lines={5} />
          </CardBody>
        </Card>
      </div>
    )
  }
  if (member.isError) {
    if (member.error instanceof ApiError && member.error.status === 404) return <StaffMissing />
    return (
      <Card>
        <ErrorState title="This account couldn’t load" message={member.error.message} onRetry={() => void member.refetch()} retrying={member.isFetching} />
      </Card>
    )
  }
  return <StaffDetail member={member.data} />
}

type Open = 'edit' | 'pin' | 'clear-pin' | 'link' | 'deactivate' | 'reactivate' | null

/** ConfirmDialog keeps itself open and shows the message when its action throws. */
async function run<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      throw new Error('The server couldn’t be reached. Check the connection and try again.', { cause: error })
    }
    throw error
  }
}

function StaffDetail({ member }: { member: StaffMember }) {
  useDocumentTitle(member.full_name)
  const me = useMe().data
  const isSelf = me?.id === member.id
  const { toast } = useToast()
  const [open, setOpen] = useState<Open>(null)
  const [link, setLink] = useState<SetupLink | null>(null)
  const setActive = useSetActive(member.id)
  const clearPin = useClearPin(member.id)
  const issueLink = useIssueSetupLink(member.id)
  const status = STATUS_LABELS[staffStatus(member)]
  const close = (next: boolean) => !next && setOpen(null)

  const actions = (
    <>
      <Button icon={<Pencil />} onClick={() => setOpen('edit')}>
        Edit
      </Button>
      {member.is_active && canHavePin(member.role) && (
        <Button icon={<KeyRound />} onClick={() => setOpen('pin')}>
          {member.has_pin ? 'Change PIN' : 'Set PIN'}
        </Button>
      )}
      {member.is_active && (
        <Button icon={<Link2 />} onClick={() => setOpen('link')}>
          {member.password_set ? 'Password reset link' : 'New set-password link'}
        </Button>
      )}
      {!isSelf &&
        (member.is_active ? (
          <Button variant="danger" icon={<UserMinus />} onClick={() => setOpen('deactivate')}>
            Deactivate
          </Button>
        ) : (
          <Button icon={<UserCheck />} onClick={() => setOpen('reactivate')}>
            Reactivate
          </Button>
        ))}
    </>
  )

  return (
    <>
      <PageHeader title={member.full_name} description={`${ROLE_LABELS[member.role].label} · ${member.email}`} actions={actions} />
      {isSelf && (
        <InlineAlert tone="info" className="mb-5">
          This is your account. Another admin can change your role or deactivate it; you can’t do either yourself.
        </InlineAlert>
      )}
      {!member.is_active && (
        <InlineAlert tone="warning" title="Deactivated" className="mb-5">
          {member.full_name} can’t sign in. Their bills, returns and other history stay as recorded.
        </InlineAlert>
      )}
      {member.is_active && !member.password_set && (
        <InlineAlert tone="warning" title="Waiting for a password" className="mb-5">
          {member.full_name} can’t sign in until they open their set-password link
          {member.setup_link_issued_at ? `, issued ${formatWhen(member.setup_link_issued_at)}` : ''}. A link works for three days;
          issue a new one if it was lost or has expired.
        </InlineAlert>
      )}
      <div className="grid items-start gap-4 md:grid-cols-2 lg:gap-5">
        <Card aria-labelledby="account-heading">
          <CardHeader id="account-heading" title="Account" />
          <CardBody>
            <Facts>
              <Fact label="Name" value={member.full_name} />
              <Fact label="Email" value={<span className="break-all">{member.email}</span>} />
              <Fact label="Status" value={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>} />
              <Fact label="Last sign-in" value={lastSignIn(member)} />
              <Fact label="Added" value={formatWhen(member.date_joined)} />
            </Facts>
          </CardBody>
        </Card>
        <Card aria-labelledby="access-heading">
          <CardHeader id="access-heading" title="Access" />
          <CardBody className="grid gap-3">
            <Facts>
              <Fact label="Role" value={ROLE_LABELS[member.role].label} />
              <Fact
                label="Approval PIN"
                value={canHavePin(member.role) ? (member.has_pin ? 'Set' : 'Not set') : 'Not used by cashiers'}
              />
            </Facts>
            <p className="type-helper">{ROLE_LABELS[member.role].summary}</p>
            {member.has_pin && member.is_active && (
              <div>
                <Button size="sm" variant="ghost" onClick={() => setOpen('clear-pin')} className="-ml-3">
                  Remove PIN
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <EditStaffDialog member={member} isSelf={isSelf} open={open === 'edit'} onOpenChange={close} />
      <PinDialog member={member} open={open === 'pin'} onOpenChange={close} />
      <ConfirmDialog
        open={open === 'clear-pin'}
        onOpenChange={close}
        title="Remove approval PIN?"
        description={`${member.full_name} won’t be able to approve discounts above the cashier limit until a new PIN is set.`}
        confirmLabel="Remove PIN"
        pendingLabel="Removing…"
        tone="danger"
        onConfirm={async () => {
          await run(clearPin.mutateAsync())
          toast({ tone: 'success', title: 'Approval PIN removed', description: member.full_name })
        }}
      />
      <ConfirmDialog
        open={open === 'link'}
        onOpenChange={close}
        title={member.password_set ? 'Issue a password reset link?' : 'Issue a new set-password link?'}
        description={
          member.password_set
            ? `${member.full_name} keeps their current password until they use the link. Any earlier link stops working.`
            : 'Any earlier link for this account stops working. The new one is shown once.'
        }
        confirmLabel="Issue link"
        pendingLabel="Issuing…"
        onConfirm={async () => {
          setLink(await run(issueLink.mutateAsync()))
        }}
      />
      <ConfirmDialog
        open={open === 'deactivate'}
        onOpenChange={close}
        title={`Deactivate ${member.full_name}?`}
        description="They’re signed out everywhere and can’t sign in again until reactivated. Their bills, returns and history stay as recorded."
        confirmLabel="Deactivate"
        pendingLabel="Deactivating…"
        tone="danger"
        onConfirm={async () => {
          await run(setActive.mutateAsync(false))
          toast({ tone: 'success', title: `${member.full_name} deactivated` })
        }}
      />
      <ConfirmDialog
        open={open === 'reactivate'}
        onOpenChange={close}
        title={`Reactivate ${member.full_name}?`}
        description={`They can sign in again with their existing password, as ${ROLE_LABELS[member.role].label.toLowerCase()}.`}
        confirmLabel="Reactivate"
        pendingLabel="Reactivating…"
        onConfirm={async () => {
          await run(setActive.mutateAsync(true))
          toast({ tone: 'success', title: `${member.full_name} reactivated` })
        }}
      />
      <SetupLinkDialog link={link} name={member.full_name} onDone={() => setLink(null)} />
    </>
  )
}
