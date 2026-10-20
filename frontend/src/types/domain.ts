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

export type BillingSettings = Schemas['BillingSettings']
export type BillingCategory = Schemas['BillingCategory']
export type SellableProduct = Schemas['SellableProduct']
export type SellableVariant = Schemas['SellableVariant']
export type SellableProductPage = Schemas['PaginatedSellableProductList']
export type Approver = Schemas['Approver']
export type BillRequest = Schemas['BillRequest']
export type CheckoutRequest = Schemas['CheckoutRequest']
export type Quote = Schemas['Quote']
export type QuoteLine = Schemas['QuoteLine']
export type TaxBreakdown = Schemas['TaxBreakdown']
export type DiscountKind = Schemas['DiscountKindEnum']
export type PaymentMethod = Schemas['PaymentMethodEnum']
export type Sale = Schemas['Sale']
export type SaleLine = Schemas['SaleLine']
export type SaleStatus = Schemas['SaleStatusEnum']
export type SaleListItem = Schemas['SaleListItem']
export type SalePage = Schemas['PaginatedSaleListItemList']
export type SaleCashier = Schemas['SaleCashier']
export type SalesSummary = Schemas['SalesSummary']

export type InventoryVariant = Schemas['InventoryVariant']
export type InventoryPage = Schemas['PaginatedInventoryVariantList']
export type InventorySummary = Schemas['InventorySummary']
export type InventoryMovement = Schemas['InventoryMovement']
export type MovementPage = Schemas['PaginatedInventoryMovementList']
export type MovementType = Schemas['StockMovementTypeEnum']
export type StockAdjustment = Schemas['StockAdjustmentRequest']
export type AdjustmentKind = Schemas['StockAdjustmentKindEnum']
export type StockAdjustmentResult = Schemas['StockAdjustmentResult']

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  senior_cashier: 'Senior cashier',
  cashier: 'Cashier',
}

export const ALL_ROLES: readonly Role[] = ['admin', 'senior_cashier', 'cashier']
