import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

import { createQueryClient } from '@/lib/queryClient'

/** Render routes in a memory router with a fresh query client. */
export function renderRoutes(routes: RouteObject[], initialPath: string) {
  const queryClient = createQueryClient()
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...utils, router, queryClient }
}

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const ME_CASHIER = {
  id: 4,
  email: 'anjali@loomlinen.demo',
  full_name: 'Anjali Prakash',
  initials: 'AP',
  role: 'cashier',
  permissions: { can_access_admin: false, can_approve_discounts: false, can_view_costs: false },
} as const

/** `GET /auth/session/` bodies: signed out, or signed in as `me`. */
export const ANONYMOUS_SESSION = { user: null }
export const sessionOf = (me: unknown) => ({ user: me })
