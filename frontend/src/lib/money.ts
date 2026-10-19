/** Money travels as integer paise. These helpers are the only place it is formatted. */

export type Paise = number

const withPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * Format paise as Indian rupees: `₹48,620.00` on bills and invoices, or `₹48,620`
 * for summaries (`{ wholeRupees: true }`).
 */
export function formatMoney(paise: Paise, options: { wholeRupees?: boolean } = {}): string {
  if (!Number.isInteger(paise)) throw new TypeError(`Money must be integer paise, got ${paise}`)
  const rupees = paise / 100
  return (options.wholeRupees ? wholeRupees : withPaise).format(rupees)
}

/** Parse a rupee amount typed by a user ("1,199.5") into paise; null when invalid. */
export function parseRupees(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [rupees = '0', fraction = ''] = cleaned.split('.')
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
}
