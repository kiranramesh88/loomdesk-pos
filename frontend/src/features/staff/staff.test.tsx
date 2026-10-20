import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { ANONYMOUS_SESSION, jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

const ME_ADMIN = { ...ME_CASHIER, id: 1, email: 'kiran@example.com', full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }

const member = (over: Record<string, unknown>) => ({
  id: 2,
  email: 'rahul@example.com',
  full_name: 'Rahul Menon',
  initials: 'RM',
  role: 'senior_cashier',
  is_active: true,
  has_pin: true,
  password_set: true,
  setup_link_issued_at: null,
  last_login: '2026-10-19T09:15:00Z',
  date_joined: '2026-09-01T09:00:00Z',
  ...over,
})

const SELF = member({ id: 1, email: 'kiran@example.com', full_name: 'Kiran Ramesh', role: 'admin' })
const RAHUL = member({})
const NEW = member({ id: 7, email: 'meera@example.com', full_name: 'Meera Nair', role: 'cashier', has_pin: false, password_set: false, setup_link_issued_at: '2026-10-20T10:00:00Z', last_login: null })
const GONE = member({ id: 5, email: 'old@example.com', full_name: 'Old Hand', role: 'cashier', has_pin: false, is_active: false })

const LINK = { path: '/set-password/Nw/abc123-0123456789abcdef', expires_at: '2026-10-23T10:00:00Z' }

type Call = { method: string; url: URL; body: unknown }
type Handler = (url: URL, method: string, body: unknown) => Response | undefined

function mockApi({ me = ME_ADMIN as unknown, handler = (() => undefined) as Handler } = {}) {
  document.cookie = 'csrftoken=t'
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body })
    const custom = handler(url, method, body)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (path.endsWith('/store/')) return jsonResponse(200, { name: 'Loom & Linen', code: 'LL', state: 'Kerala', today: '2026-10-20' })
    if (path.endsWith('/staff/') && method === 'GET') return jsonResponse(200, { count: 4, next: null, previous: null, results: [SELF, RAHUL, NEW, GONE] })
    if (path.endsWith('/staff/') && method === 'POST') return jsonResponse(201, { staff: NEW, setup_link: LINK })
    if (path.endsWith('/staff/1/')) return jsonResponse(200, SELF)
    if (path.endsWith('/staff/2/') && method === 'GET') return jsonResponse(200, RAHUL)
    if (path.endsWith('/staff/7/')) return jsonResponse(200, NEW)
    if (path.endsWith('/staff/5/')) return jsonResponse(200, GONE)
    if (/\/staff\/\d+\/$/.test(path)) return jsonResponse(404, { detail: 'Not found.', code: 'not_found', fields: {} })
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return calls
}

function wideScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: !query.includes(' and '), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET')

async function chooseOption(label: string, option: string, within_: HTMLElement = document.body) {
  const trigger = within(within_).getByRole('combobox', { name: label })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('staff access', () => {
  it('keeps cashiers out without asking for staff', async () => {
    const calls = mockApi({ me: ME_CASHIER })
    const { router } = renderRoutes(routes, '/admin/staff/2')
    await screen.findByRole('heading', { name: 'You don’t have access to this page' })
    expect(router.state.location.pathname).toBe('/403')
    expect(calls.some((c) => c.url.pathname.includes('/staff/'))).toBe(false)
  })
})

describe('staff list', () => {
  it('shows role, status, PIN and last sign-in for each account', async () => {
    wideScreen()
    const calls = mockApi()
    renderRoutes(routes, '/admin/staff')
    const table = await screen.findByRole('table', { name: 'Staff' })
    const row = (name: string) => within(table).getByRole('link', { name }).closest('tr') as HTMLElement
    await within(table).findByRole('link', { name: 'Rahul Menon' })
    expect(within(row('Rahul Menon')).getByText('Senior cashier')).toBeInTheDocument()
    expect(within(row('Rahul Menon')).getByText('Active')).toBeInTheDocument()
    expect(within(row('Rahul Menon')).getByText('Set')).toBeInTheDocument()
    expect(within(row('Meera Nair')).getByText('Password not set')).toBeInTheDocument()
    expect(within(row('Meera Nair')).getByText('Never')).toBeInTheDocument()
    expect(within(row('Meera Nair')).getByText('—')).toBeInTheDocument()
    expect(within(row('Old Hand')).getByText('Deactivated')).toBeInTheDocument()

    await chooseOption('Status', 'Password not set')
    await waitFor(() => expect(calls.at(-1)?.url.searchParams.get('status')).toBe('pending'))
  })

  it('adds staff and shows the set-password link once, then opens the account', async () => {
    wideScreen()
    const calls = mockApi()
    const { router } = renderRoutes(routes, '/admin/staff')
    await userEvent.click(await screen.findByRole('button', { name: 'Add staff' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add staff' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add and get link' }))
    expect(within(dialog).getByText('Enter the email address they’ll sign in with.')).toBeInTheDocument()
    expect(writes(calls)).toHaveLength(0)

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Full name' }), 'Meera Nair')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Email' }), 'meera@example.com')
    await chooseOption('Role', 'Cashier', dialog)
    expect(within(dialog).getByText('Billing only, within the cashier discount limit.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add and get link' }))

    const linkDialog = await screen.findByRole('dialog', { name: 'Set-password link for Meera Nair' })
    expect(writes(calls)[0]?.body).toEqual({ full_name: 'Meera Nair', email: 'meera@example.com', role: 'cashier' })
    expect(within(linkDialog).getByRole('textbox', { name: 'Link' })).toHaveValue(`${window.location.origin}${LINK.path}`)
    expect(within(linkDialog).getByText('Shown only now')).toBeInTheDocument()
    await userEvent.click(within(linkDialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/staff/7'))
    expect(await screen.findByText('Waiting for a password')).toBeInTheDocument()
    // The link isn't kept anywhere the page can show it again.
    expect(screen.queryByText(new RegExp(LINK.path))).not.toBeInTheDocument()
  })

  it('shows the server’s reason when the email is taken', async () => {
    wideScreen()
    mockApi({
      handler: (url, method) =>
        url.pathname.endsWith('/staff/') && method === 'POST'
          ? jsonResponse(400, { detail: 'Invalid input.', code: 'invalid', fields: { email: ['An account with this email already exists.'] } })
          : undefined,
    })
    renderRoutes(routes, '/admin/staff')
    await userEvent.click(await screen.findByRole('button', { name: 'Add staff' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add staff' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Full name' }), 'Rahul')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Email' }), 'rahul@example.com')
    await chooseOption('Role', 'Admin', dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add and get link' }))
    expect(await within(dialog).findByText('An account with this email already exists.')).toBeInTheDocument()
  })
})

describe('staff account', () => {
  it('doesn’t let admins demote or deactivate themselves', async () => {
    mockApi()
    renderRoutes(routes, '/admin/staff/1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Kiran Ramesh' })).toBeInTheDocument()
    expect(screen.getByText(/This is your account/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('combobox', { name: 'Role' })).toBeDisabled()
    expect(within(dialog).getByText('You can’t change your own role. Ask another admin.')).toBeInTheDocument()
  })

  it('warns that moving to cashier removes the PIN, and saves the change', async () => {
    let saved: unknown = RAHUL
    const calls = mockApi({
      handler: (url, method) => {
        if (!url.pathname.endsWith('/staff/2/')) return undefined
        if (method === 'PATCH') saved = { ...RAHUL, role: 'cashier', has_pin: false }
        return jsonResponse(200, saved)
      },
    })
    renderRoutes(routes, '/admin/staff/2')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Rahul Menon' })
    await chooseOption('Role', 'Cashier', dialog)
    expect(within(dialog).getByText(/approval PIN will be removed/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(writes(calls).map((c) => c.body)).toEqual([{ full_name: 'Rahul Menon', email: 'rahul@example.com', role: 'cashier' }])
    expect(await screen.findByText('Not used by cashiers')).toBeInTheDocument()
  })

  it('sets a PIN only when both entries match, and never shows it back', async () => {
    const calls = mockApi({
      handler: (url, method) => (url.pathname.endsWith('/staff/2/pin/') && method === 'PUT' ? jsonResponse(200, RAHUL) : undefined),
    })
    renderRoutes(routes, '/admin/staff/2')
    await userEvent.click(await screen.findByRole('button', { name: 'Change PIN' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change approval PIN' })
    await userEvent.type(within(dialog).getByLabelText('New PIN'), '2468')
    await userEvent.type(within(dialog).getByLabelText('Type it again'), '2469')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save PIN' }))
    expect(within(dialog).getByText('The two PINs don’t match.')).toBeInTheDocument()
    expect(writes(calls)).toHaveLength(0)
    await userEvent.clear(within(dialog).getByLabelText('Type it again'))
    await userEvent.type(within(dialog).getByLabelText('Type it again'), '2468')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save PIN' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(writes(calls).map((c) => c.body)).toEqual([{ pin: '2468' }])
    expect(screen.queryByText('2468')).not.toBeInTheDocument()
  })

  it('deactivates after confirming, and shows a refusal inside the dialog', async () => {
    let attempt = 0
    let saved: unknown = RAHUL
    const calls = mockApi({
      handler: (url, method) => {
        if (url.pathname.endsWith('/staff/2/')) return jsonResponse(200, saved)
        if (!(url.pathname.endsWith('/staff/2/deactivate/') && method === 'POST')) return undefined
        attempt += 1
        if (attempt === 1) {
          return jsonResponse(409, { detail: 'The store needs at least one active admin. Make someone else an admin first.', code: 'last_admin', fields: {} })
        }
        saved = { ...RAHUL, is_active: false }
        return jsonResponse(200, saved)
      },
    })
    renderRoutes(routes, '/admin/staff/2')
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate Rahul Menon?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    expect(await within(dialog).findByText(/at least one active admin/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText(/can’t sign in. Their bills/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
    expect(writes(calls)).toHaveLength(2)
  })

  it('issues a reset link only after confirming, and shows it once', async () => {
    mockApi({
      handler: (url, method) =>
        url.pathname.endsWith('/staff/2/setup-link/') && method === 'POST' ? jsonResponse(201, LINK) : undefined,
    })
    renderRoutes(routes, '/admin/staff/2')
    await userEvent.click(await screen.findByRole('button', { name: 'Password reset link' }))
    const confirm = await screen.findByRole('dialog', { name: 'Issue a password reset link?' })
    expect(within(confirm).getByText(/keeps their current password/)).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Issue link' }))
    const shown = await screen.findByRole('dialog', { name: 'Set-password link for Rahul Menon' })
    await userEvent.click(within(shown).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByDisplayValue(new RegExp(LINK.path))).not.toBeInTheDocument()
  })

  it('says when there’s no such account, without asking for a malformed id', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/staff/abc')
    expect(await screen.findByText('No staff account here')).toBeInTheDocument()
    expect(calls.some((c) => c.url.pathname.includes('/staff/abc'))).toBe(false)
  })
})

describe('set-password page', () => {
  const PATH = '/set-password/Nw/abc123-0123456789abcdef'

  it('sets the password from a valid link, signed out', async () => {
    const calls = mockApi({
      me: null,
      handler: (url, method) => {
        if (url.pathname.endsWith('/auth/session/')) return jsonResponse(200, ANONYMOUS_SESSION)
        if (url.pathname.endsWith('/auth/set-password/Nw/abc123-0123456789abcdef/')) return jsonResponse(200, { full_name: 'Meera Nair', email: 'meera@example.com' })
        if (url.pathname.endsWith('/auth/set-password/') && method === 'POST') {
          const body = calls.at(-1)?.body as { password: string }
          return body.password === 'password123'
            ? jsonResponse(400, { detail: 'Invalid input.', code: 'invalid', fields: { password: ['This password is too common.'] } })
            : new Response(null, { status: 204 })
        }
        return undefined
      },
    })
    renderRoutes(routes, PATH)
    expect(await screen.findByRole('heading', { level: 1, name: 'Set your password' })).toBeInTheDocument()
    expect(await screen.findByText(/For Meera Nair \(meera@example.com\)/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('New password'), 'password123')
    await userEvent.type(screen.getByLabelText('Type it again'), 'password124')
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))
    expect(screen.getByText('The two passwords don’t match.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Type it again'))
    await userEvent.type(screen.getByLabelText('Type it again'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByText('This password is too common.')).toBeInTheDocument()

    for (const field of ['New password', 'Type it again']) {
      await userEvent.clear(screen.getByLabelText(field))
      await userEvent.type(screen.getByLabelText(field), 'Loom-and-linen-42')
    }
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Password set' })).toBeInTheDocument()
    expect(writes(calls).at(-1)?.body).toEqual({ uid: 'Nw', token: 'abc123-0123456789abcdef', password: 'Loom-and-linen-42' })
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login')
  })

  it('explains an expired or used link', async () => {
    mockApi({
      me: null,
      handler: (url) =>
        url.pathname.includes('/auth/set-password/')
          ? jsonResponse(400, { detail: 'This link has expired or was already used.', code: 'invalid_link', fields: {} })
          : url.pathname.endsWith('/auth/session/')
            ? jsonResponse(200, ANONYMOUS_SESSION)
            : undefined,
    })
    renderRoutes(routes, PATH)
    expect(await screen.findByRole('heading', { level: 1, name: 'This link doesn’t work' })).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })
})
