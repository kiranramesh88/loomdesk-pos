import { z } from 'zod'

import { parseRupees } from '@/lib/money'
import type { ProductDetail, ProductWrite, VariantWrite } from '@/types/domain'

/**
 * The product form keeps money as typed rupee strings and converts to paise only on submit.
 * The server re-validates everything; these rules exist so mistakes show before a round trip.
 */

const SKU = /^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/
const BARCODE = /^[0-9A-Za-z-]{4,32}$/
const HSN = /^\d{4}(\d{2}){0,2}$/
const WHOLE = /^\d+$/

const rupees = (message: string, { optional = false, allowZero = false } = {}) =>
  z.string().refine((value) => {
    if (optional && !value.trim()) return true
    const paise = parseRupees(value)
    return paise !== null && (allowZero || paise > 0)
  }, message)

const wholeNumber = (message: string) => z.string().trim().regex(WHOLE, message)

const variantSchema = z.object({
  id: z.number().optional(),
  hasHistory: z.boolean(),
  onHand: z.number(),
  size: z.string().trim().min(1, 'Enter a size, e.g. M or 32.').max(20, 'Keep it under 20 characters.'),
  colour: z.string().trim().min(1, 'Enter a colour.').max(30, 'Keep it under 30 characters.'),
  sku: z.string().trim().regex(SKU, 'Use 2–40 letters, numbers and hyphens.'),
  barcode: z.string().trim().refine((v) => !v || BARCODE.test(v), 'Use 4–32 letters, numbers or hyphens.'),
  price: rupees('Enter a price above ₹0, or leave it blank to use the product price.', { optional: true }),
  reorderLevel: wholeNumber('Enter a whole number, 0 or more.'),
  isActive: z.boolean(),
  openingStock: wholeNumber('Enter a whole number, 0 or more.'),
})

export const productSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a product name.').max(120, 'Keep the name under 120 characters.'),
    sku: z.string().trim().regex(SKU, 'Use 2–40 letters, numbers and hyphens, e.g. SH-CT-001.'),
    description: z.string(),
    category: z.string().min(1, 'Choose a category.'),
    basePrice: rupees('Enter a selling price above ₹0, e.g. 1199 or 1199.50.'),
    costPrice: rupees('Enter a cost in rupees, e.g. 620, or leave it blank.', { optional: true, allowZero: true }),
    hsnCode: z.string().trim().refine((v) => !v || HSN.test(v), 'HSN codes are 4, 6 or 8 digits.'),
    taxRule: z.string(),
    variants: z.array(variantSchema).min(1, 'Add at least one variant.'),
  })
  .superRefine((values, ctx) => {
    // Duplicates inside the form; clashes with other products come back from the server.
    const seen = { options: new Map<string, number>(), sku: new Map<string, number>(), barcode: new Map<string, number>() }
    values.variants.forEach((row, i) => {
      const checks: [keyof typeof seen, string, 'colour' | 'sku' | 'barcode', string][] = [
        ['options', `${row.size.trim().toLowerCase()}|${row.colour.trim().toLowerCase()}`, 'colour', 'size and colour'],
        ['sku', row.sku.trim().toUpperCase(), 'sku', 'SKU'],
        ['barcode', row.barcode.trim().toUpperCase(), 'barcode', 'barcode'],
      ]
      for (const [kind, key, field, noun] of checks) {
        if (!key || key === '|') continue
        const first = seen[kind].get(key)
        if (first === undefined) seen[kind].set(key, i)
        else ctx.addIssue({ code: 'custom', path: ['variants', i, field], message: `Variant ${first + 1} already uses this ${noun}.` })
      }
    })
    if (values.variants.length && !values.variants.some((row) => row.isActive)) {
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Keep at least one variant active.' })
    }
  })

export type ProductFormValues = z.infer<typeof productSchema>
export type VariantFormValues = ProductFormValues['variants'][number]

const toRupees = (paise: number | null | undefined) => (paise == null ? '' : (paise / 100).toFixed(2).replace(/\.00$/, ''))

export const emptyVariant = (): VariantFormValues => ({
  hasHistory: false,
  onHand: 0,
  size: '',
  colour: '',
  sku: '',
  barcode: '',
  price: '',
  reorderLevel: '2',
  isActive: true,
  openingStock: '0',
})

export function toFormValues(product?: ProductDetail): ProductFormValues {
  if (!product) {
    return {
      name: '',
      sku: '',
      description: '',
      category: '',
      basePrice: '',
      costPrice: '',
      hsnCode: '',
      taxRule: '',
      variants: [emptyVariant()],
    }
  }
  return {
    name: product.name,
    sku: product.sku,
    description: product.description,
    category: String(product.category.id),
    basePrice: toRupees(product.base_price_paise),
    costPrice: toRupees(product.cost_price_paise),
    hsnCode: product.hsn_code,
    taxRule: product.tax_rule ? String(product.tax_rule.id) : '',
    variants: product.variants.map((v) => ({
      id: v.id,
      hasHistory: v.has_history,
      onHand: v.on_hand,
      size: v.size,
      colour: v.colour,
      sku: v.sku,
      barcode: v.barcode ?? '',
      price: toRupees(v.price_override_paise),
      reorderLevel: String(v.reorder_level),
      isActive: v.is_active,
      openingStock: '0',
    })),
  }
}

/** Form values → API body. Opening stock is only sent for new variants (the server enforces this too). */
export function toPayload(values: ProductFormValues): ProductWrite {
  const variants: VariantWrite[] = values.variants.map((row) => ({
    ...(row.id !== undefined && { id: row.id }),
    // Existing variants send 0: their stock changes only through Inventory movements.
    opening_stock: row.id === undefined ? Number(row.openingStock) : 0,
    size: row.size.trim(),
    colour: row.colour.trim(),
    sku: row.sku.trim(),
    barcode: row.barcode.trim() || null,
    price_override_paise: row.price.trim() ? parseRupees(row.price) : null,
    reorder_level: Number(row.reorderLevel),
    is_active: row.isActive,
  }))
  return {
    name: values.name.trim(),
    sku: values.sku.trim(),
    description: values.description.trim(),
    category: Number(values.category),
    base_price_paise: parseRupees(values.basePrice)!,
    cost_price_paise: values.costPrice.trim() ? parseRupees(values.costPrice) : null,
    hsn_code: values.hsnCode.trim(),
    tax_rule: values.taxRule ? Number(values.taxRule) : null,
    variants,
  }
}

const SERVER_TO_FORM: Record<string, string> = {
  base_price_paise: 'basePrice',
  cost_price_paise: 'costPrice',
  hsn_code: 'hsnCode',
  tax_rule: 'taxRule',
  price_override_paise: 'price',
  reorder_level: 'reorderLevel',
  is_active: 'isActive',
  opening_stock: 'openingStock',
}

/**
 * Translate an API field path ("variants.2.price_override_paise") into a form field name
 * ("variants.2.price"). A bare "variants" error belongs to the list as a whole.
 */
export function toFormField(path: string): string {
  if (path === 'variants') return 'variants.root'
  return path
    .split('.')
    .map((part) => SERVER_TO_FORM[part] ?? part)
    .join('.')
}

/** Suggested variant SKU in the seed data's style: SH-CT-001-M-BLU. */
export function suggestVariantSku(productSku: string, size: string, colour: string): string {
  const clean = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  const parts = [clean(productSku), clean(size), clean(colour).slice(0, 3)]
  return parts.every(Boolean) ? parts.join('-').slice(0, 40) : ''
}
