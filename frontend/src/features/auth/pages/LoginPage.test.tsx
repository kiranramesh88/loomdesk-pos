import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ANONYMOUS_SESSION, jsonResponse, ME_CASHIER, renderRoutes } from '@/test/render'

import { LoginPage } from './LoginPage'

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/billing', element: <p>Billing home</p> },
  { path: '/admin/products', element: <p>Products</p> },
]

function mockApi(loginResponse: () => Response) {
  document.cookie = 'csrftoken=t'
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/session/')) return jsonResponse(200, ANONYMOUS_SESSION)
    if (url.endsWith('/auth/login/')) return loginResponse()
    throw new Error(`Unexpected request ${url}`)
  })
}

afterEach(() => vi.restoreAllMocks())

it('validates fields before calling the API', async () => {
  const fetchMock = mockApi(() => jsonResponse(200, ME_CASHIER))
  renderRoutes(routes, '/login')
  await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/login/'))).toBe(false)
})

it('shows the server message for bad credentials and keeps the typed email', async () => {
  mockApi(() => jsonResponse(400, { detail: 'Email or password is incorrect.', code: 'invalid_credentials', fields: {} }))
  renderRoutes(routes, '/login')
  await userEvent.type(await screen.findByLabelText('Email address'), 'anjali@loomlinen.demo')
  await userEvent.type(screen.getByLabelText('Password'), 'wrong')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
  expect(screen.getByLabelText('Email address')).toHaveValue('anjali@loomlinen.demo')
})

it('sends a cashier to billing after signing in', async () => {
  mockApi(() => jsonResponse(200, ME_CASHIER))
  renderRoutes(routes, '/login')
  await userEvent.type(await screen.findByLabelText('Email address'), 'anjali@loomlinen.demo')
  await userEvent.type(screen.getByLabelText('Password'), 'loomdesk-demo')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Billing home')).toBeInTheDocument()
})

it('honours a safe ?next= path but ignores an external one', async () => {
  mockApi(() => jsonResponse(200, ME_CASHIER))
  const { router } = renderRoutes(routes, `/login?next=${encodeURIComponent('//evil.example')}`)
  await userEvent.type(await screen.findByLabelText('Email address'), 'anjali@loomlinen.demo')
  await userEvent.type(screen.getByLabelText('Password'), 'loomdesk-demo')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/billing'))
})

it('toggles password visibility with an accessible button', async () => {
  mockApi(() => jsonResponse(200, ME_CASHIER))
  renderRoutes(routes, '/login')
  const password = await screen.findByLabelText('Password')
  expect(password).toHaveAttribute('type', 'password')
  await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password).toHaveAttribute('type', 'text')
})
