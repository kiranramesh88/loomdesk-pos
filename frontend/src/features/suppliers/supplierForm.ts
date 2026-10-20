import { z } from 'zod'

import { parseRupees } from '@/lib/money'
import type { GstRateBp, Purchase, PurchaseWrite, SupplierDetail, SupplierWrite } from '@/types/domain'

import { AUTO_RATE, GST_RATES, today } from './labels'

/** The server re-validates everything; these rules only show mistakes before a round trip. */

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PHONE = /^\+?[0-9 ()-]{6,20}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Enter the supplier’s name.').max(120, 'Keep the name under 120 characters.'),
  category: z.string().trim().min(1, 'Enter what they supply, e.g. Cotton basics.').max(60, 'Keep it under 60 characters.'),
  contact_name: z.string().trim().max(120, 'Keep it under 120 characters.'),
  phone: z.string().trim().refine((v) => !v || PHONE.test(v), 'Use digits, spaces, brackets and dashes, e.g. +91 98765 12001.'),
  email: z.string().trim().refine((v) => !v || EMAIL.test(v), 'Enter an email address like orders@example.com.'),
  gstin: z.string().trim().refine((v) => !v || GSTIN.test(v.toUpperCase()), 'A GSTIN has 15 characters, e.g. 32ABCDE1234F1Z5.'),
  address: z.string().max(500, 'Keep the address under 500 characters.'),
  state: z.string().trim().max(60, 'Keep it under 60 characters.'),
  notes: z.string().max(1000, 'Keep notes under 1,000 characters.'),
})
export type SupplierFormValues = z.infer<typeof supplierSchema>

export function toSupplierValues(supplier?: SupplierDetail): SupplierFormValues {
  return {
    name: supplier?.name ?? '',
    category: supplier?.category ?? '',
    contact_name: supplier?.contact_name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    gstin: supplier?.gstin ?? '',
    address: supplier?.address ?? '',
    state: supplier?.state ?? '',
    notes: supplier?.notes ?? '',
  }
}

export const toSupplierPayload = (values: SupplierFormValues): SupplierWrite => ({
  ...values,
  gstin: values.gstin.trim().toUpperCase(),
})

// --- Purchase form ---

const WHOLE = /^\d{1,5}$/

const lineSchema = z.object({
  variant: z.number(),
  label: z.string(),
  sku: z.string(),
  quantity: z
    .string()
    .trim()
    .refine((v) => WHOLE.test(v) && Number(v) >= 1 && Number(v) <= 10_000, 'Enter 1 to 10,000 units.'),
  unitCost: z.string().refine((v) => {
    const paise = parseRupees(v)
    return paise !== null && paise > 0
  }, 'Enter the cost per unit before GST, e.g. 620.'),
  rate: z.string(),
})

export const purchaseSchema = z.object({
  supplier_invoice_no: z.string().trim().max(40, 'Keep it under 40 characters.'),
  purchase_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the invoice date.')
    .refine((v) => v <= today(), 'This date is in the future.'),
  notes: z.string().max(1000, 'Keep notes under 1,000 characters.'),
  lines: z.array(lineSchema).min(1, 'Add at least one item.'),
})
export type PurchaseFormValues = z.infer<typeof purchaseSchema>
export type PurchaseLineValues = PurchaseFormValues['lines'][number]

export function toPurchaseValues(purchase?: Purchase): PurchaseFormValues {
  return {
    supplier_invoice_no: purchase?.supplier_invoice_no ?? '',
    purchase_date: purchase?.purchase_date ?? today(),
    notes: purchase?.notes ?? '',
    lines: (purchase?.lines ?? []).map((line) => ({
      variant: line.variant,
      label: `${line.product_name} · ${line.size} / ${line.colour}`,
      sku: line.variant_sku,
      quantity: String(line.quantity),
      unitCost: (line.unit_cost_paise / 100).toFixed(2),
      rate: String(line.tax_rate_bp),
    })),
  }
}

/** A line the server can price, or null while it's incomplete. */
export function toLineInput(line: PurchaseLineValues) {
  const quantity = WHOLE.test(line.quantity.trim()) ? Number(line.quantity.trim()) : 0
  const unitCost = parseRupees(line.unitCost)
  if (quantity < 1 || quantity > 10_000 || unitCost === null || unitCost <= 0) return null
  const rate = line.rate === AUTO_RATE ? null : (Number(line.rate) as GstRateBp)
  return { variant: line.variant, quantity, unit_cost_paise: unitCost, ...(rate === null || !GST_RATES.includes(rate) ? {} : { tax_rate_bp: rate }) }
}

export function toPurchasePayload(values: PurchaseFormValues): PurchaseWrite {
  return {
    supplier_invoice_no: values.supplier_invoice_no.trim(),
    purchase_date: values.purchase_date,
    notes: values.notes,
    lines: values.lines.map((line) => toLineInput(line)!),
  }
}

/** Server paths ("lines.2.unit_cost_paise") onto form field names ("lines.2.unitCost"). */
export function toPurchaseField(path: string): string {
  return path.replace(/\.unit_cost_paise$/, '.unitCost').replace(/\.tax_rate_bp$/, '.rate')
}
