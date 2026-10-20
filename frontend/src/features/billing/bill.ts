import type { BillRequest, DiscountKind, SellableProduct, SellableVariant } from '@/types/domain'

/** The most of one variant a bill line can hold (the API's limit too). */
export const MAX_QUANTITY = 999

/**
 * One variant on the bill. Name, photo and price are copied from the catalogue for display;
 * the totals always come from the server's quote, and the server re-reads prices at checkout.
 */
export interface BillLine {
  variantId: number
  productId: number
  name: string
  variantSku: string
  size: string
  colour: string
  imageUrl: string | null
  unitPricePaise: number
  /** Stock when the line was added; the quote's figure replaces it once it arrives. */
  onHand: number
  quantity: number
}

export interface BillDiscount {
  kind: DiscountKind
  /** Paise for `amount`; basis points for `percent` (1000 = 10%). */
  value: number
}

export interface BillState {
  lines: BillLine[]
  discount: BillDiscount | null
  /**
   * Idempotency-Key for the next checkout of this exact bill. Made when payment first opens and
   * kept until the bill changes or the sale completes, so retrying after a lost response (even
   * after a refresh) can't record the sale twice.
   */
  checkoutKey: string | null
}

export const EMPTY_BILL: BillState = { lines: [], discount: null, checkoutKey: null }

export type BillAction =
  | { type: 'add'; product: SellableProduct; variant: SellableVariant; quantity: number }
  | { type: 'setQuantity'; variantId: number; quantity: number }
  | { type: 'remove'; variantId: number }
  | { type: 'setDiscount'; discount: BillDiscount | null }
  | { type: 'startCheckout'; key: string }
  | { type: 'clear' }

const clampQuantity = (quantity: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity)))

export function billReducer(state: BillState, action: BillAction): BillState {
  switch (action.type) {
    case 'add': {
      const { product, variant } = action
      const existing = state.lines.find((line) => line.variantId === variant.id)
      const lines = existing
        ? state.lines.map((line) =>
            line === existing
              ? { ...line, quantity: clampQuantity(line.quantity + action.quantity), onHand: variant.on_hand }
              : line,
          )
        : [
            ...state.lines,
            {
              variantId: variant.id,
              productId: product.id,
              name: product.name,
              variantSku: variant.sku,
              size: variant.size,
              colour: variant.colour,
              imageUrl: product.image_url,
              unitPricePaise: variant.price_paise,
              onHand: variant.on_hand,
              quantity: clampQuantity(action.quantity),
            },
          ]
      return { ...state, lines, checkoutKey: null }
    }
    case 'setQuantity':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.variantId === action.variantId ? { ...line, quantity: clampQuantity(action.quantity) } : line,
        ),
        checkoutKey: null,
      }
    case 'remove': {
      const lines = state.lines.filter((line) => line.variantId !== action.variantId)
      // A discount means nothing on an empty bill.
      return { lines, discount: lines.length ? state.discount : null, checkoutKey: null }
    }
    case 'setDiscount':
      return { ...state, discount: action.discount?.value ? action.discount : null, checkoutKey: null }
    case 'startCheckout':
      return state.checkoutKey ? state : { ...state, checkoutKey: action.key }
    case 'clear':
      return EMPTY_BILL
  }
}

/** What the server prices: variant ids and quantities, plus the discount. Never prices or totals. */
export function toBillRequest(bill: BillState): BillRequest {
  return {
    lines: bill.lines.map((line) => ({ variant: line.variantId, quantity: line.quantity })),
    discount: bill.discount,
  }
}

export const unitCount = (bill: BillState) => bill.lines.reduce((sum, line) => sum + line.quantity, 0)

// Saved per signed-in user and per tab (sessionStorage), so a refresh keeps the bill but a
// different cashier signing in on this tab starts clean.
const storageKey = (userId: number) => `loomdesk.bill.${userId}`

export function loadBill(userId: number): BillState {
  try {
    const raw = sessionStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY_BILL
    const saved = JSON.parse(raw) as Partial<BillState>
    if (!Array.isArray(saved.lines)) return EMPTY_BILL
    return { lines: saved.lines, discount: saved.discount ?? null, checkoutKey: saved.checkoutKey ?? null }
  } catch {
    return EMPTY_BILL
  }
}

export function saveBill(userId: number, bill: BillState) {
  try {
    if (bill.lines.length || bill.checkoutKey) sessionStorage.setItem(storageKey(userId), JSON.stringify(bill))
    else sessionStorage.removeItem(storageKey(userId))
  } catch {
    // Storage full or blocked (private mode): the bill still works, it just won't survive a refresh.
  }
}

/** Parse "12.5" into basis points (1250); null when it isn't a percentage with up to 2 decimals. */
export function parsePercent(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole = '0', fraction = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export const discountLabel = (bill: BillState) =>
  bill.discount?.kind === 'percent' ? `${bill.discount.value / 100}% off` : 'Amount off'
