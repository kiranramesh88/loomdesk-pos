import type { components } from './api.gen'

type Schemas = components['schemas']

export type Me = Schemas['Me']
export type Session = Schemas['Session']
export type Store = Schemas['Store']
export type Role = Schemas['RoleEnum']
export type LoginRequest = Schemas['LoginRequest']

export type TaxRule = Schemas['TaxRule']
export type Category = Schemas['Category']
export type ProductListItem = Schemas['ProductList']
export type ProductPage = Schemas['PaginatedProductListList']
export type ProductDetail = Schemas['ProductDetail']
export type Variant = Schemas['Variant']
export type StockMovement = Schemas['StockMovement']
export type ProductWrite = Schemas['ProductWriteRequest']
export type VariantWrite = Schemas['VariantWriteRequest']
export type ProductStatus = Schemas['ProductStatusEnum']
export type StockState = Schemas['StockStateEnum']

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  senior_cashier: 'Senior cashier',
  cashier: 'Cashier',
}

export const ALL_ROLES: readonly Role[] = ['admin', 'senior_cashier', 'cashier']
