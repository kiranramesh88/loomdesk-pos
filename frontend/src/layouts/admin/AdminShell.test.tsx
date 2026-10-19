import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy } from 'react'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

import { AdminLayout } from './AdminLayout'
import { AdminRouteError } from './AdminPageStates'

const ME_ADMIN = { ...ME_CASHIER, id: 1, email: 'kiran@loomlinen.demo', full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }
const STORE = { name: 'Loom & Linen', code: 'LL-KKD-01', state: 'Kerala' }

interface ApiOptions {
  me?: unknown
  store?: () => Response
  logout?: () => Response
}

function mockApi({ me = ME_ADMIN, store = () => jsonResponse(200, STORE), logout = () => new Response(null, { status: 204 }) }: ApiOptions = {}) {
  document.cookie = 'csrftoken=t'
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (url.endsWith('/store/')) return store()
    if (url.endsWith('/auth/logout/')) return logout()
    throw new Error(`Unexpected request ${url}`)
  })
}

/** Make the given media queries match, e.g. the 561–820px rail range. */
function matchMedia(predicate: (query: string) => boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: predicate(query),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

// jsdom reports the PageHeader's <header> as a second banner, so find the topbar's chip directly.
const topbarAccountButton = () =>
  screen.getAllByRole('button', { name: 'Kiran Ramesh, Admin: account menu' }).find((button) => button.closest('header'))!

const adminNav = () => screen.findByRole('navigation', { name: 'Admin' })

afterEach(() => vi.restoreAllMocks())

describe('access', () => {
  it('sends a cashier who opens an admin URL to 403', async () => {
    mockApi({ me: ME_CASHIER })
    const { router } = renderRoutes(routes, '/admin/products')
    await waitFor(() => expect(router.state.location.pathname).toBe('/403'))
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor to login and remembers the nested path', async () => {
    mockApi({ me: null })
    const { router } = renderRoutes(routes, '/admin/products/12')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/admin/products/12')}`)
  })
})

describe('navigation, titles and nested routes', () => {
  it('highlights the section of a nested route and titles the page from the same config', async () => {
    mockApi()
    renderRoutes(routes, '/admin/suppliers/12')
    const nav = await adminNav()
    expect(await screen.findByRole('heading', { level: 1, name: 'Suppliers' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Suppliers' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
    expect(document.title).toBe('Suppliers · LoomDesk')
    // Exactly one h1: the topbar's section name is plain text.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('marks only Overview as current on /admin', async () => {
    mockApi()
    renderRoutes(routes, '/admin')
    const nav = await adminNav()
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    const current = within(nav).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current.map((link) => link.textContent)).toEqual(['Overview'])
  })

  it('moves the highlight and title when another section is chosen', async () => {
    mockApi()
    const { router } = renderRoutes(routes, '/admin')
    const nav = await adminNav()
    await userEvent.click(within(nav).getByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/settings')
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Settings · LoomDesk')
  })

  it('shows an unbuilt module as a heading plus an empty state, with no fake actions', async () => {
    mockApi()
    renderRoutes(routes, '/admin/suppliers')
    await screen.findByRole('heading', { level: 1, name: 'Suppliers' })
    expect(screen.getByText('Suppliers isn’t available yet')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders unknown admin paths as not found inside the shell', async () => {
    mockApi()
    renderRoutes(routes, '/admin/does-not-exist')
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(await adminNav()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Overview' })).toHaveAttribute('href', '/admin')
  })

  it('has no global search, notification bell or keyboard shortcut', async () => {
    mockApi()
    renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /notification/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/quick guide/i)).not.toBeInTheDocument()
  })

  it('skip link moves focus to the main content', async () => {
    mockApi()
    renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }))
    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('store card', () => {
  it('shows a loading state, then the store from the API', async () => {
    mockApi()
    renderRoutes(routes, '/admin')
    await adminNav()
    // The sidebar is mounted before the store request settles.
    expect(screen.getAllByRole('status', { name: 'Loading store details' }).length).toBeGreaterThan(0)
    expect(await screen.findByText('LL-KKD-01 · Kerala')).toBeInTheDocument()
    expect(screen.getByText('Loom & Linen / Workspace')).toBeInTheDocument()
  })

  it('shows a failure in the card only, and recovers on retry', async () => {
    let fail = true
    mockApi({
      store: () =>
        fail
          ? jsonResponse(403, { detail: 'You do not have permission.', code: 'permission_denied', fields: {} })
          : jsonResponse(200, STORE),
    })
    renderRoutes(routes, '/admin')
    expect(await screen.findByText('Store details unavailable')).toBeInTheDocument()
    // The rest of the shell keeps working.
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading store details' }))
    expect(await screen.findByText('LL-KKD-01 · Kerala')).toBeInTheDocument()
  })
})

describe('phone navigation drawer', () => {
  // jsdom matches no media query, so the shell renders its phone layout.
  async function openDrawer() {
    const trigger = await screen.findByRole('button', { name: 'Open navigation' })
    await userEvent.click(trigger)
    return { trigger, drawer: await screen.findByRole('dialog', { name: 'Navigation' }) }
  }

  it('uses the shared nav, offers mobile admin prominently and hides the page behind it', async () => {
    mockApi()
    renderRoutes(routes, '/admin/inventory')
    await screen.findByRole('heading', { level: 1, name: 'Inventory' })
    const { drawer } = await openDrawer()
    expect(within(drawer).getByRole('link', { name: 'Switch to mobile admin' })).toHaveAttribute('href', '/admin/mobile/')
    expect(within(drawer).getByRole('link', { name: 'Inventory' })).toHaveAttribute('aria-current', 'page')
    expect(within(drawer).getAllByRole('link', { name: /Overview|Products|Settings/ })).toHaveLength(3)
    expect(drawer.contains(document.activeElement)).toBe(true)
    // Background is hidden from assistive tech while the drawer is open.
    expect(screen.getByRole('main', { hidden: true }).closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('keeps Tab inside the drawer', async () => {
    mockApi()
    renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    const { drawer } = await openDrawer()
    for (let i = 0; i < 25; i++) {
      await userEvent.tab()
      expect(drawer.contains(document.activeElement)).toBe(true)
    }
  })

  it('closes on Escape and returns focus to the menu button', async () => {
    mockApi()
    renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    const { trigger } = await openDrawer()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('closes after a link is chosen and lands on that section', async () => {
    mockApi()
    const { router } = renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    const { drawer, trigger } = await openDrawer()
    await userEvent.click(within(drawer).getByRole('link', { name: 'Returns' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/admin/returns')
    expect(await screen.findByRole('heading', { level: 1, name: 'Returns' })).toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('is not offered above phone width', async () => {
    matchMedia((query) => query === '(width >= 35.0625rem)')
    mockApi()
    renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    // The trigger is CSS-hidden at sm+; even if clicked, the drawer stays closed.
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation', hidden: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('collapsed rail', () => {
  it('keeps link names and shows a tooltip on keyboard focus', async () => {
    matchMedia((query) => query.includes('35.0625rem'))
    mockApi()
    renderRoutes(routes, '/admin')
    const nav = await adminNav()
    const reports = within(nav).getByRole('link', { name: 'Reports' })
    reports.focus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Reports')
  })
})

describe('account menu', () => {
  it('is reachable from both the topbar chip and the sidebar profile', async () => {
    mockApi()
    renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    expect(screen.getAllByRole('button', { name: 'Kiran Ramesh, Admin: account menu' })).toHaveLength(2)
  })

  it('signs out and goes to login', async () => {
    const fetchMock = mockApi()
    const { router } = renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    await userEvent.click(topbarAccountButton())
    expect(screen.getByText('kiran@loomlinen.demo')).toBeInTheDocument()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/auth/logout/')) return new Response(null, { status: 204 })
      if (url.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(null))
      throw new Error(`Unexpected request ${url}`)
    })
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('')
  })

  it('keeps the user signed in and explains when sign-out fails', async () => {
    mockApi({ logout: () => jsonResponse(500, { detail: 'The server ran into a problem.', code: 'error', fields: {} }) })
    const { router } = renderRoutes(routes, '/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    await userEvent.click(topbarAccountButton())
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByText('Couldn’t sign out')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin')
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
  })
})

describe('page loading and errors stay inside the shell', () => {
  function Broken(): never {
    throw new Error('boom')
  }
  const NeverLoads = lazy(() => new Promise<never>(() => {}))
  const shellRoutes = [
    {
      path: '/admin',
      element: <AdminLayout />,
      children: [
        {
          errorElement: <AdminRouteError />,
          children: [
            { path: 'slow', element: <NeverLoads />, handle: { title: 'Slow' } },
            { path: 'broken', element: <Broken />, handle: { title: 'Broken' } },
          ],
        },
      ],
    },
  ]

  it('shows a skeleton in main while a page loads', async () => {
    mockApi()
    renderRoutes(shellRoutes, '/admin/slow')
    // Session first, then the shell with the page skeleton.
    expect(await screen.findByRole('status', { name: 'Loading page' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
  })

  it('shows a page error in main while the navigation keeps working', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // React and the router log the thrown error
    mockApi()
    renderRoutes(shellRoutes, '/admin/broken')
    const message = await screen.findByText('Something went wrong on this page')
    expect(within(screen.getByRole('main')).getByRole('alert')).toContainElement(message)
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
  })
})
