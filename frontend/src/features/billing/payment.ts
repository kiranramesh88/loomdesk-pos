/** Exact amount, then the next round notes a customer is likely to hand over. */
export function quickAmounts(total: number): number[] {
  if (total <= 0) return []
  const amounts = [total]
  for (const step of [100_00, 500_00, 2000_00]) {
    const rounded = Math.ceil(total / step) * step
    if (!amounts.includes(rounded)) amounts.push(rounded)
  }
  return amounts.slice(0, 4)
}
