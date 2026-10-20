import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

import { toLineInput } from './supplierForm'
import { isPurchaseNumber, parseSupplierId, readParams } from './supplierParams'

const ME_ADMIN = { ...ME_CASHIER, id: 1, full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }

const MALABAR = {
  id: 1, name: 'Malabar Textile House', category: 'Apparel & fabric', contact_name: 'Asha Varghese', phone: '+91 98765 12001',
  email: 'orders@malabartextile.demo', status: 'active', received_paise: 1050_00, paid_paise: 400_00, balance_paise: 650_00,
}
const COTTON = {
  ...MALABAR, id: 2, name: 'Cotton Collective', category: 'Cotton basics', contact_name: '', phone: '', email: '',
  received_paise: 0, paid_paise: 100_00, balance_paise: -100_00,
}
const DETAIL = {
  ...MALABAR, gstin: '32ABCDE1234F1Z5', address: 'Market Road, Kozhikode', state: 'Kerala', notes: 'Delivers on Mondays',
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z', awaiting_paise: 9999_00,
}
const PURCHASE_ROWS = [
  { id: 2, number: 'PUR-000002', supplier: 1, supplier_name: MALABAR.name, status: 'ordered', supplier_invoice_no: 'MTH/119', purchase_date: '2026-10-19', item_count: 1, total_paise: 9999_00, received_at: null },
  { id: 1, number: 'PUR-000001', supplier: 1, supplier_name: MALABAR.name, status: 'received', supplier_invoice_no: 'MTH/118', purchase_date: '2026-10-10', item_count: 10, total_paise: 1050_00, received_at: '2026-10-11T05:00:00Z' },
]
const STATEMENT = {
  balance_paise: 650_00,
  entries: [
    { date: '2026-10-10', kind: 'purchase', reference: 'PUR-000001', detail: 'Invoice MTH/118', debit_paise: 1050_00, credit_paise: 0, balance_paise: 1050_00 },
    { date: '2026-10-11', kind: 'payment', reference: 'UPI-9', detail: 'UPI payment, recorded by staff', debit_paise: 0, credit_paise: 400_00, balance_paise: 650_00 },
  ],
}
const LINE = {
  id: 7, variant: 31, product_id: 3, product_name: 'Classic Cotton Shirt', variant_sku: 'SH-CT-001-M', size: 'M', colour: 'Blue',
  quantity: 10, unit_cost_paise: 620_00, tax_rate_bp: 500, subtotal_paise: 6200_00, tax_paise: 310_00, total_paise: 6510_00,
}
const ORDERED = {
  id: 2, number: 'PUR-000002', supplier: 1, supplier_name: MALABAR.name, supplier_status: 'active', status: 'ordered',
  supplier_invoice_no: 'MTH/119', purchase_date: '2026-10-19', notes: '', subtotal_paise: 6200_00, tax_paise: 310_00,
  total_paise: 6510_00, lines: [LINE], created_at: '2026-10-19T05:00:00Z', created_by_name: 'Kiran Ramesh', received_at: null,
  received_by_name: null, cancelled_at: null, cancelled_by_name: null, cancel_reason: '',
}
const VARIANT = {
  id: 31, sku: 'SH-CT-001-M', size: 'M', colour: 'Blue', barcode: '', on_hand: 4, reorder_level: 2, stock_state: 'in_stock',
  is_active: true, sellable: true, product: { id: 3, name: 'Classic Cotton Shirt', sku: 'SH-CT-001', status: 'active', category: 'Shirts', image_url: null },
  product_on_hand: 4, last_movement_at: null, last_movement_type: null,
}

type Call = { method: string; url: URL; body?: unknown; headers: Record<string, string> }
type Handler = (url: URL, method: string, body: unknown) => Response | undefined

const page = <T,>(results: T[], count = results.length) => ({ count, next: null, previous: null, results })
const notFound = () => jsonResponse(404, { detail: 'Not found.', code: 'error', fields: {} })

function mockApi({ me = ME_ADMIN as unknown, handler = (() => undefined) as Handler } = {}) {
  document.cookie = 'csrftoken=t'
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body, headers: (init?.headers ?? {}) as Record<string, string> })
    const custom = handler(url, method, body)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (path.endsWith('/store/')) return jsonResponse(200, { name: 'Loom & Linen', code: 'LL', state: 'Kerala' })
    if (path.endsWith('/suppliers/categories/')) return jsonResponse(200, ['Apparel & fabric', 'Cotton basics'])
    if (path.endsWith('/suppliers/') && method === 'GET') return jsonResponse(200, page([COTTON, MALABAR]))
    if (path.endsWith('/suppliers/1/') && method === 'GET') return jsonResponse(200, DETAIL)
    if (path.endsWith('/suppliers/1/purchases/') && method === 'GET') return jsonResponse(200, page(PURCHASE_ROWS))
    if (path.endsWith('/suppliers/1/statement/')) return jsonResponse(200, STATEMENT)
    if (path.endsWith('/suppliers/purchases/PUR-000002/') && method === 'GET') return jsonResponse(200, ORDERED)
    if (/\/suppliers\/purchases\/PUR-\d+\/$/.test(path)) return notFound()
    if (/\/suppliers\/\d+\/$/.test(path)) return notFound()
    if (path.endsWith('/inventory/variants/')) return jsonResponse(200, page([VARIANT]))
    if (path.endsWith('/suppliers/purchases/quote/')) {
      const lines = (body as { lines: { variant: number; quantity: number; unit_cost_paise: number }[] }).lines
      const priced = lines.map((l) => {
        const subtotal = l.quantity * l.unit_cost_paise
        return { ...l, tax_rate_bp: 500, subtotal_paise: subtotal, tax_paise: 999, total_paise: subtotal + 999 }
      })
      const sum = (k: 'subtotal_paise' | 'tax_paise' | 'total_paise') => priced.reduce((n, l) => n + l[k], 0)
      return jsonResponse(200, { lines: priced, subtotal_paise: sum('subtotal_paise'), tax_paise: sum('tax_paise'), total_paise: sum('total_paise') })
    }
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return calls
}

function wideScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({ matches: !query.includes(' and '), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

const requests = (calls: Call[], suffix: string, method = 'GET') =>
  calls.filter((c) => c.method === method && c.url.pathname.endsWith(suffix))

async function chooseOption(label: string, option: string, scope: HTMLElement = document.body) {
  const trigger = within(scope).getByRole('combobox', { name: label })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('supplier access', () => {
  it('keeps cashiers out without asking the supplier API', async () => {
    const calls = mockApi({ me: ME_CASHIER })
    const { router } = renderRoutes(routes, '/admin/suppliers/1')
    await screen.findByRole('heading', { name: 'You don’t have access to this page' })
    expect(router.state.location.pathname).toBe('/403')
    expect(calls.some((c) => c.url.pathname.includes('/suppliers/'))).toBe(false)
  })
})

describe('supplier list', () => {
  it('shows contacts, recorded balances and status, labelled as recorded', async () => {
    wideScreen()
    mockApi()
    renderRoutes(routes, '/admin/suppliers')
    const table = await screen.findByRole('table', { name: 'Suppliers' })
    const malabar = (await within(table).findByRole('link', { name: MALABAR.name })).closest('tr') as HTMLElement
    expect(within(malabar).getByText('₹650.00')).toBeInTheDocument()
    expect(within(malabar).getByText('Asha Varghese')).toBeInTheDocument()
    expect(within(malabar).getByText('Active')).toBeInTheDocument()
    const cotton = within(table).getByRole('link', { name: 'Cotton Collective' }).closest('tr') as HTMLElement
    expect(within(cotton).getByText('paid in advance')).toBeInTheDocument()
    expect(within(cotton).getByText('Not recorded')).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Recorded balance' })).toBeInTheDocument()
    expect(screen.getByText(/aren’t verified against a bank statement/)).toBeInTheDocument()
  })

  it('filters and searches on the server, mirrored in the URL', async () => {
    wideScreen()
    const calls = mockApi()
    const { router } = renderRoutes(routes, '/admin/suppliers')
    await screen.findByRole('table', { name: 'Suppliers' })
    await chooseOption('Status', 'Inactive')
    await waitFor(() => expect(requests(calls, '/suppliers/').at(-1)?.url.searchParams.get('status')).toBe('inactive'))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search suppliers' }), 'asha')
    await waitFor(() => expect(requests(calls, '/suppliers/').at(-1)?.url.searchParams.get('q')).toBe('asha'))
    expect(router.state.location.search).toBe('?q=asha&status=inactive')
  })

  it('shows cards on phones and an empty state with a next step', async () => {
    mockApi({ handler: (url) => (url.pathname.endsWith('/suppliers/') ? jsonResponse(200, page([])) : undefined) })
    renderRoutes(routes, '/admin/suppliers')
    expect(await screen.findByText('No suppliers yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Add supplier/ }).length).toBeGreaterThan(0)
  })
})

describe('supplier form', () => {
  it('validates, uppercases the GSTIN and opens the new profile', async () => {
    const calls = mockApi({
      handler: (url, method) => (method === 'POST' && url.pathname.endsWith('/suppliers/') ? jsonResponse(201, { ...DETAIL, id: 1 }) : undefined),
    })
    const { router } = renderRoutes(routes, '/admin/suppliers/new')
    await screen.findByRole('heading', { level: 1, name: 'Add supplier' })
    await userEvent.type(screen.getByRole('textbox', { name: /^GSTIN/ }), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Add supplier' }))
    expect(await screen.findByText('Enter the supplier’s name.')).toBeInTheDocument()
    expect(screen.getByText(/A GSTIN has 15 characters/)).toBeInTheDocument()
    expect(requests(calls, '/suppliers/', 'POST')).toHaveLength(0)
    expect(screen.queryByRole('textbox', { name: /balance/i })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: 'Supplier name' }), 'Malabar Textile House')
    await userEvent.type(screen.getByRole('textbox', { name: 'Category' }), 'Apparel & fabric')
    const gstin = screen.getByRole('textbox', { name: /^GSTIN/ })
    await userEvent.clear(gstin)
    await userEvent.type(gstin, '32abcde1234f1z5')
    await userEvent.click(screen.getByRole('button', { name: 'Add supplier' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/suppliers/1'))
    expect(requests(calls, '/suppliers/', 'POST')[0]?.body).toMatchObject({ name: 'Malabar Textile House', gstin: '32ABCDE1234F1Z5' })
  })

  it('shows server errors on the field', async () => {
    mockApi({
      handler: (url, method) =>
        method === 'POST' && url.pathname.endsWith('/suppliers/')
          ? jsonResponse(400, { detail: 'Invalid.', code: 'invalid', fields: { name: ['A supplier with this name already exists.'] } })
          : undefined,
    })
    renderRoutes(routes, '/admin/suppliers/new')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Supplier name' }), 'Malabar Textile House')
    await userEvent.type(screen.getByRole('textbox', { name: 'Category' }), 'Apparel')
    await userEvent.click(screen.getByRole('button', { name: 'Add supplier' }))
    expect(await screen.findByText('A supplier with this name already exists.')).toBeInTheDocument()
    expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument()
  })
})

describe('supplier profile', () => {
  it('shows recorded figures, contact details, purchases and the statement', async () => {
    wideScreen()
    mockApi()
    renderRoutes(routes, '/admin/suppliers/1')
    await screen.findByRole('heading', { level: 1, name: MALABAR.name })
    const figures = screen.getByRole('region', { name: 'Recorded figures' })
    expect(within(figures).getByText('₹650.00 due')).toBeInTheDocument()
    expect(within(figures).getByText('Entered by staff, not bank-verified')).toBeInTheDocument()
    expect(within(figures).getByText('Recorded, not owed until received')).toBeInTheDocument()
    expect(screen.getByText('32ABCDE1234F1Z5')).toBeInTheDocument()

    const purchases = await screen.findByRole('table', { name: `Purchases from ${MALABAR.name}` })
    expect(within(purchases).getByRole('link', { name: 'PUR-000002' })).toHaveAttribute('href', '/admin/suppliers/purchases/PUR-000002')
    expect(within(purchases).getByText('Awaiting goods')).toBeInTheDocument()

    const statement = await screen.findByRole('table', { name: `Statement for ${MALABAR.name}` })
    const payment = within(statement).getByText('UPI payment, recorded by staff').closest('tr') as HTMLElement
    expect(within(payment).getByText('₹400.00')).toBeInTheDocument()
    expect(within(payment).getByText('₹650.00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Record purchase' })).toHaveAttribute('href', '/admin/suppliers/1/purchases/new')
  })

  it('says when the supplier does not exist', async () => {
    mockApi()
    renderRoutes(routes, '/admin/suppliers/99')
    expect(await screen.findByText('This supplier doesn’t exist')).toBeInTheDocument()
  })

  it('records a payment once, with one idempotency key across retries', async () => {
    let attempts = 0
    const calls = mockApi({
      handler: (url, method) => {
        if (method !== 'POST' || !url.pathname.endsWith('/suppliers/1/payments/')) return undefined
        attempts += 1
        if (attempts === 1) throw new TypeError('Failed to fetch')
        return jsonResponse(201, {
          id: 5, paid_on: '2026-10-20', amount_paise: 5000_00, method: 'upi', reference: 'UTR1', notes: '', recorded_by_name: 'Kiran Ramesh',
          created_at: '2026-10-20T05:00:00Z', gateway_verified: false,
        })
      },
    })
    renderRoutes(routes, '/admin/suppliers/1')
    await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' })
    expect(within(dialog).getByText(/doesn’t send money or check it with a bank/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(within(dialog).getByText(/Enter the amount paid/)).toBeInTheDocument()
    expect(within(dialog).getByText('Choose how it was paid.')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Amount paid' }), '5000')
    await chooseOption('Method', 'UPI', dialog)
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Reference/ }), 'UTR1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    expect(await within(dialog).findByText(/won’t be recorded twice/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const posts = requests(calls, '/suppliers/1/payments/', 'POST')
    expect(posts).toHaveLength(2)
    expect(posts[0]?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(posts[1]?.headers['Idempotency-Key']).toBe(posts[0]?.headers['Idempotency-Key'])
    expect(posts[1]?.body).toMatchObject({ amount_paise: 5000_00, method: 'upi', reference: 'UTR1' })
  })

  it('deactivates after confirmation, keeping history', async () => {
    const calls = mockApi({
      handler: (url, method) => (method === 'PATCH' && url.pathname.endsWith('/suppliers/1/') ? jsonResponse(200, { ...DETAIL, status: 'inactive' }) : undefined),
    })
    renderRoutes(routes, '/admin/suppliers/1')
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/purchases, payments and statement are kept/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(requests(calls, '/suppliers/1/', 'PATCH')[0]?.body).toEqual({ status: 'inactive' }))
  })
})

describe('recording a purchase', () => {
  it('adds an exact variant, shows the server’s totals and records with an idempotency key', async () => {
    const calls = mockApi({
      handler: (url, method) => (method === 'POST' && url.pathname.endsWith('/suppliers/1/purchases/') ? jsonResponse(201, ORDERED) : undefined),
    })
    const { router } = renderRoutes(routes, '/admin/suppliers/1/purchases/new')
    await screen.findByRole('heading', { level: 1, name: 'Record purchase' })
    expect(screen.getByText(/Stock changes only when you receive it/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Record purchase' }))
    expect(await screen.findByText('Add at least one item.')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Add an item' }), 'shirt')
    await userEvent.click(await screen.findByRole('button', { name: 'Add SH-CT-001-M' }))
    expect(screen.queryByRole('list', { name: 'Matching items' })).not.toBeInTheDocument()
    const items = screen.getByRole('list', { name: 'Purchase items' })
    await userEvent.type(within(items).getByRole('textbox', { name: 'Quantity' }), '10')
    await userEvent.type(within(items).getByRole('textbox', { name: 'Unit cost' }), '620')

    // Totals are the server's: the mock's GST of ₹9.99 proves nothing was computed in the browser.
    await waitFor(() => expect(screen.getByText('₹9.99', { selector: 'dd' })).toBeInTheDocument())
    expect(requests(calls, '/suppliers/purchases/quote/', 'POST').at(-1)?.body).toEqual({
      lines: [{ variant: 31, quantity: 10, unit_cost_paise: 620_00 }],
    })
    await userEvent.type(screen.getByRole('textbox', { name: /^Supplier invoice number/ }), 'MTH/119')
    await userEvent.click(screen.getByRole('button', { name: 'Record purchase' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/suppliers/purchases/PUR-000002'))
    const [post] = requests(calls, '/suppliers/1/purchases/', 'POST')
    expect(post?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(post?.body).toMatchObject({ supplier_invoice_no: 'MTH/119', lines: [{ variant: 31, quantity: 10, unit_cost_paise: 620_00 }] })
    // Recording asks for no stock change.
    expect(calls.some((c) => c.method === 'POST' && c.url.pathname.includes('/receive/'))).toBe(false)
  })

  it('maps server line errors onto the line', async () => {
    mockApi({
      handler: (url, method) =>
        method === 'POST' && url.pathname.endsWith('/suppliers/1/purchases/')
          ? jsonResponse(400, { detail: 'Invalid.', code: 'invalid', fields: { 'lines.0.variant': ['SH-CT-001-M is inactive, so it can’t be bought in.'] } })
          : undefined,
    })
    renderRoutes(routes, '/admin/suppliers/1/purchases/new')
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Add an item' }), 'shirt')
    await userEvent.click(await screen.findByRole('button', { name: 'Add SH-CT-001-M' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Quantity' }), '2')
    await userEvent.type(screen.getByRole('textbox', { name: 'Unit cost' }), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Record purchase' }))
    expect(await screen.findByText('SH-CT-001-M is inactive, so it can’t be bought in.')).toBeInTheDocument()
  })
})

describe('purchase detail and receiving', () => {
  it('receives the goods after confirming what will change', async () => {
    const calls = mockApi({
      handler: (url, method) =>
        method === 'POST' && url.pathname.endsWith('/receive/')
          ? jsonResponse(200, { ...ORDERED, status: 'received', received_at: '2026-10-20T06:00:00Z', received_by_name: 'Kiran Ramesh' })
          : undefined,
    })
    renderRoutes(routes, '/admin/suppliers/purchases/PUR-000002')
    await screen.findByRole('heading', { level: 1, name: 'PUR-000002' })
    expect(screen.getByText(/Stock hasn’t changed yet/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Receive goods' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/adds 10 units to stock across 1 item/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Receive goods' }))
    expect(await screen.findByText('PUR-000002 received')).toBeInTheDocument()
    expect(requests(calls, '/suppliers/purchases/PUR-000002/receive/', 'POST')).toHaveLength(1)
  })

  it('treats an already-received purchase as done, not as an error', async () => {
    mockApi({
      handler: (url, method) =>
        method === 'POST' && url.pathname.endsWith('/receive/')
          ? jsonResponse(409, { detail: 'PUR-000002 was already received; stock was not added again.', code: 'already_received', fields: {} })
          : undefined,
    })
    renderRoutes(routes, '/admin/suppliers/purchases/PUR-000002')
    await userEvent.click(await screen.findByRole('button', { name: 'Receive goods' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Receive goods' }))
    expect(await screen.findByText('PUR-000002 was already received')).toBeInTheDocument()
    expect(screen.getByText('Stock was not added again.')).toBeInTheDocument()
  })

  it('needs the supplier invoice number before receiving', async () => {
    mockApi({
      handler: (url) => (url.pathname.endsWith('/purchases/PUR-000002/') ? jsonResponse(200, { ...ORDERED, supplier_invoice_no: '' }) : undefined),
    })
    renderRoutes(routes, '/admin/suppliers/purchases/PUR-000002')
    expect(await screen.findByRole('button', { name: 'Receive goods' })).toBeDisabled()
    expect(screen.getByText(/Add the supplier’s invoice number/)).toBeInTheDocument()
  })

  it('cancels with a reason', async () => {
    const calls = mockApi({
      handler: (url, method) =>
        method === 'POST' && url.pathname.endsWith('/cancel/') ? jsonResponse(200, { ...ORDERED, status: 'cancelled', cancel_reason: 'Not coming' }) : undefined,
    })
    renderRoutes(routes, '/admin/suppliers/purchases/PUR-000002')
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel purchase' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Not coming')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel purchase' }))
    await waitFor(() => expect(requests(calls, '/cancel/', 'POST')[0]?.body).toEqual({ reason: 'Not coming' }))
  })

  it('shows a received purchase as closed, with its stock movements', async () => {
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/purchases/PUR-000002/')
          ? jsonResponse(200, { ...ORDERED, status: 'received', received_at: '2026-10-20T06:00:00Z', received_by_name: 'Kiran Ramesh' })
          : undefined,
    })
    renderRoutes(routes, '/admin/suppliers/purchases/PUR-000002')
    expect(await screen.findByRole('link', { name: /See the stock movements/ })).toHaveAttribute('href', '/admin/inventory/movements?q=PUR-000002')
    expect(screen.queryByRole('button', { name: /Receive goods|Cancel purchase/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('says when a purchase does not exist, without asking for a malformed number', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/suppliers/purchases/NOT-A-NUMBER')
    expect(await screen.findByText('This purchase doesn’t exist')).toBeInTheDocument()
    expect(calls.some((c) => c.url.pathname.includes('NOT-A-NUMBER'))).toBe(false)
  })
})

describe('inventory link', () => {
  it('links purchase receipts in the stock ledger to their purchase', async () => {
    wideScreen()
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/inventory/movements/')
          ? jsonResponse(200, page([{
              id: 9, created_at: '2026-10-20T06:00:00Z', type: 'purchase', type_label: 'Purchase', quantity_delta: 10, balance_after: 14,
              reason: 'Received from Malabar Textile House, invoice MTH/119', reference: 'PUR-000002', actor_name: 'Kiran Ramesh',
              variant: { id: 31, sku: 'SH-CT-001-M', size: 'M', colour: 'Blue', product_id: 3, product_name: 'Classic Cotton Shirt' },
            }]))
          : undefined,
    })
    renderRoutes(routes, '/admin/inventory/movements')
    const table = await screen.findByRole('table', { name: 'Stock movements' })
    expect(await within(table).findByRole('link', { name: 'PUR-000002' })).toHaveAttribute('href', '/admin/suppliers/purchases/PUR-000002')
  })
})

describe('supplier helpers', () => {
  it('reads ids, purchase numbers and URL filters strictly', () => {
    expect([parseSupplierId('12'), parseSupplierId('0'), parseSupplierId('x'), parseSupplierId(undefined)]).toEqual([12, null, null, null])
    expect([isPurchaseNumber('PUR-000001'), isPurchaseNumber('PUR-1'), isPurchaseNumber('LD-000001')]).toEqual([true, false, false])
    expect(readParams(new URLSearchParams('status=archived&sort=-balance&page=2'))).toEqual({ q: '', status: '', category: '', sort: '-balance', page: 2 })
  })

  it('only prices complete lines, and leaves the rate to the server when automatic', () => {
    const base = { variant: 1, label: '', sku: '', quantity: '3', unitCost: '210.50', rate: 'auto' }
    expect(toLineInput(base)).toEqual({ variant: 1, quantity: 3, unit_cost_paise: 21050 })
    expect(toLineInput({ ...base, rate: '1200' })).toEqual({ variant: 1, quantity: 3, unit_cost_paise: 21050, tax_rate_bp: 1200 })
    expect([toLineInput({ ...base, quantity: '' }), toLineInput({ ...base, quantity: '1.5' }), toLineInput({ ...base, unitCost: '0' })]).toEqual([null, null, null])
  })
})
