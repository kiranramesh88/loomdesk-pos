import type { StatusTone } from '@/components/ui/StatusBadge'
import type { ProductStatus, StockState } from '@/types/domain'

export const STOCK_LABELS: Record<StockState, { label: string; tone: StatusTone }> = {
  in_stock: { label: 'In stock', tone: 'success' },
  low_stock: { label: 'Low stock', tone: 'warning' },
  out_of_stock: { label: 'Out of stock', tone: 'danger' },
}

export const STATUS_LABELS: Record<ProductStatus, { label: string; tone: StatusTone }> = {
  active: { label: 'Active', tone: 'info' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

export const unitsLabel = (count: number) => `${count.toLocaleString('en-IN')} ${count === 1 ? 'unit' : 'units'}`
export const variantsLabel = (count: number) => `${count} ${count === 1 ? 'variant' : 'variants'}`
