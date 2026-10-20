import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

const ME_ADMIN = { ...ME_CASHIER, id: 1, full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }
const TODAY = '2026-10-20'
const STORE = { name: 'Loom & Linen', code: 'LL', state: 'Kerala', today: TODAY }

const SALES_SUMMARY = {
  sale_count: 2, total_paise: 731685, subtotal_paise: 659700, discount_paise: 0, tax_paise: 71985,
  by_method: [], by_day: [], by_cashier: [],
}
const STOCK_SUMMARY = { tracked_variants: 4, low_stock: 3, out_of_stock: 1, units_on_hand: 15 }
const VARIANT = {
  id: 31, sku: 'SH-CT-001-M', size: 'M', colour: 'Blue', barcode: '8901', on_hand: 4, reorder_level: 2, stock_state: 'in_stock',
  is_active: true, sellable: true, product: { id: 3, name: 'Classic Cotton Shirt', sku: 'SH-CT-001', status: 'active', category: 'Shirts', image_url: null },
  product_on_hand: 9, last_movement_at: null, last_movement_type: null,
}
const MOVEMENT = {
  id: 2, created_at: '2026-10-20T10:30:00Z', type: 'sale', type_label: 'Sale', quantity_delta: -1, balance_after: 4, reason: '',
  reference: 'LD-000042', actor_name: 'Anjali Prakash',
  variant: { id: 31, sku: 'SH-CT-001-M', size: 'M', colour: 'Blue', product_id: 3, product_name: 'Classic Cotton Shirt' },
}
const SALE_ROW = {
  invoice_no: 'LD-000042', status: 'completed', created_at: '2026-10-20T10:30:00Z', cashier: 4, cashier_name: 'Anjali Prakash',
  item_count: 3, discount_paise: 0, total_paise: 605790, payment_method: 'upi', gateway_verified: false,
}
const SALE = {
  invoice_no: 'LD-000042', status: 'completed', created_at: '2026-10-20T10:30:00Z', cashier_name: 'Anjali Prakash',
  store: { name: 'Loom & Linen', code: 'LL-KKD-01', address: 'Beach Road, Kozhikode', state: 'Kerala', gstin: '32ABCDE1234F1Z5' },
  prices_include_tax: false, subtotal_paise: 239800, discount_paise: 0, taxable_paise: 239800, tax_paise: 11990, total_paise: 251790,
  discount_approved_by_name: null,
  lines: [
    {
      id: 1, variant: 31, product_name: 'Classic Cotton Shirt', product_sku: 'SH-CT-001', variant_sku: 'SH-CT-001-M', size: 'M',
      colour: 'Blue', hsn_code: '6205', quantity: 2, unit_price_paise: 119900, subtotal_paise: 239800, discount_paise: 0,
      taxable_paise: 239800, tax_rate_bp: 500, tax_paise: 11990, total_paise: 251790,
    },
  ],
  tax_breakdown: [{ rate_bp: 500, taxable_paise: 239800, tax_paise: 11990, cgst_paise: 5995, sgst_paise: 5995 }],
  payment: { method: 'upi', amount_paise: 251790, tendered_paise: null, change_paise: 0, reference: 'UTR1', gateway_verified: false, recorded_at: '2026-10-20T10:30:00Z' },
}
const PURCHASE_ROW = {
  id: 2, number: 'PUR-000002', supplier: 1, supplier_name: 'Malabar Textile House', status: 'ordered', supplier_invoice_no: 'MTH/119',
  purchase_date: '2026-10-19', item_count: 10, total_paise: 651000, received_at: null,
}
const PURCHASE = {
  ...PURCHASE_ROW, supplier_status: 'active', notes: '', subtotal_paise: 620000, tax_paise: 31000, created_at: '2026-10-19T05:00:00Z',
  created_by_name: 'Kiran Ramesh', received_by_name: null, cancelled_at: null, cancelled_by_name: null, cancel_reason: '',
  lines: [
    {
      id: 7, variant: 31, product_id: 3, product_name: 'Classic Cotton Shirt', variant_sku: 'SH-CT-001-M', size: 'M', colour: 'Blue',
      quantity: 10, unit_cost_paise: 62000, tax_rate_bp: 500, subtotal_paise: 620000, tax_paise: 31000, total_paise: 651000, current_on_hand: 4,
    },
  ],
}
const SUPPLIER = {
  id: 1, name: 'Malabar Textile House', category: 'Apparel & fabric', contact_name: 'Asha Varghese', phone: '+91 98765 12001',
  email: 'orders@malabartextile.demo', status: 'active', received_paise: 105000, paid_paise: 40000, balance_paise: 65000,
  gstin: '32ABCDE1234F1Z5', address: 'Market Road', state: 'Kerala', notes: '', created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-10-01T09:00:00Z', awaiting_paise: 651000,
}
const PAYMENT = {
  id: 5, method: 'upi', amount_paise: 40000, paid_on: '2026-10-11', reference: 'UPI-9', notes: '', gateway_verified: false,
  recorded_by_name: 'Kiran Ramesh', created_at: '2026-10-11T05:00:00Z',
}

type Call = { method: string; url: URL; body?: unknown }
type Handler = (url: URL, method: string, body: unknown) => Response | undefined

const page = <T,>(results: T[], count = results.length) => ({ count, next: null, previous: null, results })
const error = (status: number, code: string, detail: string) => jsonResponse(status, { detail, code, fields: {} })

function mockApi({ me = ME_ADMIN as unknown, handler = (() => undefined) as Handler } = {}) {
  document.cookie = 'csrftoken=t'
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body })
    const custom = handler(url, method, body)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (method !== 'GET') throw new Error(`Unexpected ${method} ${path}`)
    if (path.endsWith('/store/')) return jsonResponse(200, STORE)
    if (path.endsWith('/sales/summary/')) return jsonResponse(200, SALES_SUMMARY)
    if (path.endsWith('/sales/')) return jsonResponse(200, page([SALE_ROW]))
    if (path.endsWith('/sales/LD-000042/')) return jsonResponse(200, SALE)
    if (path.endsWith('/inventory/summary/')) return jsonResponse(200, STOCK_SUMMARY)
    if (path.endsWith('/inventory/variants/')) return jsonResponse(200, page([VARIANT]))
    if (path.endsWith('/inventory/variants/31/')) return jsonResponse(200, VARIANT)
    if (path.endsWith('/inventory/movements/')) return jsonResponse(200, page([MOVEMENT]))
    if (path.endsWith('/suppliers/purchases/')) return jsonResponse(200, page([PURCHASE_ROW]))
    if (path.endsWith('/suppliers/purchases/PUR-000002/')) return jsonResponse(200, PURCHASE)
    if (path.endsWith('/suppliers/')) return jsonResponse(200, page([SUPPLIER]))
    if (path.endsWith('/suppliers/1/')) return jsonResponse(200, SUPPLIER)
    if (path.endsWith('/suppliers/1/purchases/')) return jsonResponse(200, page([PURCHASE_ROW]))
    if (path.endsWith('/suppliers/1/payments/')) return jsonResponse(200, page([PAYMENT]))
    if (path.endsWith('/suppliers/1/statement/')) return jsonResponse(200, { balance_paise: 0, entries: [] })
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return calls
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET')
const bottomNav = () => screen.findByRole('navigation', { name: 'Mobile admin' })

configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('mobile admin access', () => {
  it.each(['/admin/mobile', '/admin/mobile/inventory/31/adjust', '/admin/mobile/purchases/PUR-000002', '/admin/mobile/bills/LD-000042/receipt'])(
    'sends a cashier who opens %s to 403 without asking the admin APIs',
    async (path) => {
      const calls = mockApi({ me: ME_CASHIER })
      const { router } = renderRoutes(routes, path)
      await waitFor(() => expect(router.state.location.pathname).toBe('/403'))
      expect(calls.map((c) => c.url.pathname)).toEqual(['/api/v1/auth/session/'])
    },
  )

  it('sends a signed-out visitor to login and remembers the mobile path', async () => {
    mockApi({ me: null })
    const { router } = renderRoutes(routes, '/admin/mobile/inventory')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/admin/mobile/inventory')}`)
  })
})

describe('mobile overview', () => {
  it('shows today’s figures from the API for the store’s date, and marks the Overview tab', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/mobile')
    const figures = await screen.findByRole('region', { name: 'Today at a glance' })
    expect(await within(figures).findByText('₹7,316.85')).toBeInTheDocument()
    expect(within(figures).getByText('2')).toBeInTheDocument()
    expect(within(figures).getByText('3')).toBeInTheDocument()
    const summary = calls.find((c) => c.url.pathname.endsWith('/sales/summary/'))!
    expect(summary.url.searchParams.get('date_from')).toBe(TODAY)
    expect(summary.url.searchParams.get('date_to')).toBe(TODAY)
    expect(within(await bottomNav()).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Overview · Mobile admin · LoomDesk')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('keeps the page up when one figure fails, and retries it', async () => {
    let fail = true
    mockApi({ handler: (url) => (url.pathname.endsWith('/inventory/summary/') && fail ? error(500, 'error', 'Server error') : undefined) })
    renderRoutes(routes, '/admin/mobile')
    const alert = (await screen.findByText('Some figures couldn’t load.', { exact: false })).closest('p')!
    expect(screen.getByRole('heading', { name: /recent bills/i })).toBeInTheDocument()
    fail = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText('Some figures couldn’t load.', { exact: false })).not.toBeInTheDocument())
  })
})

describe('mobile navigation', () => {
  it('marks More for supplier pages and shows a not-found page inside the shell', async () => {
    mockApi()
    const { router } = renderRoutes(routes, '/admin/mobile/suppliers/1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Malabar Textile House' })).toBeInTheDocument()
    expect(within(await bottomNav()).getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page')
    await router.navigate('/admin/mobile/nowhere')
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(await bottomNav()).toBeInTheDocument()
  })
})

describe('mobile inventory', () => {
  it('keeps search and the stock filter in the URL and sends them to the API', async () => {
    const calls = mockApi()
    const { router } = renderRoutes(routes, '/admin/mobile/inventory')
    expect(await screen.findByRole('link', { name: /Classic Cotton Shirt/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Low' }))
    await waitFor(() => expect(router.state.location.search).toContain('state=low_stock'))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stock' }), 'shirt')
    await waitFor(() => expect(router.state.location.search).toContain('q=shirt'))
    await waitFor(() =>
      expect(calls.some((c) => c.url.pathname.endsWith('/inventory/variants/') && c.url.searchParams.get('q') === 'shirt' && c.url.searchParams.get('state') === 'low_stock')).toBe(true),
    )
  })

  it('shows an error with a retry when the list fails', async () => {
    let fail = true
    mockApi({ handler: (url) => (url.pathname.endsWith('/inventory/variants/') && fail ? error(500, 'error', 'The server had a problem.') : undefined) })
    renderRoutes(routes, '/admin/mobile/inventory')
    expect(await screen.findByText('The server had a problem.')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('link', { name: /Classic Cotton Shirt/ })).toBeInTheDocument()
  })

  it('reviews an adjustment before sending it, then records it against the reviewed figure', async () => {
    const calls = mockApi({
      handler: (url, method) =>
        url.pathname.endsWith('/inventory/adjustments/') && method === 'POST'
          ? jsonResponse(201, { movement: MOVEMENT, variant: { ...VARIANT, on_hand: 2 } })
          : undefined,
    })
    const { router } = renderRoutes(routes, '/admin/mobile/inventory/31/adjust')
    await userEvent.click(await screen.findByRole('radio', { name: 'Remove stock' }))
    await userEvent.type(screen.getByRole('textbox', { name: /units to remove/i }), '2')
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), 'Water damage')
    await userEvent.click(screen.getByRole('button', { name: 'Review adjustment' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Review adjustment' })).toBeInTheDocument()
    const change = screen.getByRole('region', { name: 'The change' })
    expect(within(change).getByText('Water damage')).toBeInTheDocument()
    expect(within(change).getByText('(−2)')).toBeInTheDocument()
    expect(writes(calls)).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Confirm adjustment' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/mobile/inventory/31'))
    expect(writes(calls)).toHaveLength(1)
    expect(writes(calls)[0]!.body).toEqual({ variant: 31, kind: 'remove', quantity: 2, reason: 'Water damage', expected_on_hand: 4 })
  })

  it('validates on the phone before the review and sends nothing', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/mobile/inventory/31/adjust')
    await userEvent.click(await screen.findByRole('radio', { name: 'Remove stock' }))
    await userEvent.type(screen.getByRole('textbox', { name: /units to remove/i }), '9')
    await userEvent.click(screen.getByRole('button', { name: 'Review adjustment' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Adjust stock' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /units to remove/i })).toHaveAccessibleDescription(/./)
    expect(writes(calls)).toHaveLength(0)
  })

  it('returns to the form when stock changed since the review, without leaving the page', async () => {
    mockApi({
      handler: (url, method) =>
        url.pathname.endsWith('/inventory/adjustments/') && method === 'POST'
          ? error(409, 'stock_changed', 'Stock changed to 3 since you reviewed it.')
          : undefined,
    })
    const { router } = renderRoutes(routes, '/admin/mobile/inventory/31/adjust')
    await userEvent.click(await screen.findByRole('radio', { name: 'Add stock' }))
    await userEvent.type(screen.getByRole('textbox', { name: /units to add/i }), '1')
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), 'Found in store room')
    await userEvent.click(screen.getByRole('button', { name: 'Review adjustment' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm adjustment' }))
    expect(await screen.findByText(/Stock changed to 3 since you reviewed it\. Nothing was changed\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Adjust stock' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/mobile/inventory/31/adjust')
  })

  it('treats a non-numeric variant id as not found without a request', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/mobile/inventory/abc')
    expect(await screen.findByRole('heading', { level: 1, name: 'Item not found' })).toBeInTheDocument()
    expect(calls.some((c) => c.url.pathname.includes('/inventory/variants/'))).toBe(false)
  })
})

describe('mobile bills', () => {
  it('reprints the saved receipt without writing anything', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const calls = mockApi()
    renderRoutes(routes, '/admin/mobile/bills/LD-000042')
    expect(await screen.findByRole('heading', { level: 1, name: 'Invoice LD-000042' })).toBeInTheDocument()
    expect(within(await bottomNav()).getByRole('link', { name: 'Bills' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(screen.getByRole('link', { name: 'Reprint receipt' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Print receipt' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('LD-000042').length).toBeGreaterThan(0)
    expect(writes(calls)).toHaveLength(0)
  })

  it('shows a missing bill as not found', async () => {
    mockApi({ handler: (url) => (url.pathname.endsWith('/sales/LD-000099/') ? error(404, 'error', 'Not found.') : undefined) })
    renderRoutes(routes, '/admin/mobile/bills/LD-000099')
    expect(await screen.findByRole('link', { name: /back to/i })).toHaveAttribute('href', '/admin/mobile/bills')
  })
})

describe('mobile purchasing', () => {
  it('lists purchases awaiting goods by default', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/mobile/purchases')
    expect(await screen.findByRole('link', { name: /Malabar Textile House/ })).toHaveAttribute('href', '/admin/mobile/purchases/PUR-000002')
    expect(calls.find((c) => c.url.pathname.endsWith('/suppliers/purchases/'))!.url.searchParams.get('status')).toBe('ordered')
  })

  it('shows the stock effect before receiving, and receives once', async () => {
    const calls = mockApi({
      handler: (url, method) =>
        url.pathname.endsWith('/receive/') && method === 'POST' ? jsonResponse(200, { ...PURCHASE, status: 'received' }) : undefined,
    })
    renderRoutes(routes, '/admin/mobile/purchases/PUR-000002')
    await userEvent.click(await screen.findByRole('button', { name: 'Receive goods' }))
    const dialog = await screen.findByRole('dialog', { name: 'Receive PUR-000002?' })
    expect(dialog).toHaveTextContent('Adds 10 units to stock and ₹6,510.00')
    const effect = within(dialog).getByRole('list', { name: 'Stock after receiving' })
    expect(effect).toHaveTextContent('4')
    expect(effect).toHaveTextContent('14')
    expect(writes(calls)).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Receive goods' }))
    expect(await screen.findByText('PUR-000002 received')).toBeInTheDocument()
    expect(writes(calls).map((c) => c.url.pathname)).toEqual(['/api/v1/suppliers/purchases/PUR-000002/receive/'])
  })

  it('reports a purchase another device already received, without adding stock again', async () => {
    mockApi({
      handler: (url, method) =>
        url.pathname.endsWith('/receive/') && method === 'POST' ? error(409, 'already_received', 'This purchase was already received.') : undefined,
    })
    renderRoutes(routes, '/admin/mobile/purchases/PUR-000002')
    await userEvent.click(await screen.findByRole('button', { name: 'Receive goods' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Receive goods' }))
    expect(await screen.findByText('Stock was not added again.')).toBeInTheDocument()
  })

  it('can’t receive without the supplier’s invoice number', async () => {
    mockApi({
      handler: (url) => (url.pathname.endsWith('/PUR-000002/') ? jsonResponse(200, { ...PURCHASE, supplier_invoice_no: '' }) : undefined),
    })
    renderRoutes(routes, '/admin/mobile/purchases/PUR-000002')
    expect(await screen.findByRole('button', { name: 'Receive goods' })).toBeDisabled()
    expect(screen.getByText(/invoice number is needed before receiving/)).toBeInTheDocument()
  })
})

describe('mobile suppliers', () => {
  it('labels recorded payments as not verified', async () => {
    mockApi()
    renderRoutes(routes, '/admin/mobile/suppliers/1')
    const payments = await screen.findByRole('list', { name: 'Recorded payments' })
    expect(payments).toHaveTextContent('Not verified')
    expect(screen.getByText('Not bank-verified')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+919876512001')
  })
})
