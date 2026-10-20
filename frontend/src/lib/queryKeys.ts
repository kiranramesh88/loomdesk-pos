/**
 * Central TanStack Query key factory. Mutations invalidate by these prefixes
 * (see plan §6.3), so every query key must come from here.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  store: {
    detail: ['store'] as const,
  },
  products: {
    all: ['products'] as const,
    lists: ['products', 'list'] as const,
    list: (params: Record<string, string>) => ['products', 'list', params] as const,
    detail: (id: number) => ['products', 'detail', id] as const,
  },
  catalog: {
    categories: ['catalog', 'categories'] as const,
    taxRules: ['catalog', 'tax-rules'] as const,
  },
  inventory: {
    /** Stock levels, summaries and movements: every sale, product save and adjustment invalidates this prefix. */
    all: ['inventory'] as const,
    summary: ['inventory', 'summary'] as const,
    list: (params: Record<string, string>) => ['inventory', 'list', params] as const,
    variant: (id: number) => ['inventory', 'variant', id] as const,
    movements: (params: Record<string, string>) => ['inventory', 'movements', params] as const,
  },
  suppliers: {
    /** Supplier records, balances, purchases, payments and statements. */
    all: ['suppliers'] as const,
    lists: ['suppliers', 'list'] as const,
    list: (params: Record<string, string>) => ['suppliers', 'list', params] as const,
    categories: ['suppliers', 'categories'] as const,
    detail: (id: number) => ['suppliers', 'detail', id] as const,
    purchases: (id: number, params: Record<string, string>) => ['suppliers', 'purchases', id, params] as const,
    statement: (id: number) => ['suppliers', 'statement', id] as const,
    purchase: (number: string) => ['suppliers', 'purchase', number] as const,
    quote: (lines: unknown) => ['suppliers', 'quote', lines] as const,
  },
  billing: {
    settings: ['billing', 'settings'] as const,
    categories: ['billing', 'categories'] as const,
    approvers: ['billing', 'approvers'] as const,
    /** Sellable products and their stock; every sale invalidates this prefix. */
    products: ['billing', 'products'] as const,
    productList: (params: Record<string, string>) => ['billing', 'products', params] as const,
    quotes: ['billing', 'quote'] as const,
    quote: (bill: unknown) => ['billing', 'quote', bill] as const,
  },
  sales: {
    all: ['sales'] as const,
    /** Lists, summaries and the cashier filter: every new sale invalidates these. A saved sale's detail never changes. */
    history: ['sales', 'history'] as const,
    list: (params: Record<string, string>) => ['sales', 'history', 'list', params] as const,
    summary: (params: Record<string, string>) => ['sales', 'history', 'summary', params] as const,
    cashiers: ['sales', 'history', 'cashiers'] as const,
    detail: (invoiceNo: string) => ['sales', 'detail', invoiceNo] as const,
  },
} as const
