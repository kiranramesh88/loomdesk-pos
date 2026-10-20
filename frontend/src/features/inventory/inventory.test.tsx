import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

import { readMovementParams, readParams } from './inventoryParams'
import { parseQuantity, resultingQuantity } from './labels'

const ME_ADMIN = { ...ME_CASHIER, id: 1, full_name: 'Kiran Ramesh', initials: 'KR', role: 'admin' }

const PRODUCT = { id: 3, name: 'Classic Cotton Shirt', sku: 'SH-CT-001', status: 'active', category: 'Shirts', image_url: null }
const M = {
  id: 31, sku: 'SH-CT-001-M', size: 'M', colour: 'Blue', barcode: '', on_hand: 8, reorder_level: 2, stock_state: 'in_stock',
  is_active: true, sellable: true, product: PRODUCT, product_on_hand: 10, last_movement_at: '2026-10-20T10:30:00Z',
  last_movement_type: 'sale',
}
const L = { ...M, id: 32, sku: 'SH-CT-001-L', size: 'L', on_hand: 2, stock_state: 'low_stock', last_movement_at: null, last_movement_type: null }
const OLD = {
  ...M, id: 50, sku: 'JK-OLD-001-L', size: 'L', on_hand: 3, sellable: false, product_on_hand: 3,
  product: { ...PRODUCT, id: 9, name: 'Old Jacket', sku: 'JK-OLD-001', status: 'inactive' },
}
const SUMMARY = { tracked_variants: 4, low_stock: 1, out_of_stock: 1, units_on_hand: 15 }
const CATEGORIES = [{ id: 1, name: 'Shirts', slug: 'shirts', hsn_code: '6205', tax_rule: 1, tax_rule_name: 'GST', product_count: 2 }]

const MOVE_VARIANT = { id: 31, sku: 'SH-CT-001-M', size: 'M', colour: 'Blue', product_id: 3, product_name: 'Classic Cotton Shirt' }
const MOVEMENTS = [
  {
    id: 3, created_at: '2026-10-20T11:00:00Z', type: 'adjust_remove', type_label: 'Adjustment (remove)', quantity_delta: -2,
    balance_after: 8, reason: 'Water damage', reference: '', actor_name: 'Kiran Ramesh', variant: MOVE_VARIANT,
  },
  {
    id: 2, created_at: '2026-10-20T10:30:00Z', type: 'sale', type_label: 'Sale', quantity_delta: -1, balance_after: 10,
    reason: '', reference: 'LD-000042', actor_name: 'Anjali Prakash', variant: MOVE_VARIANT,
  },
  {
    id: 1, created_at: '2026-10-01T09:00:00Z', type: 'opening', type_label: 'Opening stock', quantity_delta: 11, balance_after: 11,
    reason: '', reference: '', actor_name: null, variant: MOVE_VARIANT,
  },
]

type Call = { method: string; url: URL; body?: unknown }
type Handler = (url: URL, method: string) => Response | undefined

const page = <T,>(results: T[], count = results.length) => ({ count, next: null, previous: null, results })

function mockApi({ me = ME_ADMIN as unknown, handler = (() => undefined) as Handler } = {}) {
  document.cookie = 'csrftoken=t'
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const custom = handler(url, method)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(me))
    if (path.endsWith('/store/')) return jsonResponse(200, { name: 'Loom & Linen', code: 'LL', state: 'Kerala' })
    if (path.endsWith('/catalog/categories/')) return jsonResponse(200, CATEGORIES)
    if (path.endsWith('/inventory/summary/')) return jsonResponse(200, SUMMARY)
    if (path.endsWith('/inventory/variants/')) return jsonResponse(200, page([M, L, OLD]))
    if (path.endsWith('/inventory/variants/31/')) return jsonResponse(200, M)
    if (path.endsWith('/inventory/variants/32/')) return jsonResponse(200, L)
    if (/\/inventory\/variants\/\d+\/$/.test(path)) return jsonResponse(404, { detail: 'Not found.', code: 'error', fields: {} })
    if (path.endsWith('/inventory/movements/')) return jsonResponse(200, page(MOVEMENTS))
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
const lastList = (calls: Call[]) => requests(calls, '/inventory/variants/').at(-1)?.url.searchParams

async function chooseOption(label: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: label })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function openInventory(path = '/admin/inventory') {
  const utils = renderRoutes(routes, path)
  await screen.findByRole('heading', { level: 1, name: 'Inventory' })
  return utils
}

configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('inventory access', () => {
  it('keeps cashiers out without asking the inventory API', async () => {
    const calls = mockApi({ me: ME_CASHIER })
    const { router } = renderRoutes(routes, '/admin/inventory/movements')
    await screen.findByRole('heading', { name: 'You don’t have access to this page' })
    expect(router.state.location.pathname).toBe('/403')
    expect(calls.some((c) => c.url.pathname.includes('/inventory/'))).toBe(false)
  })
})

describe('inventory overview', () => {
  it('shows variant stock, product totals, reorder levels, status and the summary', async () => {
    wideScreen()
    mockApi()
    await openInventory()

    const table = await screen.findByRole('table', { name: 'Stock levels' })
    const m = within(table).getByText('SH-CT-001-M').closest('tr') as HTMLElement
    expect(within(m).getByText('8')).toBeInTheDocument()
    expect(within(m).getByText('of 10 in product')).toBeInTheDocument()
    expect(within(m).getByText('In stock')).toBeInTheDocument()
    expect(within(m).getByRole('link', { name: 'Stock history for SH-CT-001-M' })).toHaveAttribute('href', '/admin/inventory/movements?variant=31')
    const l = within(table).getByText('SH-CT-001-L').closest('tr') as HTMLElement
    expect(within(l).getByText('Low stock')).toBeInTheDocument()
    expect(within(l).getByText('No movements')).toBeInTheDocument()
    const old = within(table).getByText('JK-OLD-001-L').closest('tr') as HTMLElement
    expect(within(old).getByText('Not on sale')).toBeInTheDocument()

    const summary = screen.getByRole('region', { name: 'Stock summary' })
    expect(within(summary).getByText('Tracked variants')).toBeInTheDocument()
    expect(within(summary).getByText('15')).toBeInTheDocument()
    expect(within(summary).getByText('At or below the reorder level')).toBeInTheDocument()
  })

  it('filters by stock level and searches on the server, mirrored in the URL', async () => {
    wideScreen()
    const calls = mockApi()
    const { router } = await openInventory()
    await screen.findByRole('table', { name: 'Stock levels' })

    await chooseOption('Stock level', 'Low stock')
    await waitFor(() => expect(lastList(calls)?.get('state')).toBe('low_stock'))
    expect(router.state.location.search).toBe('?state=low_stock')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stock' }), 'shirt')
    await waitFor(() => expect(lastList(calls)?.get('q')).toBe('shirt'))
    expect(lastList(calls)?.get('state')).toBe('low_stock')
    expect(requests(calls, '/inventory/variants/').filter((c) => c.url.searchParams.get('q')).length).toBe(1)

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('pages through results on the server', async () => {
    wideScreen()
    const calls = mockApi({
      handler: (url) => (url.pathname.endsWith('/inventory/variants/') ? jsonResponse(200, page([M, L], 60)) : undefined),
    })
    const { router } = await openInventory()
    expect(await screen.findByText('Showing 1–25 of 60 variants')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastList(calls)?.get('page')).toBe('2'))
    expect(lastList(calls)?.get('page_size')).toBe('25')
    expect(router.state.location.search).toBe('?page=2')
  })

  it('uses cards with adjust and history actions on phones', async () => {
    mockApi()
    await openInventory()
    expect(await screen.findByRole('button', { name: 'Adjust stock for SH-CT-001-L' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stock history for SH-CT-001-L' })).toHaveAttribute('href', '/admin/inventory/movements?variant=32')
  })

  it('shows an error in the list panel without blanking the page', async () => {
    wideScreen()
    mockApi({
      handler: (url) =>
        url.pathname.endsWith('/inventory/variants/') ? jsonResponse(500, { detail: 'Server error.', code: 'error', fields: {} }) : undefined,
    })
    await openInventory()
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Stock summary' })).toBeInTheDocument()
  })
})

describe('stock adjustment', () => {
  async function openDialog(sku = 'SH-CT-001-M') {
    await userEvent.click(await screen.findByRole('button', { name: `Adjust stock for ${sku}` }))
    return screen.findByRole('dialog', { name: 'Adjust stock' })
  }

  it('previews the result, validates, and sends the previewed figure to the server', async () => {
    wideScreen()
    const calls = mockApi({
      handler: (url, method) =>
        method === 'POST' && url.pathname.endsWith('/inventory/adjustments/')
          ? jsonResponse(201, { movement: { ...MOVEMENTS[0], quantity_delta: -3, balance_after: 5 }, variant: { ...M, on_hand: 5 } })
          : undefined,
    })
    await openInventory()
    const dialog = await openDialog()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm adjustment' }))
    expect(within(dialog).getByText('Choose add, remove or a counted quantity.')).toBeInTheDocument()
    expect(requests(calls, '/inventory/adjustments/', 'POST')).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Remove stock' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Units to remove' }), '9')
    expect(within(dialog).getByText('(−9)')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm adjustment' }))
    expect(within(dialog).getByText('Only 8 in stock; stock can’t go negative.')).toBeInTheDocument()
    expect(within(dialog).getByText(/Say why stock is changing/)).toBeInTheDocument()
    expect(requests(calls, '/inventory/adjustments/', 'POST')).toHaveLength(0)

    const quantity = within(dialog).getByRole('textbox', { name: 'Units to remove' })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, '3')
    expect(within(dialog).getByText('5')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason' }), '  Water damage ')
    const listsBefore = requests(calls, '/inventory/variants/').length
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm adjustment' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requests(calls, '/inventory/adjustments/', 'POST').map((c) => c.body)).toEqual([
      { variant: 31, kind: 'remove', quantity: 3, reason: 'Water damage', expected_on_hand: 8 },
    ])
    expect(await screen.findByText('Classic Cotton Shirt · M / Blue: 8 → 5')).toBeInTheDocument()
    // The list and summary refetch from the server; nothing is updated optimistically.
    await waitFor(() => expect(requests(calls, '/inventory/variants/').length).toBeGreaterThan(listsBefore))
  })

  it('explains when stock changed since the preview and refreshes the figure', async () => {
    wideScreen()
    let variantReads = 0
    const calls = mockApi({
      handler: (url, method) => {
        if (method === 'POST' && url.pathname.endsWith('/inventory/adjustments/'))
          return jsonResponse(409, {
            detail: 'Stock changed from 8 to 7 since this adjustment was opened. Check the new figure and confirm again.',
            code: 'stock_changed',
            fields: {},
          })
        if (url.pathname.endsWith('/inventory/variants/31/')) return jsonResponse(200, variantReads++ ? { ...M, on_hand: 7 } : M)
        return undefined
      },
    })
    await openInventory()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Set counted' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Counted quantity' }), '6')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Shelf count')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm adjustment' }))

    expect(await within(dialog).findByText(/Stock changed from 8 to 7/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Adjust stock' })).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByText('(−1)')).toBeInTheDocument())
    expect(requests(calls, '/inventory/adjustments/', 'POST')).toHaveLength(1)
  })

  it('shows server field errors next to the field', async () => {
    wideScreen()
    mockApi({
      handler: (url, method) =>
        method === 'POST' && url.pathname.endsWith('/inventory/adjustments/')
          ? jsonResponse(400, { detail: 'Invalid.', code: 'invalid', fields: { quantity: ['Only 2 in stock; stock cannot go negative.'] } })
          : undefined,
    })
    await openInventory()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Add stock' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Units to add' }), '1')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Delivery')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm adjustment' }))
    expect(await within(dialog).findByText('Only 2 in stock; stock cannot go negative.')).toBeInTheDocument()
  })
})

describe('stock movements', () => {
  it('lists each movement with type, change, balance, reason, reference and who made it', async () => {
    wideScreen()
    mockApi()
    renderRoutes(routes, '/admin/inventory/movements')
    await screen.findByRole('heading', { level: 1, name: 'Stock movements' })
    const table = await screen.findByRole('table', { name: 'Stock movements' })

    const adjust = within(table).getByText('Water damage').closest('tr') as HTMLElement
    expect(within(adjust).getByText('Adjustment (remove)')).toBeInTheDocument()
    expect(within(adjust).getByText('−2')).toBeInTheDocument()
    expect(within(adjust).getByText('Kiran Ramesh')).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: 'LD-000042' })).toHaveAttribute('href', '/admin/transactions/LD-000042')
    const opening = within(table).getByText('Opening stock').closest('tr') as HTMLElement
    expect(within(opening).getByText('System')).toBeInTheDocument()
    expect(within(opening).getByText('+11')).toBeInTheDocument()
    // The ledger is append-only: nothing to edit or delete.
    expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument()
  })

  it('shows one variant’s history with its stock and an adjust action', async () => {
    wideScreen()
    const calls = mockApi()
    const { router } = renderRoutes(routes, '/admin/inventory/movements?variant=31&type=sale')
    const heading = await screen.findByRole('region', { name: 'Variant' })
    expect(await within(heading).findByText('Classic Cotton Shirt · M / Blue')).toBeInTheDocument()
    expect(within(heading).getByRole('button', { name: 'Adjust stock' })).toBeInTheDocument()
    const query = requests(calls, '/inventory/movements/').at(-1)?.url.searchParams
    expect(query?.get('variant')).toBe('31')
    expect(query?.get('type')).toBe('sale')

    await userEvent.click(within(heading).getByRole('button', { name: 'All movements' }))
    await waitFor(() => expect(router.state.location.search).toBe('?type=sale'))
  })

  it('does not request a backwards date range', async () => {
    wideScreen()
    const calls = mockApi()
    renderRoutes(routes, '/admin/inventory/movements?from=2026-10-20&to=2026-10-01')
    expect(await screen.findByText(/end date is before the start date/)).toBeInTheDocument()
    expect(requests(calls, '/inventory/movements/')).toHaveLength(0)
  })

  it('says when a variant in the URL does not exist', async () => {
    wideScreen()
    mockApi()
    renderRoutes(routes, '/admin/inventory/movements?variant=999')
    expect(await screen.findByText(/That variant doesn’t exist/)).toBeInTheDocument()
  })
})

describe('inventory helpers', () => {
  it('reads only known values from the URL', () => {
    expect(readParams(new URLSearchParams('q=%20shirt%20&state=nearly&status=inactive&category=x&sort=bogus&page=-2'))).toEqual({
      q: 'shirt', category: '', state: '', status: 'inactive', sort: 'product', page: 1,
    })
    expect(readMovementParams(new URLSearchParams('variant=12&type=count&from=2026-13-40&to=2026-10-20&page=3'))).toEqual({
      q: '', variant: '12', type: 'count', from: '', to: '2026-10-20', page: 3,
    })
  })

  it('accepts whole quantities only and previews each kind', () => {
    expect([parseQuantity('3'), parseQuantity(' 12 '), parseQuantity('2.5'), parseQuantity('-1'), parseQuantity('3e2'), parseQuantity('')]).toEqual([
      3, 12, null, null, null, null,
    ])
    expect(resultingQuantity('add', 8, 4)).toBe(12)
    expect(resultingQuantity('remove', 8, 9)).toBe(-1)
    expect(resultingQuantity('count', 8, 6)).toBe(6)
    expect(resultingQuantity('count', 8, null)).toBeNull()
  })
})
