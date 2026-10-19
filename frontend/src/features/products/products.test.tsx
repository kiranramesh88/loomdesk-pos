import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/router'
import { jsonResponse, ME_CASHIER, renderRoutes, sessionOf } from '@/test/render'

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
const CATEGORIES = [{ id: 3, name: 'Shirts', hsn_code: '6205', tax_rule: RULE }]

const ROW = {
  id: 12,
  name: 'Classic Cotton Shirt',
  sku: 'SH-CT-001',
  category: { id: 3, name: 'Shirts' },
  image_url: null,
  base_price_paise: 119900,
  min_price_paise: 119900,
  max_price_paise: 129900,
  status: 'active',
  variant_count: 2,
  total_on_hand: 4,
  stock_state: 'low_stock',
  updated_at: '2026-10-20T10:00:00Z',
}

const VARIANT = {
  id: 31,
  size: 'M',
  colour: 'Blue',
  sku: 'SH-CT-001-M-BLU',
  barcode: '8901000010018',
  price_override_paise: null,
  price_paise: 119900,
  on_hand: 4,
  reorder_level: 2,
  is_active: true,
  stock_state: 'in_stock',
  has_history: true,
}

const DETAIL = {
  id: 12,
  name: 'Classic Cotton Shirt',
  sku: 'SH-CT-001',
  description: '',
  category: CATEGORIES[0],
  base_price_paise: 119900,
  cost_price_paise: 62000,
  hsn_code: '',
  effective_hsn_code: '6205',
  tax_rule: null,
  effective_tax_rule: RULE,
  image_url: null,
  status: 'active',
  variants: [VARIANT],
  recent_movements: [
    {
      id: 1,
      type: 'opening',
      type_label: 'Opening stock',
      variant_label: 'M / Blue',
      quantity_delta: 4,
      balance_after: 4,
      reason: 'Opening stock',
      reference: 'SH-CT-001',
      actor_name: 'Kiran Ramesh',
      created_at: '2026-10-20T10:00:00Z',
    },
  ],
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | undefined

function mockApi(handler: Handler = () => undefined) {
  document.cookie = 'csrftoken=t'
  const calls: { method: string; url: URL; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
    const custom = handler(url, init)
    if (custom) return custom
    const path = url.pathname
    if (path.endsWith('/auth/session/')) return jsonResponse(200, sessionOf(ME_ADMIN))
    if (path.endsWith('/store/')) return jsonResponse(200, { name: 'Loom & Linen', code: 'LL', state: 'Kerala' })
    if (path.endsWith('/catalog/categories/')) return jsonResponse(200, CATEGORIES)
    if (path.endsWith('/catalog/tax-rules/')) return jsonResponse(200, [RULE])
    if (path.endsWith('/catalog/products/') && method === 'GET')
      return jsonResponse(200, { count: 1, next: null, previous: null, results: [ROW] })
    if (path.endsWith('/catalog/products/12/') && method === 'GET') return jsonResponse(200, DETAIL)
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return calls
}

function wideScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({ matches: query.includes('35.0625rem') && !query.includes('<'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

const listRequests = (calls: ReturnType<typeof mockApi>) =>
  calls.filter((c) => c.method === 'GET' && c.url.pathname.endsWith('/catalog/products/'))

async function chooseOption(label: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: label })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

// The admin shell and each product page are lazy chunks; the first load in a busy run can pass 1s.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => vi.restoreAllMocks())

describe('catalogue', () => {
  it('lists products with stock shown as text', async () => {
    wideScreen()
    mockApi()
    renderRoutes(routes, '/admin/products')
    const table = await screen.findByRole('table', { name: 'Products' })
    const row = (await within(table).findByRole('link', { name: 'Classic Cotton Shirt' })).closest('tr')!
    expect(within(row).getByText('SH-CT-001')).toBeInTheDocument()
    expect(within(row).getByText('₹1,199.00 – ₹1,299.00')).toBeInTheDocument()
    expect(within(row).getByText('4 units')).toBeInTheDocument()
    expect(within(row).getByText('Low stock')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Edit Classic Cotton Shirt' })).toHaveAttribute('href', '/admin/products/12/edit')
    expect(screen.getByText('Showing 1–1 of 1 products')).toBeInTheDocument()
  })

  it('shows cards on phones', async () => {
    mockApi()
    renderRoutes(routes, '/admin/products')
    expect(await screen.findByRole('link', { name: 'Classic Cotton Shirt' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Low stock')).toBeInTheDocument()
  })

  it('puts search and filters in the URL and the request', async () => {
    const calls = mockApi()
    const { router } = renderRoutes(routes, '/admin/products')
    await screen.findByRole('link', { name: 'Classic Cotton Shirt' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search products' }), '8901000010018')
    await waitFor(() => expect(router.state.location.search).toBe('?q=8901000010018'))
    await chooseOption('Stock level', 'Low stock')
    await waitFor(() => expect(router.state.location.search).toBe('?q=8901000010018&stock=low_stock'))
    await waitFor(() =>
      expect(listRequests(calls).at(-1)!.url.search).toBe('?page=1&page_size=20&ordering=name&q=8901000010018&stock=low_stock'),
    )
    expect(screen.getByText('Filtered by:').closest('p')).toHaveTextContent('Filtered by: “8901000010018” · Low stock')

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByRole('searchbox', { name: 'Search products' })).toHaveValue('')
  })

  it('drops typing that was still waiting to apply when filters are cleared', async () => {
    mockApi()
    const { router } = renderRoutes(routes, '/admin/products?q=shirt')
    await screen.findByRole('link', { name: 'Classic Cotton Shirt' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search products' }), 's')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('searchbox', { name: 'Search products' })).toHaveValue('')
  })

  it('explains an empty search and offers to clear it', async () => {
    mockApi((url) =>
      url.pathname.endsWith('/catalog/products/') ? jsonResponse(200, { count: 0, next: null, previous: null, results: [] }) : undefined,
    )
    renderRoutes(routes, '/admin/products?q=velvet')
    expect(await screen.findByText('No products match')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(2)
  })

  it('shows a retryable error in the panel', async () => {
    let fail = true
    mockApi((url) => {
      if (!url.pathname.endsWith('/catalog/products/')) return undefined
      if (fail) return jsonResponse(500, { detail: 'Server error.', code: 'error', fields: {} })
    })
    renderRoutes(routes, '/admin/products')
    // Transient failures retry twice before the error shows.
    expect(await screen.findByText('Server error.', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Classic Cotton Shirt' })).toBeInTheDocument()
  }, 15000)
})

async function fillNewProduct() {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Product name' }), 'Linen Kurta')
  await userEvent.type(screen.getByRole('textbox', { name: 'Product SKU' }), 'KU-LN-014')
  await chooseOption('Category', 'Shirts')
  await userEvent.type(screen.getByRole('textbox', { name: 'Selling price' }), '1490')
  await userEvent.type(screen.getByRole('textbox', { name: 'Size' }), 'M')
  await userEvent.type(screen.getByRole('textbox', { name: 'Colour' }), 'Sage')
  await userEvent.tab() // blur suggests the variant SKU
  const opening = screen.getByRole('textbox', { name: 'Opening stock' })
  await userEvent.clear(opening)
  await userEvent.type(opening, '6')
}

describe('add product', () => {
  it('validates before sending anything', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/products/new')
    await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
    expect(await screen.findByText('Enter a product name.')).toBeInTheDocument()
    expect(screen.getByText('Choose a category.')).toBeInTheDocument()
    expect(screen.getByText('Enter a selling price above ₹0, e.g. 1199 or 1199.50.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Product name' })).toHaveFocus()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('sends paise and opening stock, then opens the new product', async () => {
    const calls = mockApi((url, init) =>
      init?.method === 'POST' && url.pathname.endsWith('/catalog/products/') ? jsonResponse(201, DETAIL) : undefined,
    )
    const { router } = renderRoutes(routes, '/admin/products/new')
    await fillNewProduct()
    expect(screen.getByRole('textbox', { name: 'Variant SKU' })).toHaveValue('KU-LN-014-M-SAG')
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/products/12'))
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({
      name: 'Linen Kurta',
      sku: 'KU-LN-014',
      description: '',
      category: 3,
      base_price_paise: 149000,
      cost_price_paise: null,
      hsn_code: '',
      tax_rule: null,
      variants: [
        {
          size: 'M',
          colour: 'Sage',
          sku: 'KU-LN-014-M-SAG',
          barcode: null,
          price_override_paise: null,
          reorder_level: 2,
          is_active: true,
          opening_stock: 6,
        },
      ],
    })
    expect(await screen.findByText('Product added')).toBeInTheDocument()
  })

  it('shows server duplicate errors on the field and keeps the values', async () => {
    mockApi((_url, init) =>
      init?.method === 'POST'
        ? jsonResponse(400, {
            detail: 'Please correct the highlighted fields.',
            code: 'invalid',
            fields: { sku: ['Another product already uses this SKU.'], 'variants.0.sku': ['Classic Cotton Shirt already uses this SKU.'] },
          })
        : undefined,
    )
    renderRoutes(routes, '/admin/products/new')
    await fillNewProduct()
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }))

    expect(await screen.findByText('Another product already uses this SKU.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Variant SKU' })).toHaveAccessibleDescription(
      'Classic Cotton Shirt already uses this SKU.',
    )
    expect(screen.getByText('Check the highlighted 2 fields. Nothing was saved.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Product name' })).toHaveValue('Linen Kurta')
    expect(screen.getByRole('textbox', { name: 'Product SKU' })).toHaveFocus()
  })
})

describe('edit product', () => {
  it('keeps stock read-only and sends no opening stock for existing variants', async () => {
    const calls = mockApi((_url, init) =>
      init?.method === 'PATCH' ? jsonResponse(200, { ...DETAIL, name: 'Cotton Shirt' }) : undefined,
    )
    const { router } = renderRoutes(routes, '/admin/products/12/edit')
    const name = await screen.findByRole('textbox', { name: 'Product name' })
    expect(screen.getByText('4 units on hand · change stock in Inventory')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Opening stock' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Size' })).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Remove variant 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Cost price/ })).toHaveAccessibleDescription(
      'Margin ₹579.00 (48% of the selling price).',
    )

    await userEvent.clear(name)
    await userEvent.type(name, 'Cotton Shirt')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/products/12'))
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url.pathname).toBe('/api/v1/catalog/products/12/')
    expect(patch.body).toMatchObject({
      name: 'Cotton Shirt',
      base_price_paise: 119900,
      cost_price_paise: 62000,
      variants: [{ id: 31, size: 'M', colour: 'Blue', opening_stock: 0, barcode: '8901000010018' }],
    })
  })

  it('adds a variant with opening stock alongside existing ones', async () => {
    mockApi()
    renderRoutes(routes, '/admin/products/12/edit')
    await userEvent.click(await screen.findByRole('button', { name: 'Add variant' }))
    expect(screen.getAllByRole('textbox', { name: 'Size' })[1]).toHaveFocus()
    expect(screen.getAllByRole('textbox', { name: 'Opening stock' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Remove variant 2' }))
    expect(screen.getAllByRole('textbox', { name: 'Size' })).toHaveLength(1)
  })
})

describe('product detail', () => {
  it('shows variants, movements and cost', async () => {
    mockApi()
    renderRoutes(routes, '/admin/products/12')
    expect(await screen.findByRole('heading', { level: 1, name: 'Classic Cotton Shirt' })).toBeInTheDocument()
    expect(screen.getByText('₹620.00 · ₹579.00 (48%)')).toBeInTheDocument()
    expect(screen.getByText('5% up to ₹2,500 per unit, 18% above')).toBeInTheDocument()
    expect(screen.getByText('Opening stock · M / Blue')).toBeInTheDocument()
    expect(document.title).toBe('Product · LoomDesk')
  })

  it('deactivates only after confirmation', async () => {
    const calls = mockApi((_url, init) =>
      init?.method === 'PATCH' ? jsonResponse(200, { ...DETAIL, status: 'inactive' }) : undefined,
    )
    renderRoutes(routes, '/admin/products/12')
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate Classic Cotton Shirt?' })
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'inactive' }))
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('shows not-found for an unknown id', async () => {
    mockApi((url) =>
      url.pathname.endsWith('/catalog/products/99/') ? jsonResponse(404, { detail: 'Not found.', code: 'not_found', fields: {} }) : undefined,
    )
    renderRoutes(routes, '/admin/products/99')
    expect(await screen.findByText('This product doesn’t exist')).toBeInTheDocument()
  })

  it('shows not-found for a malformed id without asking the server', async () => {
    const calls = mockApi()
    renderRoutes(routes, '/admin/products/abc/edit')
    expect(await screen.findByText('This product doesn’t exist')).toBeInTheDocument()
    expect(calls.some((c) => c.url.pathname.includes('/abc'))).toBe(false)
  })
})
