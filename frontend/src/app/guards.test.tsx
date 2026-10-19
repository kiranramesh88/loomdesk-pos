import { screen, waitFor } from '@testing-library/react'

import { ANONYMOUS_SESSION, jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

import { RequireRole } from './guards'

const routes = [
  { path: '/login', element: <p>Login screen</p> },
  { path: '/403', element: <p>Forbidden screen</p> },
  {
    element: <RequireRole roles={['admin']} />,
    children: [{ path: '/admin/mobile/*', element: <p>Mobile admin</p> }],
  },
]

afterEach(() => vi.restoreAllMocks())

it('redirects anonymous users to login and remembers where they were going', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, ANONYMOUS_SESSION))
  const { router } = renderRoutes(routes, '/admin/mobile/bills?page=2')
  expect(await screen.findByText('Login screen')).toBeInTheDocument()
  expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/admin/mobile/bills?page=2')}`)
})

it('sends a cashier to 403 for admin routes', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, sessionOf(ME_CASHIER)))
  renderRoutes(routes, '/admin/mobile/')
  expect(await screen.findByText('Forbidden screen')).toBeInTheDocument()
})

it('lets an admin through', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, sessionOf({ ...ME_CASHIER, role: 'admin' })))
  renderRoutes(routes, '/admin/mobile/')
  await waitFor(() => expect(screen.getByText('Mobile admin')).toBeInTheDocument())
})

it('offers a retry when the server cannot be reached', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
  renderRoutes(routes, '/admin/mobile/')
  expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })).toBeInTheDocument()
})
