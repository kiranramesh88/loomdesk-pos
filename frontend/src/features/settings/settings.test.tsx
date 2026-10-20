import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

const ME_ADMIN = { ...ME_CASHIER, id: 1, full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }

const SETTINGS = {
  name: 'Loom & Linen',
  code: 'LL-KKD-01',
  address: 'Beach Road, Kozhikode, Kerala',
  state: 'Kerala',
  gstin: '',
  prices_include_tax: false,
  cashier_discount_limit_pct: 10,
  states: ['Karnataka', 'Kerala', 'Tamil Nadu'],
}

const GARMENTS = { id: 1, name: 'Garments (GST)', kind: 'price_band', flat_rate_bp: null, threshold_paise: 250000, lower_rate_bp: 500, upper_rate_bp: 1800, summary: '5% up to ₹2,500 per unit, 18% above' }
const STANDARD = { id: 2, name: 'Standard 18%', kind: 'flat', flat_rate_bp: 1800, threshold_paise: null, lower_rate_bp: null, upper_rate_bp: null, summary: '18%' }
const CATEGORIES = [
  { id: 1, name: 'Shirts', hsn_code: '6205', tax_rule: GARMENTS },
  { id: 2, name: 'Accessories', hsn_code: '4202', tax_rule: STANDARD },
]

type Call = { method: string; url: URL; body: unknown }
type Handler = (url: URL, method: string, body: unknown) => Response | undefined

function mockApi({ me = ME_ADMIN as unknown, handler = (() => undefined) as Handler } = {}) {
  document.cookie = 'csrftoken=t'
  const calls: Call[] = []
  let saved = { ...SETTINGS }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body })
    const custom = handler(url, method, body)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (path.endsWith('/store/')) return jsonResponse(200, { name: saved.name, code: saved.code, state: saved.state, today: '2026-10-20' })
    if (path.endsWith('/store/settings/') && method === 'PATCH') {
      saved = { ...saved, ...(body as object) }
      return jsonResponse(200, saved)
    }
    if (path.endsWith('/store/settings/')) return jsonResponse(200, saved)
    if (path.endsWith('/catalog/tax-rules/')) return jsonResponse(200, [GARMENTS, STANDARD])
    if (path.endsWith('/catalog/categories/')) return jsonResponse(200, CATEGORIES)
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return calls
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET')

function wideScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: !query.includes(' and '), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

async function openSettings() {
  const utils = renderRoutes(routes, '/admin/settings')
  await screen.findByRole('textbox', { name: 'Store name' })
  return utils
}

configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('settings', () => {
  it('keeps cashiers out without asking for settings', async () => {
    const calls = mockApi({ me: ME_CASHIER })
    const { router } = renderRoutes(routes, '/admin/settings')
    await screen.findByRole('heading', { name: 'You don’t have access to this page' })
    expect(router.state.location.pathname).toBe('/403')
    expect(calls.some((c) => c.url.pathname.includes('/store/settings/'))).toBe(false)
  })

  it('shows the saved details and the GST rules, read-only', async () => {
    wideScreen()
    mockApi()
    await openSettings()
    expect(screen.getByRole('textbox', { name: 'Store code' })).toHaveValue('LL-KKD-01')
    expect(screen.getByRole('combobox', { name: 'State' })).toHaveTextContent('Kerala')
    expect(screen.getByRole('radio', { name: /Exclude GST/ })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Cashier discount limit' })).toHaveValue('10')
    const rules = await screen.findByRole('table', { name: 'GST rules' })
    const garments = within(rules).getByText('Garments (GST)').closest('tr') as HTMLElement
    expect(within(garments).getByText('5% up to ₹2,500 per unit, 18% above')).toBeInTheDocument()
    expect(within(garments).getByText('Shirts (HSN 6205)')).toBeInTheDocument()
    expect(within(rules).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save store details' })).toBeDisabled()
  })

  it('lists the GST rules on a phone instead of a wide table', async () => {
    mockApi()
    await openSettings()
    expect(await screen.findByText('Shirts (HSN 6205)')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'GST rules' })).not.toBeInTheDocument()
  })

  it('saves only the store details that changed', async () => {
    const calls = mockApi()
    await openSettings()
    const name = screen.getByRole('textbox', { name: 'Store name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Loom & Linen Calicut')
    await userEvent.type(screen.getByRole('textbox', { name: /GSTIN/ }), '32aaaaa0000a1zb')
    expect(screen.getByRole('textbox', { name: /GSTIN/ })).toHaveValue('32AAAAA0000A1ZB')
    await userEvent.click(screen.getByRole('button', { name: 'Save store details' }))
    await waitFor(() => expect(writes(calls)).toHaveLength(1))
    expect(writes(calls)[0]?.body).toEqual({ name: 'Loom & Linen Calicut', gstin: '32AAAAA0000A1ZB' })
    expect(await screen.findByText('Store details saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save store details' })).toBeDisabled())
  })

  it('shows the server’s reason next to the field', async () => {
    mockApi({
      handler: (url, method) =>
        url.pathname.endsWith('/store/settings/') && method === 'PATCH'
          ? jsonResponse(400, { detail: 'Invalid input.', code: 'invalid', fields: { gstin: ['A GSTIN registered in Kerala starts with 32.'] } })
          : undefined,
    })
    await openSettings()
    await userEvent.type(screen.getByRole('textbox', { name: /GSTIN/ }), '27AAPFU0939F1ZV')
    await userEvent.click(screen.getByRole('button', { name: 'Save store details' }))
    expect(await screen.findByText('A GSTIN registered in Kerala starts with 32.')).toBeInTheDocument()
  })

  it('confirms before switching how prices are read', async () => {
    const calls = mockApi()
    await openSettings()
    await userEvent.click(screen.getByRole('radio', { name: /Include GST/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save pricing rules' }))
    const dialog = await screen.findByRole('dialog', { name: 'Treat prices as including GST?' })
    expect(within(dialog).getByText(/asks the cashier to confirm its new total/)).toBeInTheDocument()
    expect(writes(calls)).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change pricing' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(writes(calls).map((c) => c.body)).toEqual([{ prices_include_tax: true }])
    expect(await screen.findByRole('radio', { name: /Include GST/ })).toBeChecked()
  })

  it('checks the discount limit, and saves it without a confirmation', async () => {
    const calls = mockApi()
    await openSettings()
    const limit = screen.getByRole('textbox', { name: 'Cashier discount limit' })
    await userEvent.clear(limit)
    await userEvent.type(limit, '150')
    await userEvent.click(screen.getByRole('button', { name: 'Save pricing rules' }))
    expect(screen.getByText('Enter a whole number from 0 to 100.')).toBeInTheDocument()
    await userEvent.clear(limit)
    await userEvent.type(limit, '15')
    await userEvent.click(screen.getByRole('button', { name: 'Save pricing rules' }))
    await waitFor(() => expect(writes(calls).map((c) => c.body)).toEqual([{ cashier_discount_limit_pct: 15 }]))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a load failure in place of the forms', async () => {
    mockApi({
      handler: (url) => (url.pathname.endsWith('/store/settings/') ? jsonResponse(500, { detail: 'Server error.', code: 'error', fields: {} }) : undefined),
    })
    renderRoutes(routes, '/admin/settings')
    expect(await screen.findByText('Settings couldn’t load')).toBeInTheDocument()
  })
})
