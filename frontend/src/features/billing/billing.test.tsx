import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { ANONYMOUS_SESSION, jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

const ME_ADMIN = { ...ME_CASHIER, id: 1, full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }

const RULE = {
  id: 1,
  name: 'Garments',
  kind: 'price_band',
  flat_rate_bp: null,
  threshold_paise: 250000,
  lower_rate_bp: 500,
  upper_rate_bp: 1800,
  summary: '5% up to ₹2,500 per unit, 18% above',
}

const SHIRT = {
  id: 12,
  name: 'Classic Cotton Shirt',
  sku: 'SH-CT-001',
  category: { id: 3, name: 'Shirts' },
  image_url: null,
  hsn_code: '6205',
  tax_rule: RULE,
  variants: [
    { id: 31, sku: 'SH-CT-001-M-BLU', size: 'M', colour: 'Blue', barcode: '8901000010018', price_paise: 119900, on_hand: 4, stock_state: 'in_stock' },
    { id: 32, sku: 'SH-CT-001-L-BLU', size: 'L', colour: 'Blue', barcode: null, price_paise: 119900, on_hand: 0, stock_state: 'out_of_stock' },
  ],
}
const TOWEL = {
  ...SHIRT,
  id: 14,
  name: 'Soft Cotton Towel',
  sku: 'HL-TW-001',
  category: { id: 5, name: 'Home linen' },
  variants: [{ id: 51, sku: 'HL-TW-001-STD-IVO', size: 'Standard', colour: 'Ivory', barcode: '8901000050014', price_paise: 44900, on_hand: 14, stock_state: 'in_stock' }],
}
const SOLD_OUT = {
  ...SHIRT,
  id: 15,
  name: 'Linen Jacket',
  sku: 'JK-LN-001',
  variants: [{ id: 61, sku: 'JK-LN-001-L-SAN', size: 'L', colour: 'Sand', barcode: null, price_paise: 300000, on_hand: 0, stock_state: 'out_of_stock' }],
}

/** A quote with deliberately "odd" figures, so the test proves the UI shows the server's numbers. */
const QUOTE = {
  lines: [
    { variant: 31, quantity: 1, on_hand: 4, unit_price_paise: 119900, subtotal_paise: 119900, discount_paise: 0, taxable_paise: 119900, tax_rate_bp: 500, tax_paise: 5995, total_paise: 125895 },
  ],
  prices_include_tax: false,
  subtotal_paise: 119900,
  discount_paise: 0,
  taxable_paise: 119900,
  tax_paise: 5995,
  total_paise: 125895,
  tax_breakdown: [{ rate_bp: 500, taxable_paise: 119900, tax_paise: 5995, cgst_paise: 2997, sgst_paise: 2998 }],
  discount_limit_paise: 11990,
  needs_approval: false,
}

const SALE = {
  invoice_no: 'LD-000042',
  status: 'completed',
  created_at: '2026-10-20T10:30:00Z',
  cashier_name: 'Anjali Prakash',
  store: { name: 'Loom & Linen', code: 'LL-KKD-01', address: 'Beach Road, Kozhikode, Kerala', state: 'Kerala', gstin: '32ABCDE1234F1Z5' },
  prices_include_tax: false,
  subtotal_paise: 119900,
  discount_paise: 0,
  taxable_paise: 119900,
  tax_paise: 5995,
  total_paise: 125895,
  discount_approved_by_name: null,
  voided_at: null,
  voided_by_name: null,
  void_reason: '',
  return_state: 'none',
  returned_units: 0,
  refunded_paise: 0,
  returns: [],
  lines: [
    {
      id: 1, variant: 31, product_name: 'Classic Cotton Shirt', product_sku: 'SH-CT-001', variant_sku: 'SH-CT-001-M-BLU', size: 'M',
      colour: 'Blue', hsn_code: '6205', quantity: 1, unit_price_paise: 119900, subtotal_paise: 119900, discount_paise: 0,
      taxable_paise: 119900, tax_rate_bp: 500, tax_paise: 5995, total_paise: 125895,
    },
  ],
  tax_breakdown: [{ rate_bp: 500, taxable_paise: 119900, tax_paise: 5995, cgst_paise: 2997, sgst_paise: 2998 }],
  payment: { method: 'cash', amount_paise: 125895, tendered_paise: 130000, change_paise: 4105, reference: '', gateway_verified: false, recorded_at: '2026-10-20T10:30:00Z' },
}

type Call = { method: string; url: URL; body: unknown; headers: Record<string, string> }
type Handler = (url: URL, method: string, body: unknown) => Response | undefined

function mockApi({ me = ME_CASHIER as unknown, handler = (() => undefined) as Handler } = {}) {
  document.cookie = 'csrftoken=t'
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    calls.push({ method, url, body, headers: (init?.headers ?? {}) as Record<string, string> })
    const custom = handler(url, method, body)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (path.endsWith('/billing/settings/'))
      return jsonResponse(200, { store_name: 'Loom & Linen', store_code: 'LL-KKD-01', prices_include_tax: false, cashier_discount_limit_pct: 10 })
    if (path.endsWith('/billing/categories/')) return jsonResponse(200, [{ id: 3, name: 'Shirts' }, { id: 5, name: 'Home linen' }])
    if (path.endsWith('/billing/approvers/')) return jsonResponse(200, [{ id: 3, full_name: 'Rahul Krishnan', role: 'senior_cashier' }])
    if (path.endsWith('/billing/products/')) {
      const q = url.searchParams.get('q')?.toLowerCase()
      const results = [SHIRT, TOWEL, SOLD_OUT].filter(
        (p) => !q || p.name.toLowerCase().includes(q) || p.variants.some((v) => v.barcode === q || v.sku.toLowerCase() === q),
      )
      return jsonResponse(200, { count: results.length, next: null, previous: null, results })
    }
    if (path.endsWith('/sales/quote/')) return jsonResponse(200, QUOTE)
    if (path.endsWith('/sales/') && method === 'POST') return jsonResponse(201, SALE)
    if (path.endsWith('/sales/LD-000042/')) return jsonResponse(200, SALE)
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return calls
}

/** The billing split view (catalogue beside the bill) starts at md. */
function wideScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('width >='), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

const posts = (calls: Call[], suffix: string) => calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith(suffix))

async function openBilling(path = '/billing') {
  const utils = renderRoutes(routes, path)
  await screen.findByRole('list', { name: 'Products' })
  return utils
}

async function addShirtM() {
  await userEvent.click(screen.getByRole('button', { name: /^Classic Cotton Shirt/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Choose an option' })
  await userEvent.click(within(dialog).getByRole('radio', { name: /M · Blue/ }))
  await userEvent.click(within(dialog).getByRole('button', { name: /^Add/ }))
  await within(screen.getByRole('list', { name: 'Items on the bill' })).findByText('Classic Cotton Shirt')
}

async function openPayment() {
  const pay = await screen.findByRole('button', { name: 'Take payment · ₹1,258.95' })
  await userEvent.click(pay)
  return screen.findByRole('dialog', { name: 'Take payment' })
}

// Billing pages are lazy chunks; the first load in a busy run can pass 1s.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('billing access', () => {
  it('sends signed-out visitors to sign in', async () => {
    mockApi({ me: null })
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(200, ANONYMOUS_SESSION))
    const { router } = renderRoutes(routes, '/billing')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('shows the cashier and store in the top bar, without the admin link', async () => {
    wideScreen()
    mockApi()
    await openBilling()
    const header = screen.getByRole('banner')
    expect(within(header).getByText('Anjali Prakash')).toBeInTheDocument()
    expect(within(header).getByText('Cashier')).toBeInTheDocument()
    expect(await within(header).findByText('Loom & Linen')).toBeInTheDocument()
    expect(within(header).queryByRole('link', { name: 'Admin portal' })).not.toBeInTheDocument()
  })

  it('gives admins a way back to the admin portal', async () => {
    wideScreen()
    mockApi({ me: ME_ADMIN })
    await openBilling()
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Admin portal' })).toHaveAttribute('href', '/admin')
  })
})

describe('catalogue', () => {
  it('shows products with stock in words and keeps sold-out items visible but disabled', async () => {
    wideScreen()
    mockApi()
    await openBilling()
    expect(screen.getByText('3 products')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Classic Cotton Shirt, ₹1,199.00, 4 in stock. Choose an option/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Linen Jacket, .*Out of stock/ })).toBeDisabled()
  })

  it('searches by name and filters by category', async () => {
    wideScreen()
    const calls = mockApi()
    await openBilling()
    await userEvent.type(screen.getByRole('searchbox'), 'towel')
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Classic Cotton Shirt/ })).not.toBeInTheDocument())
    expect(calls.some((c) => c.url.pathname.endsWith('/billing/products/') && c.url.searchParams.get('q') === 'towel')).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Home linen' }))
    expect(screen.getByRole('button', { name: 'Home linen' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() =>
      expect(calls.some((c) => c.url.pathname.endsWith('/billing/products/') && c.url.searchParams.get('category') === '5')).toBe(true),
    )
  })

  it('shows an empty state with a way to clear the search', async () => {
    wideScreen()
    mockApi()
    await openBilling()
    await userEvent.type(screen.getByRole('searchbox'), 'silk')
    expect(await screen.findByText('Nothing matches “silk”')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(await screen.findByRole('button', { name: /^Classic Cotton Shirt/ })).toBeInTheDocument()
  })

  it('shows a catalogue error in place, with retry', async () => {
    wideScreen()
    let fail = true
    mockApi({ handler: (url) => (url.pathname.endsWith('/billing/products/') && fail ? jsonResponse(400, { detail: 'Bad filter.', code: 'invalid', fields: {} }) : undefined) })
    renderRoutes(routes, '/billing')
    expect(await screen.findByText('Products couldn’t load')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Products' })).toBeInTheDocument()
  })

  it('adds a scanned barcode straight to the bill', async () => {
    wideScreen()
    const calls = mockApi()
    await openBilling()
    await userEvent.type(screen.getByRole('searchbox'), '8901000050014{Enter}')
    const bill = await screen.findByRole('list', { name: 'Items on the bill' })
    expect(within(bill).getByText('Soft Cotton Towel')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('')
    await waitFor(() => expect(posts(calls, '/sales/quote/').at(-1)?.body).toEqual({ lines: [{ variant: 51, quantity: 1 }], discount: null }))
  })

  it('focuses search with the / key', async () => {
    wideScreen()
    mockApi()
    await openBilling()
    fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })
})

describe('building the bill', () => {
  it('needs the exact variant before adding, and offers only options in stock', async () => {
    wideScreen()
    mockApi()
    await openBilling()
    await userEvent.click(screen.getByRole('button', { name: /^Classic Cotton Shirt/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose an option' })
    expect(within(dialog).getByRole('radio', { name: /M · Blue/ })).not.toBeChecked()
    expect(within(dialog).getByRole('radio', { name: /L · Blue/ })).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to bill' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose a size and colour first.')
    expect(screen.queryByRole('list', { name: 'Items on the bill' })).not.toBeInTheDocument()
  })

  it('shows the server’s totals and sends only variants and quantities', async () => {
    wideScreen()
    const calls = mockApi()
    await openBilling()
    expect(screen.getByRole('button', { name: 'Add items to take payment' })).toBeDisabled()
    await addShirtM()
    const panel = screen.getByRole('region', { name: 'Current bill' })
    expect(await within(panel).findByText('₹1,258.95')).toBeInTheDocument()
    expect(within(panel).getByText('GST 5%')).toBeInTheDocument()
    expect(within(panel).getByText('CGST 2.5% + SGST 2.5%')).toBeInTheDocument()
    const body = posts(calls, '/sales/quote/').at(-1)?.body
    expect(body).toEqual({ lines: [{ variant: 31, quantity: 1 }], discount: null })
  })

  it('changes quantity up to the stock the server reports, and removes lines', async () => {
    wideScreen()
    const calls = mockApi()
    await openBilling()
    await addShirtM()
    const increase = screen.getByRole('button', { name: 'Increase quantity of Classic Cotton Shirt, M · Blue' })
    await userEvent.click(increase)
    await waitFor(() => expect(posts(calls, '/sales/quote/').at(-1)?.body).toMatchObject({ lines: [{ variant: 31, quantity: 2 }] }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Classic Cotton Shirt, M · Blue' }))
    expect(await screen.findByText('The bill is empty')).toBeInTheDocument()
  })

  it('shows the server’s stock error on the line and blocks payment', async () => {
    wideScreen()
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/sales/quote/')
          ? jsonResponse(400, { detail: 'Invalid', code: 'invalid', fields: { 'lines.0.quantity': ['Only 1 left in stock.'] } })
          : undefined,
    })
    await openBilling()
    await addShirtM()
    expect(await screen.findByText('Only 1 left in stock.')).toBeInTheDocument()
    expect(screen.getByText(/Fix the highlighted lines/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /take payment|Updating total/i })).toBeDisabled()
  })

  it('keeps the bill through a refresh', async () => {
    wideScreen()
    mockApi()
    const first = await openBilling()
    await addShirtM()
    first.unmount()
    await openBilling()
    expect(within(screen.getByRole('list', { name: 'Items on the bill' })).getByText('Classic Cotton Shirt')).toBeInTheDocument()
  })

  it('sends a discount as chosen, and warns when it needs approval', async () => {
    wideScreen()
    const calls = mockApi({
      handler: (url, _method, body) =>
        url.pathname.endsWith('/sales/quote/') && (body as { discount: unknown }).discount
          ? jsonResponse(200, { ...QUOTE, discount_paise: 23980, needs_approval: true, total_paise: 100717 })
          : undefined,
    })
    await openBilling()
    await addShirtM()
    await userEvent.click(screen.getByRole('button', { name: 'Add discount' }))
    const dialog = await screen.findByRole('dialog', { name: 'Bill discount' })
    expect(within(dialog).getByText(/up to 10% yourself/)).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Discount percentage'), '20')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply discount' }))
    expect(await screen.findByText(/above your limit/)).toBeInTheDocument()
    expect(posts(calls, '/sales/quote/').at(-1)?.body).toMatchObject({ discount: { kind: 'percent', value: 2000 } })
  })
})

describe('checkout', () => {
  it('confirms the total, records cash with an idempotency key, and shows the saved sale', async () => {
    wideScreen()
    const calls = mockApi()
    await openBilling()
    await addShirtM()
    const dialog = await openPayment()
    expect(within(dialog).getAllByText('₹1,258.95').length).toBeGreaterThan(0)

    await userEvent.type(within(dialog).getByLabelText('Cash received'), '1000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Complete sale · ₹1,258.95' }))
    expect(within(dialog).getByText('That’s ₹258.95 short of the total.')).toBeInTheDocument()
    expect(posts(calls, '/sales/')).toHaveLength(0)

    await userEvent.clear(within(dialog).getByLabelText('Cash received'))
    await userEvent.type(within(dialog).getByLabelText('Cash received'), '1300')
    expect(within(dialog).getByText('₹41.05')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Complete sale · ₹1,258.95' }))

    const done = await screen.findByRole('dialog', { name: 'Sale completed' })
    expect(within(done).getByText('LD-000042')).toBeInTheDocument()
    expect(within(done).getByText('₹41.05')).toBeInTheDocument()
    const [sale] = posts(calls, '/sales/')
    expect(sale?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(sale?.body).toEqual({
      lines: [{ variant: 31, quantity: 1 }],
      discount: null,
      expected_total_paise: 125895,
      payment: { method: 'cash', tendered_paise: 130000 },
    })
    await userEvent.click(within(done).getByRole('button', { name: 'New sale' }))
    expect(await screen.findByText('The bill is empty')).toBeInTheDocument()
  })

  it('records UPI with its reference and says it is not gateway-verified', async () => {
    wideScreen()
    const calls = mockApi()
    await openBilling()
    await addShirtM()
    const dialog = await openPayment()
    await userEvent.click(within(dialog).getByRole('radio', { name: /UPI/ }))
    expect(within(dialog).getByText(/not gateway-verified/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /^Complete sale/ }))
    expect(within(dialog).getByText('Enter the UPI transaction ID shown on the confirmation.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('UPI transaction ID'), '4318 2290')
    await userEvent.click(within(dialog).getByRole('button', { name: /^Complete sale/ }))
    await screen.findByRole('dialog', { name: 'Sale completed' })
    expect(posts(calls, '/sales/')[0]?.body).toMatchObject({ payment: { method: 'upi', reference: '4318 2290' } })
  })

  it('retries a lost response with the same key, so the sale is recorded once', async () => {
    wideScreen()
    let attempts = 0
    const calls = mockApi({
      handler: (url, method) => {
        if (!(url.pathname.endsWith('/sales/') && method === 'POST')) return undefined
        attempts += 1
        return attempts === 1 ? jsonResponse(502, { detail: 'The server ran into a problem.', code: 'error', fields: {} }) : undefined
      },
    })
    await openBilling()
    await addShirtM()
    const dialog = await openPayment()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Exact amount' }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^Complete sale/ }))
    expect(await within(dialog).findByText(/retrying is safe/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /^Complete sale/ }))
    await screen.findByRole('dialog', { name: 'Sale completed' })
    const [first, second] = posts(calls, '/sales/')
    expect(first?.headers['Idempotency-Key']).toBe(second?.headers['Idempotency-Key'])
  })

  it('stops when the server’s total changed and refreshes the figures', async () => {
    wideScreen()
    const calls = mockApi({
      handler: (url, method) =>
        url.pathname.endsWith('/sales/') && method === 'POST'
          ? jsonResponse(409, { detail: 'The total is now ₹1,363.95, not the ₹1,258.95 shown.', code: 'total_changed', fields: {} })
          : undefined,
    })
    await openBilling()
    await addShirtM()
    const dialog = await openPayment()
    const quotesBefore = posts(calls, '/sales/quote/').length
    await userEvent.click(within(dialog).getByRole('button', { name: 'Exact amount' }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^Complete sale/ }))
    expect(await within(dialog).findByText('The total changed')).toBeInTheDocument()
    expect(within(dialog).getByText(/Nothing was charged or saved/)).toBeInTheDocument()
    await waitFor(() => expect(posts(calls, '/sales/quote/').length).toBeGreaterThan(quotesBefore))
  })

  it('asks for an approver and PIN when the discount is above the limit, and shows a wrong PIN', async () => {
    wideScreen()
    const calls = mockApi({
      handler: (url, method) => {
        if (url.pathname.endsWith('/sales/quote/')) return jsonResponse(200, { ...QUOTE, discount_paise: 23980, needs_approval: true })
        if (url.pathname.endsWith('/sales/') && method === 'POST')
          return jsonResponse(400, { detail: 'Invalid', code: 'invalid', fields: { approval_pin: ['That PIN isn’t right.'] } })
        return undefined
      },
    })
    await openBilling()
    await addShirtM()
    const dialog = await openPayment()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Exact amount' }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^Complete sale/ }))
    expect(within(dialog).getByText('Choose who is approving the discount.')).toBeInTheDocument()
    expect(posts(calls, '/sales/')).toHaveLength(0)

    within(dialog).getByRole('combobox', { name: 'Approved by' }).focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(await screen.findByRole('option', { name: 'Rahul Krishnan' }))
    await userEvent.type(within(dialog).getByLabelText('Approver’s PIN'), '1111')
    await userEvent.click(within(dialog).getByRole('button', { name: /^Complete sale/ }))
    expect(await within(dialog).findByText('That PIN isn’t right.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Approver’s PIN')).toHaveValue('')
    expect(posts(calls, '/sales/')[0]?.body).toMatchObject({ approver_id: 3, approval_pin: '1111' })
  })
})

describe('receipt', () => {
  it('prints the saved sale exactly as stored', async () => {
    mockApi()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderRoutes(routes, '/billing/receipt/LD-000042')
    const receipt = await screen.findByLabelText('Receipt LD-000042')
    for (const text of ['Loom & Linen', 'GSTIN 32ABCDE1234F1Z5', 'LD-000042', 'Anjali Prakash', 'Classic Cotton Shirt', '1 × ₹1,199.00', '₹29.97', '₹29.98', '₹1,258.95', '₹1,300.00', '₹41.05']) {
      expect(within(receipt).getAllByText(text, { exact: false }).length).toBeGreaterThan(0)
    }
    expect(within(receipt).getByText('CGST 2.5% on ₹1,199.00')).toBeInTheDocument()
    expect(within(receipt).getByText(/HSN 6205/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Print receipt' }))
    expect(print).toHaveBeenCalled()
  })

  it('shows a not-found state for an unknown invoice', async () => {
    mockApi({
      handler: (url) => (url.pathname.endsWith('/sales/LD-999999/') ? jsonResponse(404, { detail: 'Not found.', code: 'not_found', fields: {} }) : undefined),
    })
    renderRoutes(routes, '/billing/receipt/LD-999999')
    expect(await screen.findByText('No receipt for LD-999999')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Print receipt' })).not.toBeInTheDocument()
  })
})

describe('phone layout', () => {
  it('keeps the total and the bill in reach from a bottom bar', async () => {
    mockApi()
    await openBilling()
    await addShirtOnPhone()
    expect(await screen.findByText('₹1,258.95')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View bill' }))
    const sheet = await screen.findByRole('dialog', { name: 'Current bill' })
    expect(within(sheet).getByRole('button', { name: 'Take payment · ₹1,258.95' })).toBeEnabled()
  })
})

async function addShirtOnPhone() {
  await userEvent.click(screen.getByRole('button', { name: /^Classic Cotton Shirt/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Choose an option' })
  await userEvent.click(within(dialog).getByRole('radio', { name: /M · Blue/ }))
  await userEvent.click(within(dialog).getByRole('button', { name: /^Add/ }))
  await screen.findByText('1 item on the bill')
}
