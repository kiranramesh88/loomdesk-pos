import { readParams, toQueryString, writeParams } from './catalogueParams'
import { emptyVariant, productSchema, suggestVariantSku, toFormField, toFormValues, toPayload } from './productForm'

const valid = () => ({
  ...toFormValues(),
  name: 'Classic Cotton Shirt',
  sku: 'SH-CT-001',
  category: '3',
  basePrice: '1,199.50',
  costPrice: '620',
  variants: [{ ...emptyVariant(), size: 'M', colour: 'Blue', sku: 'SH-CT-001-M-BLU', openingStock: '4' }],
})

describe('product form values', () => {
  it('converts typed rupees to paise and blanks to null', () => {
    const payload = toPayload(productSchema.parse(valid()))
    expect(payload).toMatchObject({
      base_price_paise: 119950,
      cost_price_paise: 62000,
      category: 3,
      tax_rule: null,
      variants: [{ size: 'M', colour: 'Blue', barcode: null, price_override_paise: null, opening_stock: 4, reorder_level: 2 }],
    })
    expect(payload.variants![0]).not.toHaveProperty('id')
  })

  it('never sends opening stock for existing variants', () => {
    const values = valid()
    values.variants[0] = { ...values.variants[0]!, id: 7, hasHistory: true, onHand: 4, openingStock: '50' }
    expect(toPayload(productSchema.parse(values)).variants![0]).toMatchObject({ id: 7, opening_stock: 0 })
  })

  it('rejects bad prices, codes and empty variant lists', () => {
    const issues = (overrides: object) =>
      productSchema.safeParse({ ...valid(), ...overrides }).error?.issues.map((i) => i.path.join('.'))
    expect(issues({ basePrice: '0' })).toEqual(['basePrice'])
    expect(issues({ basePrice: '12.345' })).toEqual(['basePrice'])
    expect(issues({ basePrice: '-5' })).toEqual(['basePrice'])
    expect(issues({ costPrice: 'abc' })).toEqual(['costPrice'])
    expect(issues({ sku: 'has space' })).toEqual(['sku'])
    expect(issues({ hsnCode: '62' })).toEqual(['hsnCode'])
    expect(issues({ variants: [] })).toEqual(['variants'])
  })

  it('flags duplicate options, SKUs and barcodes inside the form', () => {
    const values = valid()
    const first = { ...values.variants[0]!, barcode: '8901000010018' }
    values.variants = [first, { ...first, size: 'm', colour: ' blue ', sku: 'sh-ct-001-m-blu' }]
    const issues = productSchema.safeParse(values).error?.issues.map((i) => [i.path.join('.'), i.message])
    expect(issues).toEqual([
      ['variants.1.colour', 'Variant 1 already uses this size and colour.'],
      ['variants.1.sku', 'Variant 1 already uses this SKU.'],
      ['variants.1.barcode', 'Variant 1 already uses this barcode.'],
    ])
  })

  it('maps API field paths onto form fields', () => {
    expect(toFormField('base_price_paise')).toBe('basePrice')
    expect(toFormField('variants.2.price_override_paise')).toBe('variants.2.price')
    expect(toFormField('variants.0.sku')).toBe('variants.0.sku')
    expect(toFormField('variants')).toBe('variants.root')
  })

  it('suggests variant SKUs in the house style', () => {
    expect(suggestVariantSku('SH-CT-001', 'XL', 'Black')).toBe('SH-CT-001-XL-BLA')
    expect(suggestVariantSku('HL-TW-002', 'One size', 'Ivory')).toBe('HL-TW-002-ONE-SIZE-IVO')
    expect(suggestVariantSku('', 'M', 'Blue')).toBe('')
  })
})

describe('catalogue URL params', () => {
  it('round-trips and drops defaults', () => {
    const params = readParams(new URLSearchParams('q=shirt&category=2&stock=low_stock&sort=-price&page=3'))
    expect(params).toEqual({ q: 'shirt', category: '2', status: '', stock: 'low_stock', sort: '-price', page: 3 })
    expect(writeParams(params).toString()).toBe('q=shirt&category=2&stock=low_stock&sort=-price&page=3')
    expect(writeParams(readParams(new URLSearchParams())).toString()).toBe('')
  })

  it('ignores values the API would reject', () => {
    expect(readParams(new URLSearchParams('category=abc&status=archived&stock=x&sort=evil&page=-2'))).toEqual({
      q: '',
      category: '',
      status: '',
      stock: '',
      sort: 'name',
      page: 1,
    })
  })

  it('builds the API query with page size and ordering', () => {
    expect(toQueryString(readParams(new URLSearchParams('q=tee&status=active')))).toBe(
      'page=1&page_size=20&ordering=name&q=tee&status=active',
    )
  })
})
