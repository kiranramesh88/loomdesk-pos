import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

import { readParams } from './transactionParams'

const ME_ADMIN = { ...ME_CASHIER, id: 1, full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }

const ROW = {
  invoice_no: 'LD-000042',
  status: 'completed',
  created_at: '2026-10-20T10:30:00Z',
  cashier: 4,
  cashier_name: 'Anjali Prakash',
  item_count: 3,
  discount_paise: 0,
  total_paise: 605790,
  payment_method: 'upi',
  gateway_verified: false,
  return_state: 'none',
}
const CASH_ROW = { ...ROW, invoice_no: 'LD-000041', item_count: 1, total_paise: 125895, payment_method: 'cash' }

const SUMMARY = {
  sale_count: 2,
  total_paise: 731685,
  subtotal_paise: 659700,
  discount_paise: 0,
  tax_paise: 71985,
  by_method: [
    { method: 'cash', sale_count: 1, total_paise: 125895 },
    { method: 'upi', sale_count: 1, total_paise: 605790 },
    { method: 'card', sale_count: 0, total_paise: 0 },
  ],
  by_day: [{ date: '2026-10-20', sale_count: 2, total_paise: 731685 }],
  by_cashier: [{ cashier: 4, cashier_name: 'Anjali Prakash', sale_count: 2, total_paise: 731685 }],
}
const EMPTY_SUMMARY = {
  ...SUMMARY,
  sale_count: 0,
  total_paise: 0,
  subtotal_paise: 0,
  tax_paise: 0,
  by_method: SUMMARY.by_method.map((m) => ({ ...m, sale_count: 0, total_paise: 0 })),
  by_day: [],
  by_cashier: [],
}

const CASHIERS = [
  { id: 4, full_name: 'Anjali Prakash', role: 'cashier', is_active: true },
  { id: 7, full_name: 'Vivek Menon', role: 'cashier', is_active: false },
]

/** Saved figures that today's catalogue couldn't produce, so the test proves nothing is recalculated. */
const SALE = {
  invoice_no: 'LD-000042',
  status: 'completed',
  created_at: '2026-10-20T10:30:00Z',
  cashier_name: 'Anjali Prakash',
  store: { name: 'Loom & Linen', code: 'LL-KKD-01', address: 'Beach Road, Kozhikode', state: 'Kerala', gstin: '32ABCDE1234F1Z5' },
  prices_include_tax: false,
  subtotal_paise: 539800,
  discount_paise: 20000,
  taxable_paise: 519800,
  tax_paise: 85990,
  total_paise: 605790,
  discount_approved_by_name: 'Rahul Krishnan',
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
      colour: 'Blue', hsn_code: '6205', quantity: 2, unit_price_paise: 119900, subtotal_paise: 239800, discount_paise: 8885,
      taxable_paise: 230915, tax_rate_bp: 500, tax_paise: 11546, total_paise: 242461,
    },
    {
      id: 2, variant: 41, product_name: 'Linen Jacket', product_sku: 'JK-LN-001', variant_sku: 'JK-LN-001-L-SAN', size: 'L',
      colour: 'Sand', hsn_code: '6203', quantity: 1, unit_price_paise: 300000, subtotal_paise: 300000, discount_paise: 11115,
      taxable_paise: 288885, tax_rate_bp: 1800, tax_paise: 74444, total_paise: 363329,
    },
  ],
  tax_breakdown: [
    { rate_bp: 500, taxable_paise: 230915, tax_paise: 11546, cgst_paise: 5773, sgst_paise: 5773 },
    { rate_bp: 1800, taxable_paise: 288885, tax_paise: 74444, cgst_paise: 37222, sgst_paise: 37222 },
  ],
  payment: { method: 'upi', amount_paise: 605790, tendered_paise: null, change_paise: 0, reference: 'UTR998877', gateway_verified: false, recorded_at: '2026-10-20T10:30:00Z' },
}

type Call = { method: string; url: URL; body?: unknown }
type Handler = (url: URL, method: string) => Response | undefined

function mockApi({ me = ME_ADMIN as unknown, handler = (() => undefined) as Handler } = {}) {
  document.cookie = 'csrftoken=t'
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
    const custom = handler(url, method)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (path.endsWith('/store/')) return jsonResponse(200, { name: 'Loom & Linen', code: 'LL', state: 'Kerala' })
    if (path.endsWith('/sales/summary/')) return jsonResponse(200, SUMMARY)
    if (path.endsWith('/sales/cashiers/')) return jsonResponse(200, CASHIERS)
    if (path.endsWith('/sales/') && method === 'GET')
      return jsonResponse(200, { count: 2, next: null, previous: null, results: [ROW, CASH_ROW] })
    if (path.endsWith('/sales/LD-000042/')) return jsonResponse(200, SALE)
    if (/\/sales\/LD-\d+\/$/.test(path)) return jsonResponse(404, { detail: 'Not found.', code: 'error', fields: {} })
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return calls
}

function wideScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      // A wide desktop: every min-width query matches, the rail-only range doesn't.
      ({ matches: !query.includes(' and '), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

const listRequests = (calls: Call[]) => calls.filter((c) => c.method === 'GET' && c.url.pathname.endsWith('/sales/'))
const lastList = (calls: Call[]) => listRequests(calls).at(-1)?.url.searchParams

async function chooseOption(label: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: label })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function openList(path = '/admin/transactions') {
  const utils = renderRoutes(routes, path)
  await screen.findByRole('heading', { level: 1, name: 'Transactions' })
  return utils
}

// The admin shell and each page are lazy chunks; the first load in a busy run can pass 1s.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('transactions access', () => {
  it('keeps cashiers out of the admin transactions pages', async () => {
    const calls = mockApi({ me: ME_CASHIER })
    const { router } = renderRoutes(routes, '/admin/transactions/LD-000042')
    await screen.findByRole('heading', { name: 'You don’t have access to this page' })
    expect(router.state.location.pathname).toBe('/403')
    expect(calls.some((c) => c.url.pathname.includes('/sales/'))).toBe(false)
  })
})

describe('transactions list', () => {
  it('shows each bill with its saved figures, and the summary with definitions', async () => {
    wideScreen()
    mockApi()
    await openList()

    const table = await screen.findByRole('table', { name: 'Transactions' })
    const row = within(table).getByRole('link', { name: 'LD-000042' }).closest('tr') as HTMLElement
    expect(within(row).getByText('Anjali Prakash')).toBeInTheDocument()
    expect(within(row).getByText('3 items')).toBeInTheDocument()
    expect(within(row).getByText('₹6,057.90')).toBeInTheDocument()
    expect(within(row).getByText('UPI')).toBeInTheDocument()
    expect(within(row).getByText('Not gateway-verified')).toBeInTheDocument()
    expect(within(row).getByText('Completed')).toBeInTheDocument()
    const cashRow = within(table).getByRole('link', { name: 'LD-000041' }).closest('tr') as HTMLElement
    expect(within(cashRow).queryByText('Not gateway-verified')).not.toBeInTheDocument()

    const summary = screen.getByRole('region', { name: 'Sales summary' })
    expect(within(summary).getByText('Completed sales')).toBeInTheDocument()
    expect(within(summary).getByText('Recorded sales total')).toBeInTheDocument()
    expect(within(summary).getByText('₹7,316.85')).toBeInTheDocument()
    expect(within(summary).getByText('Saved bill totals, after discounts, GST included')).toBeInTheDocument()

    const methods = screen.getByRole('table', { name: 'Payment methods' })
    const upi = within(methods).getByRole('rowheader', { name: /UPI/ }).closest('tr') as HTMLElement
    expect(within(upi).getByText('Entered by cashier, not gateway-verified')).toBeInTheDocument()
    expect(within(upi).getByText('₹6,057.90')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Daily sales' })).getByText('Tue, 20 Oct 2026')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Sales by cashier' })).getByText('2 bills')).toBeInTheDocument()
    expect(screen.getByText(/recorded sales, not settled payments/)).toBeInTheDocument()
    // Read-only history: no edit or delete actions anywhere.
    expect(screen.queryByRole('button', { name: /edit|delete|void/i })).not.toBeInTheDocument()
  })

  it('searches by invoice number on the server, after typing pauses', async () => {
    wideScreen()
    const calls = mockApi()
    const { router } = await openList()
    await screen.findByRole('table', { name: 'Transactions' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search transactions' }), 'LD-0000')
    await waitFor(() => expect(lastList(calls)?.get('q')).toBe('LD-0000'))
    expect(listRequests(calls).filter((c) => c.url.searchParams.get('q')).length).toBe(1)
    expect(router.state.location.search).toBe('?q=LD-0000')
    const summaries = calls.filter((c) => c.url.pathname.endsWith('/sales/summary/'))
    expect(summaries.at(-1)?.url.searchParams.get('q')).toBe('LD-0000')
  })

  it('filters by date range, cashier and payment method, and the summary follows', async () => {
    wideScreen()
    const calls = mockApi()
    const { router } = await openList()
    await screen.findByRole('table', { name: 'Transactions' })

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-10-20' } })
    await chooseOption('Payment method', 'Card')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Cashier' })).toBeEnabled())
    await chooseOption('Cashier', 'Vivek Menon (deactivated)')

    await waitFor(() =>
      expect(Object.fromEntries(lastList(calls) ?? [])).toEqual({
        date_from: '2026-10-01', date_to: '2026-10-20', method: 'card', cashier: '7', page: '1', page_size: '25',
      }),
    )
    const summary = calls.filter((c) => c.url.pathname.endsWith('/sales/summary/')).at(-1)?.url.searchParams
    expect(Object.fromEntries(summary ?? [])).toEqual({ date_from: '2026-10-01', date_to: '2026-10-20', method: 'card', cashier: '7' })
    expect(readParams(new URLSearchParams(router.state.location.search))).toMatchObject({ from: '2026-10-01', to: '2026-10-20', method: 'card', cashier: '7' })
    expect(screen.getByText(/Filtered by:/).parentElement).toHaveTextContent('Thu, 1 Oct 2026 to Tue, 20 Oct 2026 · Vivek Menon · Card')
  })

  it('explains a backwards date range instead of asking the server', async () => {
    wideScreen()
    const calls = mockApi()
    await openList('/admin/transactions?from=2026-10-20&to=2026-10-01')
    expect(screen.getByText('The end date is before the start date. Change one of them to see transactions.')).toBeInTheDocument()
    expect(screen.getByText('Ends before the start date')).toBeInTheDocument()
    expect(listRequests(calls)).toHaveLength(0)
    expect(calls.some((c) => c.url.pathname.endsWith('/sales/summary/'))).toBe(false)
  })

  it('ignores filter values the API would reject', () => {
    expect(readParams(new URLSearchParams('from=yesterday&to=2026-13-45&cashier=abc&method=cheque&status=refunded&page=-2'))).toEqual({
      q: '', from: '', to: '', cashier: '', method: '', status: '', page: 1,
    })
  })

  it('pages through results on the server', async () => {
    wideScreen()
    const calls = mockApi({
      handler: (url, method) =>
        method === 'GET' && url.pathname.endsWith('/sales/')
          ? jsonResponse(200, { count: 60, next: 'x', previous: null, results: [ROW] })
          : undefined,
    })
    const { router } = await openList()
    expect(await screen.findByText('Showing 1–25 of 60 transactions')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastList(calls)?.get('page')).toBe('2'))
    expect(router.state.location.search).toBe('?page=2')
    expect(await screen.findByText('Showing 26–50 of 60 transactions')).toBeInTheDocument()
  })

  it('offers the first page when the page number is past the end', async () => {
    wideScreen()
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/sales/') && url.searchParams.get('page') === '9'
          ? jsonResponse(404, { detail: 'Invalid page.', code: 'not_found', fields: {} })
          : undefined,
    })
    const { router } = await openList('/admin/transactions?page=9')
    await userEvent.click(await screen.findByRole('button', { name: 'Go to the first page' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await screen.findByRole('table', { name: 'Transactions' })).toBeInTheDocument()
  })

  it('has empty states for no sales and for filters that match nothing', async () => {
    wideScreen()
    mockApi({
      handler: (url, method) => {
        if (url.pathname.endsWith('/sales/summary/')) return jsonResponse(200, EMPTY_SUMMARY)
        if (method === 'GET' && url.pathname.endsWith('/sales/')) return jsonResponse(200, { count: 0, next: null, previous: null, results: [] })
        return undefined
      },
    })
    const { router } = await openList()
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Open billing' })).toHaveAttribute('href', '/billing')
    expect(within(screen.getByRole('region', { name: 'Sales summary' })).getAllByText('₹0.00')).toHaveLength(3)
    expect(screen.getAllByText('No sales in these filters.')).toHaveLength(2)

    await router.navigate('/admin/transactions?q=nothing')
    expect(await screen.findByText('No transactions match')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0] as HTMLElement)
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('shows a list error with retry, while the summary still loads', async () => {
    wideScreen()
    let fail = true
    mockApi({
      handler: (url, method) =>
        fail && method === 'GET' && url.pathname.endsWith('/sales/')
          ? jsonResponse(500, { detail: 'Server error.', code: 'error', fields: {} })
          : undefined,
    })
    await openList()
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(within(screen.getByRole('region', { name: 'Sales summary' })).getByText('₹7,316.85')).toBeInTheDocument()
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByRole('link', { name: 'LD-000042' })).toBeInTheDocument()
  })

  it('shows a summary error in its own panel without hiding the list', async () => {
    wideScreen()
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/sales/summary/') ? jsonResponse(500, { detail: 'Server error.', code: 'error', fields: {} }) : undefined,
    })
    await openList()
    expect(await screen.findByText('The sales summary couldn’t load')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'LD-000042' })).toBeInTheDocument()
  })

  it('lists bills as cards on phones', async () => {
    mockApi()
    await openList()
    const card = await screen.findByRole('link', { name: /^LD-000042, ₹6,057.90/ })
    expect(card).toHaveAttribute('href', '/admin/transactions/LD-000042')
    expect(card).toHaveTextContent('UPI · not gateway-verified')
    expect(screen.queryByRole('table', { name: 'Transactions' })).not.toBeInTheDocument()
  })
})

describe('transaction detail', () => {
  it('shows the saved sale: lines, discount approver, tax split, payment and store snapshot', async () => {
    wideScreen()
    mockApi()
    await renderRoutes(routes, '/admin/transactions/LD-000042')
    expect(await screen.findByRole('heading', { level: 1, name: 'Invoice LD-000042' })).toBeInTheDocument()

    const items = screen.getByRole('table', { name: 'Items sold' })
    const jacket = within(items).getByText('Linen Jacket').closest('tr') as HTMLElement
    expect(jacket).toHaveTextContent('L · Sand · JK-LN-001-L-SAN')
    expect(jacket).toHaveTextContent('₹3,000.00')
    expect(jacket).toHaveTextContent('−₹111.15')
    expect(jacket).toHaveTextContent('18%')
    expect(jacket).toHaveTextContent('₹3,633.29')

    const totals = screen.getByRole('region', { name: 'Totals and tax' })
    expect(totals).toHaveTextContent('Discount (approved by Rahul Krishnan)−₹200.00')
    expect(totals).toHaveTextContent('CGST 9% on ₹2,888.85₹372.22')
    expect(totals).toHaveTextContent('SGST 2.5% on ₹2,309.15₹57.73')
    expect(totals).toHaveTextContent('Total₹6,057.90')

    const bill = screen.getByRole('region', { name: 'Bill' })
    expect(bill).toHaveTextContent('Discount approved byRahul Krishnan')
    expect(bill).toHaveTextContent('CashierAnjali Prakash')
    const payment = screen.getByRole('region', { name: 'Payment' })
    expect(payment).toHaveTextContent('ReferenceUTR998877')
    expect(within(payment).getByText('Manually recorded')).toBeInTheDocument()
    expect(payment).toHaveTextContent('hasn’t been verified with a payment gateway or bank')
    expect(screen.getByRole('region', { name: 'Store' })).toHaveTextContent('GSTIN32ABCDE1234F1Z5')

    expect(screen.getByRole('link', { name: 'Reprint receipt' })).toHaveAttribute('href', '/admin/transactions/LD-000042/receipt')
    expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument()
    expect(document.title).toContain('Invoice LD-000042')
  })

  it('says when an invoice number is unknown', async () => {
    mockApi()
    renderRoutes(routes, '/admin/transactions/LD-999999')
    expect(await screen.findByText('No transaction with that invoice number')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to transactions' })).toHaveAttribute('href', '/admin/transactions')
  })

  it('treats a malformed invoice number as not found without asking the server', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/transactions/not%20an%20invoice')
    expect(await screen.findByText('No transaction with that invoice number')).toBeInTheDocument()
    expect(calls.some((c) => c.url.pathname.includes('/sales/'))).toBe(false)
  })

  it('shows a load error with retry', async () => {
    let fail = true
    mockApi({
      handler: (url) =>
        fail && url.pathname.endsWith('/sales/LD-000042/') ? jsonResponse(503, { detail: 'Unavailable.', code: 'error', fields: {} }) : undefined,
    })
    renderRoutes(routes, '/admin/transactions/LD-000042')
    expect(await screen.findByText('This transaction couldn’t load')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Invoice LD-000042' })).toBeInTheDocument()
  })
})

describe('receipt reprint', () => {
  it('prints the saved receipt and only ever reads the sale', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const calls = mockApi()
    renderRoutes(routes, '/admin/transactions/LD-000042/receipt')

    const receipt = await screen.findByLabelText('Receipt LD-000042')
    expect(receipt).toHaveTextContent('Loom & Linen')
    expect(receipt).toHaveTextContent('Discount (approved by Rahul Krishnan)−₹200.00')
    expect(receipt).toHaveTextContent('Total₹6,057.90')
    expect(receipt).toHaveTextContent('Recorded by the cashier, not gateway-verified.')
    expect(screen.getByRole('link', { name: 'Back to LD-000042' })).toHaveAttribute('href', '/admin/transactions/LD-000042')

    await userEvent.click(screen.getByRole('button', { name: 'Print receipt' }))
    await userEvent.click(screen.getByRole('button', { name: 'Print receipt' }))
    expect(print).toHaveBeenCalledTimes(2)
    // Reprinting is a read: no POST, PUT, PATCH or DELETE ever leaves the page.
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(calls.filter((c) => c.url.pathname.endsWith('/sales/LD-000042/'))).toHaveLength(1)
  })

  it('has a not-found state for an unknown receipt', async () => {
    mockApi()
    renderRoutes(routes, '/admin/transactions/LD-000999/receipt')
    expect(await screen.findByText('No transaction with that invoice number')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Print receipt' })).not.toBeInTheDocument()
  })
})

describe('voids and returns on the transaction page', () => {
  const store = (today: string) => (url: URL) =>
    url.pathname.endsWith('/store/') ? jsonResponse(200, { name: 'Loom & Linen', code: 'LL', state: 'Kerala', today }) : undefined

  it('voids today’s bill only with a reason, then shows it as voided', async () => {
    wideScreen()
    let voided = false
    const calls = mockApi({
      handler: (url, method) => {
        if (url.pathname.endsWith('/sales/LD-000042/void/') && method === 'POST') {
          voided = true
          return jsonResponse(200, { ...SALE, status: 'voided' })
        }
        if (url.pathname.endsWith('/sales/LD-000042/') && voided) {
          return jsonResponse(200, {
            ...SALE, status: 'voided', voided_at: '2026-10-20T11:00:00Z', voided_by_name: 'Kiran Ramesh', void_reason: 'Rang up twice',
          })
        }
        return store('2026-10-20')(url)
      },
    })
    renderRoutes(routes, '/admin/transactions/LD-000042')
    await userEvent.click(await screen.findByRole('button', { name: 'Void bill' }))
    const dialog = await screen.findByRole('dialog', { name: 'Void LD-000042?' })
    expect(within(dialog).getByText(/go back into stock/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Void bill' }))
    expect(within(dialog).getByText('A reason is required.')).toBeInTheDocument()
    expect(calls.some((c) => c.url.pathname.endsWith('/void/'))).toBe(false)

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason for voiding' }), 'Rang up twice')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Void bill' }))
    expect(await screen.findByText('This bill was voided')).toBeInTheDocument()
    expect(calls.filter((c) => c.url.pathname.endsWith('/void/')).map((c) => c.body)).toEqual([{ reason: 'Rang up twice' }])
    expect(screen.getByText(/Rang up twice/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Void bill' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Return items' })).not.toBeInTheDocument()
  })

  it('offers a return, not a void, for an earlier day’s bill, and lists its returns', async () => {
    wideScreen()
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/sales/LD-000042/')
          ? jsonResponse(200, {
              ...SALE,
              return_state: 'partial',
              returned_units: 1,
              refunded_paise: 122786,
              returns: [{ number: 'RET-000004', created_at: '2026-10-21T09:00:00Z', total_paise: 122786 }],
            })
          : store('2026-10-22')(url),
    })
    renderRoutes(routes, '/admin/transactions/LD-000042')
    const returnLink = await screen.findByRole('link', { name: 'Return items' })
    expect(returnLink).toHaveAttribute('href', '/admin/returns/new?invoice=LD-000042')
    expect(screen.queryByRole('button', { name: 'Void bill' })).not.toBeInTheDocument()
    expect(screen.getByText('Partly returned')).toBeInTheDocument()
    const returns = screen.getByRole('region', { name: 'Returns' })
    expect(within(returns).getByRole('link', { name: 'RET-000004' })).toHaveAttribute('href', '/admin/returns/RET-000004')
    expect(within(returns).getByText('1 of 3 units returned · ₹1,227.86 refunded')).toBeInTheDocument()
  })
})
