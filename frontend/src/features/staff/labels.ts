import type { StatusTone } from '@/components/ui/StatusBadge'
import type { Role, StaffMember } from '@/types/domain'

import type { StaffStatus } from './staffParams'

export const ROLE_LABELS: Record<Role, { label: string; summary: string }> = {
  admin: { label: 'Admin', summary: 'Full admin, reports, settings and staff. Can approve discounts.' },
  senior_cashier: { label: 'Senior cashier', summary: 'Billing, and approves discounts above the cashier limit.' },
  cashier: { label: 'Cashier', summary: 'Billing only, within the cashier discount limit.' },
}

export const STATUS_LABELS: Record<StaffStatus, { label: string; tone: StatusTone }> = {
  active: { label: 'Active', tone: 'success' },
  pending: { label: 'Password not set', tone: 'warning' },
  inactive: { label: 'Deactivated', tone: 'neutral' },
}

export function staffStatus(member: Pick<StaffMember, 'is_active' | 'password_set'>): StaffStatus {
  if (!member.is_active) return 'inactive'
  return member.password_set ? 'active' : 'pending'
}

export const canHavePin = (role: Role) => role !== 'cashier'

const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
})

export const formatWhen = (iso: string) => DATE_TIME.format(new Date(iso))

export const lastSignIn = (member: Pick<StaffMember, 'last_login'>) => (member.last_login ? formatWhen(member.last_login) : 'Never')
