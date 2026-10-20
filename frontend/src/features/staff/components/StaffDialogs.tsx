import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Select, type SelectOption } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/toastContext'
import { ApiError } from '@/lib/http'
import type { Role, StaffCreated, StaffMember } from '@/types/domain'

import { useCreateStaff, useSetPin, useUpdateStaff } from '../api'
import { ROLE_LABELS } from '../labels'
import { ROLES } from '../staffParams'

const ROLE_OPTIONS: SelectOption[] = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r].label }))

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Errors = Partial<Record<'full_name' | 'email' | 'role' | 'pin' | 'confirm', string>>

function fieldErrors(error: ApiError): Errors {
  return Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, v[0]]))
}

function problemText(error: Error): string {
  return error instanceof ApiError && error.status === 0 ? 'The server couldn’t be reached. Check the connection and try again.' : error.message
}

function Actions({ onCancel, pending, label }: { onCancel: () => void; pending: boolean; label: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
      <Button onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" loading={pending}>
        {label}
      </Button>
    </div>
  )
}

// --- Add staff ---

export function AddStaffDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (created: StaffCreated) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add staff"
      description="They’ll get a one-time link to choose their own password. You never see or set it."
    >
      {open && <AddStaffForm onClose={() => onOpenChange(false)} onCreated={onCreated} />}
    </Dialog>
  )
}

function AddStaffForm({ onClose, onCreated }: { onClose: () => void; onCreated: (created: StaffCreated) => void }) {
  const create = useCreateStaff()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>()
  const [errors, setErrors] = useState<Errors>({})
  const [problem, setProblem] = useState<string>()

  const submit = () => {
    const found: Errors = {}
    if (!name.trim()) found.full_name = 'Enter their full name, as it should appear on receipts.'
    if (!EMAIL.test(email.trim())) found.email = 'Enter the email address they’ll sign in with.'
    if (!role) found.role = 'Choose a role.'
    setErrors(found)
    setProblem(undefined)
    if (Object.keys(found).length || !role) return
    create.mutate(
      { full_name: name.trim(), email: email.trim(), role },
      {
        onSuccess: (created) => {
          onClose()
          onCreated(created)
        },
        onError: (error) => (error instanceof ApiError && Object.keys(error.fields).length ? setErrors(fieldErrors(error)) : setProblem(problemText(error))),
      },
    )
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-4">
        <TextField
          label="Full name"
          maxLength={120}
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setErrors((x) => ({ ...x, full_name: undefined }))
          }}
          error={errors.full_name}
        />
        <TextField
          label="Email"
          type="email"
          maxLength={254}
          autoComplete="off"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setErrors((x) => ({ ...x, email: undefined }))
          }}
          error={errors.email}
        />
        <Select
          label="Role"
          placeholder="Choose a role"
          options={ROLE_OPTIONS}
          value={role}
          onValueChange={(v) => {
            setRole(v as Role)
            setErrors((x) => ({ ...x, role: undefined }))
          }}
          error={errors.role}
          hint={role ? ROLE_LABELS[role].summary : undefined}
        />
      </div>
      {problem && (
        <InlineAlert tone="danger" className="mt-4">
          {problem}
        </InlineAlert>
      )}
      <Actions onCancel={onClose} pending={create.isPending} label="Add and get link" />
    </form>
  )
}

// --- Edit details and role ---

export function EditStaffDialog({ member, isSelf, open, onOpenChange }: { member: StaffMember; isSelf: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${member.full_name}`}>
      {open && <EditStaffForm member={member} isSelf={isSelf} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function EditStaffForm({ member, isSelf, onClose }: { member: StaffMember; isSelf: boolean; onClose: () => void }) {
  const update = useUpdateStaff(member.id)
  const { toast } = useToast()
  const [name, setName] = useState(member.full_name)
  const [email, setEmail] = useState(member.email)
  const [role, setRole] = useState<Role>(member.role)
  const [errors, setErrors] = useState<Errors>({})
  const [problem, setProblem] = useState<string>()

  const warnings: string[] = []
  if (role !== member.role) {
    if (member.role === 'admin') warnings.push('They lose admin access straight away.')
    if (role === 'admin') warnings.push('They’ll see every admin page, including staff, reports and settings.')
    if (role === 'cashier' && member.has_pin) warnings.push('Their approval PIN will be removed: cashiers can’t approve discounts.')
  }
  if (email.trim().toLowerCase() !== member.email && !member.password_set) {
    warnings.push('Their current set-password link will stop working. Issue a new one after saving.')
  }

  const submit = () => {
    const found: Errors = {}
    if (!name.trim()) found.full_name = 'Enter their full name.'
    if (!EMAIL.test(email.trim())) found.email = 'Enter a valid email address.'
    setErrors(found)
    setProblem(undefined)
    if (Object.keys(found).length) return
    update.mutate(
      { full_name: name.trim(), email: email.trim(), ...(isSelf ? {} : { role }) },
      {
        onSuccess: (saved) => {
          toast({ tone: 'success', title: 'Changes saved', description: saved.full_name })
          onClose()
        },
        onError: (error) => (error instanceof ApiError && Object.keys(error.fields).length ? setErrors(fieldErrors(error)) : setProblem(problemText(error))),
      },
    )
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-4">
        <TextField label="Full name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} error={errors.full_name} />
        <TextField label="Email" type="email" maxLength={254} spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Select
          label="Role"
          options={ROLE_OPTIONS}
          value={role}
          onValueChange={(v) => setRole(v as Role)}
          disabled={isSelf}
          hint={isSelf ? 'You can’t change your own role. Ask another admin.' : ROLE_LABELS[role].summary}
          error={errors.role}
        />
      </div>
      {warnings.length > 0 && (
        <InlineAlert tone="warning" className="mt-4">
          {warnings.join(' ')}
        </InlineAlert>
      )}
      {problem && (
        <InlineAlert tone="danger" className="mt-4">
          {problem}
        </InlineAlert>
      )}
      <Actions onCancel={onClose} pending={update.isPending} label="Save changes" />
    </form>
  )
}

// --- Approval PIN ---

export function PinDialog({ member, open, onOpenChange }: { member: StaffMember; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={member.has_pin ? 'Change approval PIN' : 'Set approval PIN'}
      description={`Hand the screen to ${member.full_name} so they type it themselves. It approves discounts above the cashier limit at the till.`}
    >
      {open && <PinForm member={member} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function PinForm({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const setPin = useSetPin(member.id)
  const { toast } = useToast()
  const [pin, setPinValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [problem, setProblem] = useState<string>()

  const submit = () => {
    const found: Errors = {}
    if (!/^\d{4,6}$/.test(pin)) found.pin = 'Enter 4 to 6 digits.'
    else if (pin !== confirm) found.confirm = 'The two PINs don’t match.'
    setErrors(found)
    setProblem(undefined)
    if (Object.keys(found).length) return
    setPin.mutate(pin, {
      onSuccess: () => {
        toast({ tone: 'success', title: 'Approval PIN saved', description: member.full_name })
        onClose()
      },
      onError: (error) => (error instanceof ApiError && Object.keys(error.fields).length ? setErrors(fieldErrors(error)) : setProblem(problemText(error))),
    })
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="New PIN"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPinValue(e.target.value)}
          error={errors.pin}
          hint="4 to 6 digits"
        />
        <TextField
          label="Type it again"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
      </div>
      {problem && (
        <InlineAlert tone="danger" className="mt-4">
          {problem}
        </InlineAlert>
      )}
      <Actions onCancel={onClose} pending={setPin.isPending} label="Save PIN" />
    </form>
  )
}
