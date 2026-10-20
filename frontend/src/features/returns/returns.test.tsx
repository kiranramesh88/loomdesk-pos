import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

const ME_ADMIN = { ...ME_CASHIER, id: 1, full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }

const RETURNABLE = {
  invoice_no: 'LD-000042',
  status: 'completed',
  created_at: '2026-10-20T10:30:00Z',
  cashier_name: 'Anjali Prakash',
  total_paise: 605790,
  payment_method: 'upi',
  refund_methods: ['upi', 'cash'],
  can_return: true,
  lines: [
    {
      id: 11, product_name: 'Classic Cotton Shirt', variant_sku: 'SH-CT-001-M-BLU', size: 'M', colour: 'Blue', quantity: 3,
      unit_price_paise: 119900, discount_paise: 8885, tax_rate_bp: 500, total_paise: 363692, returned: 1, eligible: 2,
    },
    {
      id: 12, product_name: 'Linen Jacket', variant_sku: 'JK-LN-001-L-SAN', size: 'L', colour: 'Sand', quantity: 1,
      unit_price_paise: 300000, discount_paise: 0, tax_rate_bp: 1800, total_paise: 354000, returned: 1, eligible: 0,
    },
  ],
  returns: [{ number: 'RET-000001', total_paise: 120000 }],
}

// Server figures that no simple client calculation would give, so the test proves they're shown as sent.
const QUOTE = {
  invoice_no: 'LD-000042',
  lines: [{ sale_line: 11, quantity: 2, disposition: 'sellable', subtotal_paise: 239800, discount_paise: 5923, taxable_paise: 233877, tax_paise: 11694, total_paise: 245571 }],
  totals: { subtotal_paise: 239800, discount_paise: 5923, taxable_paise: 233877, tax_paise: 11694, total_paise: 245571 },
}

const RETURN = {
  number: 'RET-000002',
  created_at: '2026-10-21T09:00:00Z',
  created_by_name: 'Kiran Ramesh',
  invoice_no: 'LD-000042',
  sale_created_at: '2026-10-20T10:30:00Z',
  reason: 'size_fit',
  note: '',
  ...QUOTE.totals,
  lines: [
    {
      id: 5, sale_line: 11, variant: 31, product_name: 'Classic Cotton Shirt', variant_sku: 'SH-CT-001-M-BLU', size: 'M', colour: 'Blue',
      sold_quantity: 3, quantity: 1, disposition: 'sellable', subtotal_paise: 119900, discount_paise: 2961, taxable_paise: 116939, tax_paise: 5847, total_paise: 122786,
    },
    {
      id: 6, sale_line: 11, variant: 31, product_name: 'Classic Cotton Shirt', variant_sku: 'SH-CT-001-M-BLU', size: 'M', colour: 'Blue',
      sold_quantity: 3, quantity: 1, disposition: 'inspection', subtotal_paise: 119900, discount_paise: 2962, taxable_paise: 116938, tax_paise: 5847, total_paise: 122785,
    },
  ],
  refund: { method: 'upi', amount_paise: 245571, reference: 'UTR-REF-9', gateway_verified: false, recorded_at: '2026-10-21T09:00:00Z', recorded_by_name: 'Kiran Ramesh' },
}

const LIST_ROW = {
  number: 'RET-000002', created_at: '2026-10-21T09:00:00Z', invoice_no: 'LD-000042', reason: 'size_fit', units: 2, total_paise: 245571,
  refund_method: 'upi', dispositions: ['sellable', 'inspection'], created_by_name: 'Kiran Ramesh',
}

type Call = { method: string; url: URL; body: unknown; headers: Record<string, string> }
type Handler = (url: URL, method: string, body: unknown) => Response | undefined

function mockApi({ me = ME_ADMIN as unknown, handler = (() => undefined) as Handler } = {}) {
  document.cookie = 'csrftoken=t'
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body, headers: Object.fromEntries(new Headers(init?.headers).entries()) })
    const custom = handler(url, method, body)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (path.endsWith('/store/')) return jsonResponse(200, { name: 'Loom & Linen', code: 'LL', state: 'Kerala', today: '2026-10-21' })
    if (path.endsWith('/returns/invoice/LD-000042/')) return jsonResponse(200, RETURNABLE)
    if (/\/returns\/invoice\//.test(path)) return jsonResponse(404, { detail: 'No sale has that invoice number.', code: 'not_found', fields: {} })
    if (path.endsWith('/returns/quote/')) return jsonResponse(200, QUOTE)
    if (path.endsWith('/returns/') && method === 'POST') return jsonResponse(201, RETURN)
    if (path.endsWith('/returns/') && method === 'GET') return jsonResponse(200, { count: 1, next: null, previous: null, results: [LIST_ROW] })
    if (path.endsWith('/returns/RET-000002/')) return jsonResponse(200, RETURN)
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return calls
}

function wideScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: !query.includes(' and '), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

const posts = (calls: Call[], suffix: string) => calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith(suffix))

async function chooseOption(label: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: label })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function openWizard(invoice = 'LD-000042') {
  const utils = renderRoutes(routes, `/admin/returns/new?invoice=${invoice}`)
  await screen.findByRole('heading', { level: 1, name: 'New return' })
  return utils
}

configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('returns access', () => {
  it('keeps cashiers out, without asking the API', async () => {
    const calls = mockApi({ me: ME_CASHIER })
    const { router } = renderRoutes(routes, '/admin/returns/new?invoice=LD-000042')
    await screen.findByRole('heading', { name: 'You don’t have access to this page' })
    expect(router.state.location.pathname).toBe('/403')
    expect(calls.some((c) => c.url.pathname.includes('/returns/'))).toBe(false)
  })
})

describe('returns list', () => {
  it('shows each return with its bill, refund and where the items went', async () => {
    wideScreen()
    const calls = mockApi()
    renderRoutes(routes, '/admin/returns')
    const table = await screen.findByRole('table', { name: 'Returns' })
    const row = (await within(table).findByRole('link', { name: 'RET-000002' })).closest('tr') as HTMLElement
    expect(within(row).getByRole('link', { name: 'LD-000042' })).toHaveAttribute('href', '/admin/transactions/LD-000042')
    expect(within(row).getByText('Size or fit')).toBeInTheDocument()
    expect(within(row).getByText('2 units')).toBeInTheDocument()
    expect(within(row).getByText('Back to stock')).toBeInTheDocument()
    expect(within(row).getByText('Inspection hold')).toBeInTheDocument()
    expect(within(row).getByText('₹2,455.71')).toBeInTheDocument()
    expect(within(row).getByText('UPI · not gateway-verified')).toBeInTheDocument()

    await chooseOption('Where the items went', 'Inspection hold')
    await waitFor(() => expect(calls.at(-1)?.url.searchParams.get('disposition')).toBe('inspection'))
  })
})

describe('return wizard', () => {
  it('starts from the bill and shows sold, returned and returnable quantities', async () => {
    mockApi()
    await openWizard()
    expect(await screen.findByText(/can return 2/)).toBeInTheDocument()
    expect(screen.getByText(/Sold 3 · already returned 1/)).toBeInTheDocument()
    expect(screen.getByText('All returned already.')).toBeInTheDocument()
    // The jacket can't come back again, so it has no quantity field.
    expect(screen.queryByRole('textbox', { name: /Linen Jacket/ })).not.toBeInTheDocument()
  })

  it('checks quantities and the reason before asking for a refund', async () => {
    const calls = mockApi()
    await openWizard()
    await screen.findByText(/can return 2/)
    await userEvent.click(screen.getByRole('button', { name: 'Review refund' }))
    expect(screen.getByText('Enter how many units of at least one item are coming back.')).toBeInTheDocument()
    expect(screen.getByText('Choose why the items came back.')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: /Units of Classic Cotton Shirt/ }), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Review refund' }))
    expect(screen.getByText('Only 2 can be returned.')).toBeInTheDocument()
    expect(posts(calls, '/returns/quote/')).toHaveLength(0)
  })

  it('reviews the server’s refund, then records it once with an idempotency key', async () => {
    const calls = mockApi()
    const { router } = await openWizard()
    await screen.findByText(/can return 2/)
    await userEvent.type(screen.getByRole('textbox', { name: /Units of Classic Cotton Shirt/ }), '2')
    await chooseOption('Reason', 'Size or fit')
    await userEvent.type(screen.getByRole('textbox', { name: 'UPI transaction ID' }), 'UTR-REF-9')
    await userEvent.click(screen.getByRole('button', { name: 'Review refund' }))

    expect(await screen.findByText('Nothing is saved until you confirm.')).toBeInTheDocument()
    expect(posts(calls, '/returns/quote/')[0]?.body).toEqual({
      invoice_no: 'LD-000042',
      reason: 'size_fit',
      note: '',
      lines: [{ sale_line: 11, quantity: 2, disposition: 'sellable' }],
      refund: { method: 'upi', reference: 'UTR-REF-9' },
    })
    expect(screen.getAllByText('₹2,455.71').length).toBeGreaterThan(0)
    expect(screen.getByText('−₹59.23')).toBeInTheDocument()
    expect(screen.getByText('2 units go back into stock.')).toBeInTheDocument()
    expect(screen.getByText('Recorded, not gateway-verified')).toBeInTheDocument()

    const confirm = screen.getByRole('button', { name: 'Confirm return · ₹2,455.71' })
    await userEvent.dblClick(confirm)
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/returns/RET-000002'))
    const created = posts(calls, '/returns/')
    expect(created).toHaveLength(1)
    expect(created[0]?.body).toMatchObject({ expected_total_paise: 245571, lines: [{ sale_line: 11, quantity: 2 }] })
    expect(created[0]?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('retries a lost request with the same key, and re-reviews a changed refund', async () => {
    let attempt = 0
    const calls = mockApi({
      handler: (url, method) => {
        if (!(url.pathname.endsWith('/returns/') && method === 'POST')) return undefined
        attempt += 1
        if (attempt === 1) throw new TypeError('Failed to fetch')
        return jsonResponse(409, { detail: 'The refund is now ₹1,227.86, not the ₹2,455.71 shown. Review the return again.', code: 'refund_changed', fields: {} })
      },
    })
    await openWizard()
    await screen.findByText(/can return 2/)
    await userEvent.type(screen.getByRole('textbox', { name: /Units of Classic Cotton Shirt/ }), '2')
    await chooseOption('Reason', 'Size or fit')
    await userEvent.click(screen.getByRole('radio', { name: 'Cash' }))
    await userEvent.click(screen.getByRole('button', { name: 'Review refund' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Confirm return/ }))
    expect(await screen.findByText(/it won’t be recorded twice/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Confirm return/ }))
    expect(await screen.findByText(/Review the return again/)).toBeInTheDocument()
    const created = posts(calls, '/returns/')
    expect(created).toHaveLength(2)
    expect(created[0]?.headers['idempotency-key']).toBe(created[1]?.headers['idempotency-key'])
    // Back on the items step to review again.
    expect(screen.getByRole('button', { name: 'Review refund' })).toBeInTheDocument()
  })

  it('explains a voided bill instead of offering a return', async () => {
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/returns/invoice/LD-000042/') ? jsonResponse(200, { ...RETURNABLE, status: 'voided', can_return: false }) : undefined,
    })
    await openWizard()
    expect(await screen.findByText('This bill was voided, so its items are already back in stock.', { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review refund' })).not.toBeInTheDocument()
  })

  it('says when no bill matches', async () => {
    mockApi()
    await openWizard('LD-999999')
    expect(await screen.findByText('No bill with that invoice number')).toBeInTheDocument()
  })
})

describe('return detail', () => {
  it('shows the refund as recorded, where each item went and any inspection hold', async () => {
    wideScreen()
    mockApi()
    renderRoutes(routes, '/admin/returns/RET-000002')
    expect(await screen.findByRole('heading', { level: 1, name: 'Return RET-000002' })).toBeInTheDocument()
    expect(screen.getByText('Items on inspection hold')).toBeInTheDocument()
    expect(screen.getByText('Manually recorded')).toBeInTheDocument()
    expect(screen.getByText('UTR-REF-9')).toBeInTheDocument()
    const lines = screen.getByRole('table', { name: 'Items returned' })
    expect(within(lines).getAllByText('1 of 3')).toHaveLength(2)
    expect(within(lines).getByText('Inspection hold')).toBeInTheDocument()
    expect(screen.getByText('1 unit back into stock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument()
  })

  it('says when the number matches nothing, without asking for a malformed one', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/returns/not-a-return')
    expect(await screen.findByText('No return with that number')).toBeInTheDocument()
    expect(calls.some((c) => c.url.pathname.includes('/returns/not-a-return'))).toBe(false)
  })
})
