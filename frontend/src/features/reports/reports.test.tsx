import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

import { addDays, matchingPreset, presetRange, rangeLabel } from './dates'
import { trendSummary } from './trendSummary'

const ME_ADMIN = { ...ME_CASHIER, id: 1, full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }
const TODAY = '2026-10-20'

const LIBRARY = [
  { key: 'sales-summary', title: 'Sales summary', description: 'Sales, refunds and net sales by day.', uses_dates: true },
  { key: 'low-stock', title: 'Low stock', description: 'Variants at or below their reorder level.', uses_dates: false },
]

const metric = (key: string, label: string, value: number, kind = 'money') => ({ key, label, value, kind })

function salesSummary(from = '2026-09-21', to = TODAY) {
  return {
    key: 'sales-summary',
    title: 'Sales summary',
    description: 'Sales, refunds and net sales by day.',
    uses_dates: true,
    period: { date_from: from, date_to: to },
    generated_at: '2026-10-20T10:00:00Z',
    filters: [],
    applied: {},
    summary: [metric('net', 'Net sales', 168325), metric('bills', 'Bills completed', 3, 'count'), metric('average', 'Average bill', 100110), metric('refunds', 'Refunds', 132007)],
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'bills', label: 'Bills', kind: 'count' },
      { key: 'net', label: 'Net sales', kind: 'money' },
    ],
    rows: [
      { date: '2026-10-18', bills: 1, net: 50000 },
      { date: '2026-10-19', bills: 0, net: -13200 },
      { date: '2026-10-20', bills: 2, net: 131525 },
    ],
    trend: { x: 'date', y: 'net' },
    truncated: false,
    definitions: [
      { term: 'Net sales', meaning: 'Sales minus refunds for the same dates.' },
      { term: 'Average bill', meaning: 'Sales divided by completed bills.' },
    ],
  }
}

const LOW_STOCK = {
  ...salesSummary(),
  key: 'low-stock',
  title: 'Low stock',
  description: 'Variants at or below their reorder level.',
  uses_dates: false,
  period: null,
  filters: [{ key: 'state', label: 'Stock', options: [{ value: 'low_stock', label: 'Low stock' }, { value: 'out_of_stock', label: 'Out of stock' }] }],
  summary: [metric('low_stock', 'Low stock', 1, 'count'), metric('out_of_stock', 'Out of stock', 1, 'count')],
  columns: [
    { key: 'product', label: 'Product', kind: 'text' },
    { key: 'sku', label: 'Variant SKU', kind: 'text' },
    { key: 'option', label: 'Size / colour', kind: 'text' },
    { key: 'on_hand', label: 'On hand', kind: 'count' },
    { key: 'state', label: 'Stock', kind: 'text' },
  ],
  rows: [
    { product: 'Linen Kurta', sku: 'KU-LN-001-M', option: 'M / White', on_hand: 0, state: 'Out of stock' },
    { product: 'Cotton Shirt', sku: 'SH-CT-001-L', option: 'L / Blue', on_hand: 2, state: 'Low stock' },
  ],
  trend: null,
}

const PAYMENT_METHODS = {
  ...salesSummary(),
  key: 'payment-methods',
  rows: [
    { method_label: 'Cash', bills: 2, sales: 200000, refunds: 84862 },
    { method_label: 'UPI', bills: 1, sales: 100332, refunds: 0 },
    { method_label: 'Card', bills: 0, sales: 0, refunds: 0 },
  ],
}

type Handler = (url: URL) => Response | undefined

function mockApi({ me = ME_ADMIN as unknown, handler = (() => undefined) as Handler, sales = 3 } = {}) {
  document.cookie = 'csrftoken=t'
  const urls: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    urls.push(url)
    const custom = handler(url)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (path.endsWith('/store/')) return jsonResponse(200, { name: 'Loom & Linen', code: 'LL-KKD-01', state: 'Kerala', today: TODAY })
    if (path.endsWith('/api/v1/reports/')) return jsonResponse(200, LIBRARY)
    if (path.endsWith('/reports/sales-summary/')) {
      return jsonResponse(200, salesSummary(url.searchParams.get('date_from') ?? undefined, url.searchParams.get('date_to') ?? undefined))
    }
    if (path.endsWith('/reports/low-stock/')) return jsonResponse(200, LOW_STOCK)
    if (path.endsWith('/reports/payment-methods/')) return jsonResponse(200, PAYMENT_METHODS)
    if (path.endsWith('/inventory/summary/')) return jsonResponse(200, { tracked_variants: 40, low_stock: 1, out_of_stock: 1, units_on_hand: 120 })
    if (path.endsWith('/sales/')) {
      const results = sales
        ? [{ invoice_no: 'LD-000003', created_at: '2026-10-20T09:00:00Z', payment_method: 'upi', cashier_name: 'Anjali', total_paise: 47145, status: 'voided' }]
        : []
      return jsonResponse(200, { count: sales, next: null, previous: null, results })
    }
    throw new Error(`Unexpected ${path}`)
  })
  return urls
}

const reportRequests = (urls: URL[], key: string) => urls.filter((u) => u.pathname.endsWith(`/reports/${key}/`))

configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('report helpers', () => {
  it('works in store dates', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(presetRange('7d', TODAY)).toEqual({ from: '2026-10-14', to: TODAY })
    expect(presetRange('month', TODAY)).toEqual({ from: '2026-10-01', to: TODAY })
    expect(matchingPreset('2026-09-21', TODAY, TODAY)).toBe('30d')
    expect(matchingPreset('2026-09-22', TODAY, TODAY)).toBeUndefined()
    expect(rangeLabel('2026-10-14', TODAY)).toBe('14 Oct – 20 Oct 2026')
    expect(rangeLabel('2025-12-30', '2026-01-02')).toBe('30 Dec 2025 – 2 Jan 2026')
    expect(rangeLabel(TODAY, TODAY)).toBe('20 Oct 2026')
  })

  it('describes a trend in words', () => {
    const points = [
      { date: '2026-10-18', value: 50000 },
      { date: '2026-10-19', value: -13200 },
      { date: '2026-10-20', value: 131525 },
    ]
    expect(trendSummary(points, 'Net sales')).toBe(
      'Net sales totalled ₹1,683.25 over 3 days. Highest ₹1,315.25 on 20 Oct 2026; lowest -₹132.00 on 19 Oct 2026.',
    )
    expect(trendSummary([], 'Net sales')).toBe('No net sales in these dates.')
  })
})

describe('reports', () => {
  it('keeps cashiers out', async () => {
    const urls = mockApi({ me: ME_CASHIER })
    const { router } = renderRoutes(routes, '/admin/reports/sales-summary')
    await screen.findByRole('heading', { name: 'You don’t have access to this page' })
    expect(router.state.location.pathname).toBe('/403')
    expect(urls.some((u) => u.pathname.includes('/reports/'))).toBe(false)
  })

  it('lists only the reports the server has', async () => {
    mockApi()
    renderRoutes(routes, '/admin/reports')
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports & insights' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Reports' })
    const links = within(list).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/admin/reports/sales-summary', '/admin/reports/low-stock'])
  })

  it('shows the figures, the trend in words, sortable rows, definitions and the export link', async () => {
    mockApi()
    renderRoutes(routes, '/admin/reports/sales-summary')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sales summary' })).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Summary' })
    expect(within(summary).getByText('₹1,683.25')).toBeInTheDocument()
    expect(screen.getByText(/Net sales totalled ₹1,683.25 over 3 days/)).toBeInTheDocument()
    // The server's default range until dates are chosen. ICU spells September "Sep" or "Sept".
    expect(screen.getByText(/^Showing 21 Sept? – 20 Oct 2026 \(store dates\)\.$/)).toBeInTheDocument()
    expect(screen.getByText('Sales minus refunds for the same dates.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/api/v1/reports/sales-summary/export/')

    const table = screen.getByRole('table', { name: 'Sales summary' })
    const netHeader = within(table).getByRole('columnheader', { name: /Net sales/ })
    expect(netHeader).toHaveAttribute('aria-sort', 'none')
    const firstCells = () => within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[2]?.textContent)
    expect(firstCells()).toEqual(['₹500.00', '-₹132.00', '₹1,315.25'])
    await userEvent.click(within(netHeader).getByRole('button', { name: /Net sales/ }))
    expect(netHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(firstCells()).toEqual(['-₹132.00', '₹500.00', '₹1,315.25'])
    await userEvent.click(within(netHeader).getByRole('button', { name: /Net sales/ }))
    expect(netHeader).toHaveAttribute('aria-sort', 'descending')
    expect(firstCells()).toEqual(['₹1,315.25', '₹500.00', '-₹132.00'])
  })

  it('draws the first 500 rows of the chosen order, and all of them on request', async () => {
    const many = { ...LOW_STOCK, rows: Array.from({ length: 620 }, (_, i) => ({ product: `Item ${i}`, sku: `SKU-${i}`, option: 'M', on_hand: i, state: 'Low stock' })) }
    mockApi({ handler: (url) => (url.pathname.endsWith('/reports/low-stock/') ? jsonResponse(200, many) : undefined) })
    renderRoutes(routes, '/admin/reports/low-stock')
    const table = await screen.findByRole('table', { name: 'Low stock' })
    // Plain DOM queries: role queries over hundreds of rows are slow in jsdom.
    const bodyRows = () => [...table.querySelectorAll('tbody tr')]
    expect(bodyRows()).toHaveLength(500)
    expect(screen.getByText('Showing the first 500 of 620 rows, in the order chosen. The CSV has every row.')).toBeInTheDocument()
    // Sorting covers every row, not just the drawn ones.
    const onHand = within(table).getByRole('columnheader', { name: /On hand/ })
    await userEvent.click(within(onHand).getByRole('button', { name: /On hand/ }))
    await userEvent.click(within(onHand).getByRole('button', { name: /On hand/ }))
    expect(bodyRows()[0]?.textContent).toContain('Item 619')
    await userEvent.click(screen.getByRole('button', { name: 'Show all 620 rows' }))
    expect(bodyRows()).toHaveLength(620)
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  }, 20000)

  it('puts the chosen dates in the URL, the request and the export', async () => {
    const urls = mockApi()
    const { router } = renderRoutes(routes, '/admin/reports/sales-summary')
    await screen.findByRole('heading', { level: 1, name: 'Sales summary' })
    await userEvent.click(screen.getByRole('combobox', { name: 'Dates' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Last 7 days' }))
    await waitFor(() => expect(router.state.location.search).toBe('?from=2026-10-14&to=2026-10-20'))
    await waitFor(() => expect(reportRequests(urls, 'sales-summary').at(-1)?.search).toBe('?date_from=2026-10-14&date_to=2026-10-20'))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/api/v1/reports/sales-summary/export/?date_from=2026-10-14&date_to=2026-10-20'),
    )
    expect(screen.getByText('Showing 14 Oct – 20 Oct 2026 (store dates).')).toBeInTheDocument()
  })

  it('applies a report’s own filter, and stock reports take no dates', async () => {
    const urls = mockApi()
    const { router } = renderRoutes(routes, '/admin/reports/low-stock')
    await screen.findByRole('heading', { level: 1, name: 'Low stock' })
    expect(screen.queryByRole('combobox', { name: 'Dates' })).not.toBeInTheDocument()
    expect(screen.getByText(/^Stock as it is now \(/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Stock' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Out of stock' }))
    await waitFor(() => expect(router.state.location.search).toBe('?state=out_of_stock'))
    await waitFor(() => expect(reportRequests(urls, 'low-stock').at(-1)?.search).toBe('?state=out_of_stock'))
  })

  it('explains dates the server refuses', async () => {
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/reports/sales-summary/')
          ? jsonResponse(400, { detail: 'Invalid input.', code: 'invalid', fields: { date_from: ['Choose at most 366 days.'] } })
          : undefined,
    })
    renderRoutes(routes, '/admin/reports/sales-summary?from=2024-01-01&to=2026-10-20')
    expect(await screen.findByText('Choose at most 366 days.')).toBeInTheDocument()
  })

  it('says when a report doesn’t exist', async () => {
    mockApi({ handler: (url) => (url.pathname.endsWith('/reports/profit/') ? jsonResponse(404, { detail: 'There’s no such report.', code: 'not_found', fields: {} }) : undefined) })
    renderRoutes(routes, '/admin/reports/profit')
    expect(await screen.findByText('There’s no such report')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All reports' })).toHaveAttribute('href', '/admin/reports')
  })
})

describe('overview', () => {
  it('shows the last 7 store days by default, with every figure from the API', async () => {
    const urls = mockApi()
    renderRoutes(routes, '/admin')
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument()
    expect(await screen.findByText('Showing 14 Oct – 20 Oct 2026')).toBeInTheDocument()
    await waitFor(() => expect(reportRequests(urls, 'sales-summary')[0]?.search).toBe('?date_from=2026-10-14&date_to=2026-10-20'))
    const figures = screen.getByRole('region', { name: 'Figures for 14 Oct – 20 Oct 2026' })
    expect(await within(figures).findByText('₹1,683.25')).toBeInTheDocument()
    expect(within(figures).getByText('3')).toBeInTheDocument()
    expect(within(figures).getByText('₹1,001.10')).toBeInTheDocument()
    expect(within(figures).getByRole('button', { name: 'About Net sales' })).toBeInTheDocument()
    expect(await screen.findByText(/Net sales totalled/)).toBeInTheDocument()
    expect(await screen.findByText('Cash')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /LD-000003/ })).toHaveAttribute('href', '/admin/transactions/LD-000003')
    expect(screen.getByRole('link', { name: /Linen Kurta/ })).toHaveAttribute('href', '/admin/inventory?q=KU-LN-001-M')
    expect(screen.queryByText('No sales yet')).not.toBeInTheDocument()
  })

  it('keeps the other panels when one fails', async () => {
    mockApi({
      handler: (url) => (url.pathname.endsWith('/reports/payment-methods/') ? jsonResponse(500, { detail: 'Server error.', code: 'error', fields: {} }) : undefined),
    })
    renderRoutes(routes, '/admin')
    const methods = await screen.findByRole('region', { name: 'Payment methods' })
    expect(await within(methods).findByRole('alert')).toHaveTextContent('Server error.')
    expect(await screen.findByText('₹1,683.25')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Linen Kurta/ })).toBeInTheDocument()
  })

  it('explains the empty overview before the first sale', async () => {
    mockApi({ sales: 0 })
    renderRoutes(routes, '/admin')
    expect(await screen.findByText('No sales yet')).toBeInTheDocument()
    expect(screen.getByText(/fills in after the first sale/)).toBeInTheDocument()
  })
})
