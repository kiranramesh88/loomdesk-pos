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
} as const
