import type { SellableProduct } from '@/types/domain'

import { billReducer, EMPTY_BILL, loadBill, MAX_QUANTITY, parsePercent, saveBill, toBillRequest, type BillState } from './bill'
import { findExactVariant, priceLabel, productStock } from './catalogue'
import { newCheckoutKey } from './checkoutKey'
import { quickAmounts } from './payment'

const SHIRT: SellableProduct = {
  id: 12,
  name: 'Classic Cotton Shirt',
  sku: 'SH-CT-001',
  category: { id: 3, name: 'Shirts' },
  image_url: null,
  hsn_code: '6205',
  tax_rule: {
    id: 1,
    name: 'Garments',
    kind: 'price_band',
    flat_rate_bp: null,
    threshold_paise: 250000,
    lower_rate_bp: 500,
    upper_rate_bp: 1800,
    summary: '5% up to ₹2,500 per unit, 18% above',
  },
  variants: [
    { id: 31, sku: 'SH-CT-001-M-BLU', size: 'M', colour: 'Blue', barcode: '8901000010018', price_paise: 119900, on_hand: 4, stock_state: 'in_stock' },
    { id: 32, sku: 'SH-CT-001-L-BLU', size: 'L', colour: 'Blue', barcode: null, price_paise: 129900, on_hand: 1, stock_state: 'low_stock' },
  ],
}
const [M, L] = SHIRT.variants as [SellableProduct['variants'][0], SellableProduct['variants'][0]]

const add = (state: BillState, variant = M, quantity = 1) => billReducer(state, { type: 'add', product: SHIRT, variant, quantity })

describe('bill reducer', () => {
  it('adds a variant once and merges repeat adds into its quantity', () => {
    const bill = add(add(EMPTY_BILL, M, 1), M, 2)
    expect(bill.lines).toHaveLength(1)
    expect(bill.lines[0]).toMatchObject({ variantId: 31, quantity: 3, size: 'M', colour: 'Blue', unitPricePaise: 119900 })
    expect(add(bill, L).lines.map((line) => line.variantId)).toEqual([31, 32])
  })

  it('keeps quantities between 1 and the maximum', () => {
    let bill = add(EMPTY_BILL)
    bill = billReducer(bill, { type: 'setQuantity', variantId: 31, quantity: 0 })
    expect(bill.lines[0]?.quantity).toBe(1)
    bill = billReducer(bill, { type: 'setQuantity', variantId: 31, quantity: 5000 })
    expect(bill.lines[0]?.quantity).toBe(MAX_QUANTITY)
    bill = billReducer(bill, { type: 'setQuantity', variantId: 31, quantity: 2.7 })
    expect(bill.lines[0]?.quantity).toBe(2)
  })

  it('removes lines, and drops the discount with the last one', () => {
    let bill = add(add(EMPTY_BILL), L)
    bill = billReducer(bill, { type: 'setDiscount', discount: { kind: 'percent', value: 1000 } })
    bill = billReducer(bill, { type: 'remove', variantId: 31 })
    expect(bill.discount).toEqual({ kind: 'percent', value: 1000 })
    bill = billReducer(bill, { type: 'remove', variantId: 32 })
    expect(bill).toEqual(EMPTY_BILL)
  })

  it('treats a zero discount as no discount', () => {
    const bill = billReducer(add(EMPTY_BILL), { type: 'setDiscount', discount: { kind: 'amount', value: 0 } })
    expect(bill.discount).toBeNull()
  })

  it('keeps one checkout key until the bill changes', () => {
    let bill = billReducer(add(EMPTY_BILL), { type: 'startCheckout', key: 'first' })
    bill = billReducer(bill, { type: 'startCheckout', key: 'second' })
    expect(bill.checkoutKey).toBe('first')
    for (const action of [
      { type: 'setQuantity', variantId: 31, quantity: 2 },
      { type: 'setDiscount', discount: { kind: 'amount', value: 100 } },
      { type: 'remove', variantId: 31 },
      { type: 'clear' },
    ] as const) {
      expect(billReducer({ ...bill, checkoutKey: 'first' }, action).checkoutKey).toBeNull()
    }
    expect(add({ ...bill, checkoutKey: 'first' }, L).checkoutKey).toBeNull()
  })

  it('sends the server only variant ids, quantities and the discount', () => {
    const bill = billReducer(add(EMPTY_BILL, M, 2), { type: 'setDiscount', discount: { kind: 'percent', value: 500 } })
    expect(toBillRequest(bill)).toEqual({ lines: [{ variant: 31, quantity: 2 }], discount: { kind: 'percent', value: 500 } })
  })
})

describe('bill storage', () => {
  afterEach(() => sessionStorage.clear())

  it('saves the bill per user and restores it after a refresh', () => {
    const bill = add(EMPTY_BILL, M, 2)
    saveBill(4, bill)
    expect(loadBill(4)).toEqual(bill)
    expect(loadBill(5)).toEqual(EMPTY_BILL)
  })

  it('forgets an empty bill and ignores damaged data', () => {
    saveBill(4, add(EMPTY_BILL))
    saveBill(4, EMPTY_BILL)
    expect(sessionStorage.length).toBe(0)
    sessionStorage.setItem('loomdesk.bill.4', '{not json')
    expect(loadBill(4)).toEqual(EMPTY_BILL)
    sessionStorage.setItem('loomdesk.bill.4', '{"lines":"nope"}')
    expect(loadBill(4)).toEqual(EMPTY_BILL)
  })
})

describe('catalogue helpers', () => {
  it('describes price ranges and stock in words', () => {
    expect(priceLabel(SHIRT)).toBe('From ₹1,199.00')
    expect(productStock(SHIRT)).toMatchObject({ available: 5, label: '5 in stock' })
    expect(productStock({ ...SHIRT, variants: [L] })).toMatchObject({ label: 'Only 1 left' })
    expect(productStock({ ...SHIRT, variants: [{ ...M, on_hand: 0, stock_state: 'out_of_stock' }] })).toMatchObject({
      available: 0,
      label: 'Out of stock',
    })
  })

  it('matches a scanned barcode or variant SKU exactly, never partly', () => {
    expect(findExactVariant([SHIRT], '8901000010018')?.variant.id).toBe(31)
    expect(findExactVariant([SHIRT], ' sh-ct-001-l-blu ')?.variant.id).toBe(32)
    expect(findExactVariant([SHIRT], '890100001')).toBeNull()
    expect(findExactVariant([SHIRT], 'SH-CT-001')).toBeNull()
  })
})

describe('payment helpers', () => {
  it('parses percentages into basis points', () => {
    expect(parsePercent('10')).toBe(1000)
    expect(parsePercent('12.5%')).toBe(1250)
    expect(parsePercent('0.25')).toBe(25)
    expect(parsePercent('1.234')).toBeNull()
    expect(parsePercent('ten')).toBeNull()
  })

  it('offers the exact amount and the next round notes', () => {
    expect(quickAmounts(451185)).toEqual([451185, 460000, 500000, 600000])
    expect(quickAmounts(50000)).toEqual([50000, 200000])
    expect(quickAmounts(0)).toEqual([])
  })

  it('makes version-4 UUIDs, with or without crypto.randomUUID', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(newCheckoutKey()).toMatch(uuid)
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('not in a secure context')
    })
    vi.stubGlobal('isSecureContext', false)
    expect(newCheckoutKey()).toMatch(uuid)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
