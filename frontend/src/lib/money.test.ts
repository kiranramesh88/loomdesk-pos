import { formatMoney, parseRupees } from './money'

describe('formatMoney', () => {
  it('formats paise with Indian digit grouping', () => {
    expect(formatMoney(4_862_000)).toBe('₹48,620.00')
    expect(formatMoney(1_000_000_00)).toBe('₹10,00,000.00')
    expect(formatMoney(119_950)).toBe('₹1,199.50')
  })

  it('can drop paise for summaries', () => {
    expect(formatMoney(4_862_000, { wholeRupees: true })).toBe('₹48,620')
  })

  it('rejects fractional paise', () => {
    expect(() => formatMoney(10.5)).toThrow(TypeError)
  })
})

describe('parseRupees', () => {
  it.each([
    ['1199', 119_900],
    ['1,199.5', 119_950],
    ['₹ 48,620.00', 4_862_000],
    ['0.05', 5],
  ])('parses %s', (input, expected) => {
    expect(parseRupees(input)).toBe(expected)
  })

  it.each(['', 'abc', '12.345', '-5'])('rejects %s', (input) => {
    expect(parseRupees(input)).toBeNull()
  })
})
