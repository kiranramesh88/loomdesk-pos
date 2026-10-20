import { formatMoney } from '@/lib/money'
import type { SellableProduct, SellableVariant, StockState } from '@/types/domain'

/** "₹1,199.00", or "From ₹1,199.00" when variants are priced differently. */
export function priceLabel(product: SellableProduct): string {
  const prices = product.variants.map((variant) => variant.price_paise)
  const low = Math.min(...prices)
  return low === Math.max(...prices) ? formatMoney(low) : `From ${formatMoney(low)}`
}

export const variantLabel = (variant: Pick<SellableVariant, 'size' | 'colour'>) => `${variant.size} · ${variant.colour}`

export interface StockSummary {
  available: number
  label: string
  /** Text colour that matches the words; the words alone carry the meaning. */
  textClass: string
}

/** Stock in words for one variant, using the server's state (low = at or below its reorder level). */
export function stockSummary(onHand: number, state: StockState): StockSummary {
  if (onHand <= 0 || state === 'out_of_stock') return { available: 0, label: 'Out of stock', textClass: 'text-danger' }
  if (state === 'low_stock') return { available: onHand, label: `Only ${onHand} left`, textClass: 'text-warning' }
  return { available: onHand, label: `${onHand} in stock`, textClass: 'text-success' }
}

/** Stock across a product's variants; "low" only when every variant still in stock is low. */
export function productStock(product: SellableProduct): StockSummary {
  const inStock = product.variants.filter((variant) => variant.on_hand > 0)
  const available = inStock.reduce((sum, variant) => sum + variant.on_hand, 0)
  const allLow = inStock.length > 0 && inStock.every((variant) => variant.stock_state === 'low_stock')
  return stockSummary(available, available === 0 ? 'out_of_stock' : allLow ? 'low_stock' : 'in_stock')
}

/**
 * A scanned or typed code that names exactly one variant: its barcode or its variant SKU.
 * Codes are matched whole, so a partial number never adds the wrong item.
 */
export function findExactVariant(products: SellableProduct[], code: string) {
  const wanted = code.trim().toUpperCase()
  if (!wanted) return null
  const matches = products.flatMap((product) =>
    product.variants
      .filter((variant) => variant.barcode?.toUpperCase() === wanted || variant.sku.toUpperCase() === wanted)
      .map((variant) => ({ product, variant })),
  )
  return matches.length === 1 ? matches[0] : null
}
