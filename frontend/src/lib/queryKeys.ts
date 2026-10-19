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
} as const
