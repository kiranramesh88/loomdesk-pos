import type { components } from './api.gen'

type Schemas = components['schemas']

export type Me = Schemas['Me']
export type Session = Schemas['Session']
export type Role = Schemas['RoleEnum']
export type LoginRequest = Schemas['LoginRequest']

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  senior_cashier: 'Senior cashier',
  cashier: 'Cashier',
}

export const ALL_ROLES: readonly Role[] = ['admin', 'senior_cashier', 'cashier']
