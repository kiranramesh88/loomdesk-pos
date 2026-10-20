// Accessibility sweep: every admin, mobile, billing and public page through axe-core (WCAG 2.1 A and AA),
// plus a 360px overflow check on phone layouts. Read-only: it signs in and opens pages, and never submits a form.
//
// Needs the dev servers (`npm run dev` and Django on :8000) with the seed accounts:
//   node scripts/a11y.mjs                      # LOOMDESK_URL defaults to http://localhost:5173
// Seed passwords come from SEED_DEMO_PASSWORD (default loomdesk-demo) and are never printed.

import AxeBuilder from '@axe-core/playwright'
import { chromium } from '@playwright/test'

const BASE = process.env.LOOMDESK_URL ?? 'http://localhost:5173'
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'loomdesk-demo'
const ADMIN = process.env.LOOMDESK_ADMIN ?? 'kiran@loomlinen.demo'
const CASHIER = process.env.LOOMDESK_CASHIER ?? 'anjali@loomlinen.demo'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function signIn(page, email) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

const api = (page, path) => page.evaluate(async (p) => (await fetch(`/api/v1${p}`)).json(), path)

async function settle(page) {
  await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15000 })
  await page.waitForLoadState('networkidle')
  // Skeletons gone: every panel has its data or its own error.
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {})
}

const failures = []

// axe needs a page from an explicit context.
const newPage = async (browser, viewport) => (await browser.newContext(viewport ? { viewport } : {})).newPage()

async function audit(page, label, { phone = false, settled = false } = {}) {
  if (!settled) await settle(page)
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const overflow = phone ? await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) : 0
  const ok = violations.length === 0 && overflow <= 0
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  for (const v of violations) {
    const where = v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')
    console.log(`     ${v.impact ?? ''} ${v.id}: ${v.help} (${v.nodes.length}) ${where}`)
  }
  if (overflow > 0) console.log(`     page is ${overflow}px wider than the screen`)
  if (!ok) failures.push(label)
}

async function visit(page, path, options) {
  await page.goto(`${BASE}${path}`)
  await audit(page, `${options?.phone ? '360px ' : ''}${path}`, options)
}

const browser = await chromium.launch()
try {
  // Public pages
  const anon = await newPage(browser)
  await visit(anon, '/login')
  await visit(anon, '/set-password/x/y')

  // Admin, desktop
  const desk = await newPage(browser, { width: 1440, height: 900 })
  await signIn(desk, ADMIN)
  const sale = (await api(desk, '/sales/?page_size=1')).results[0]
  const ret = (await api(desk, '/returns/?page_size=1')).results[0]
  const product = (await api(desk, '/catalog/products/?page_size=1')).results[0]
  const supplier = (await api(desk, '/suppliers/?page_size=1')).results[0]
  const purchase = (await api(desk, '/suppliers/purchases/?page_size=1')).results[0]
  const staff = (await api(desk, '/staff/?page_size=1')).results[0]
  const reports = (await api(desk, '/reports/')).map((r) => r.key)
  const adminPaths = [
    '/admin',
    '/admin/products',
    '/admin/products/new',
    product && `/admin/products/${product.id}`,
    product && `/admin/products/${product.id}/edit`,
    '/admin/inventory',
    '/admin/inventory/movements',
    '/admin/transactions',
    sale && `/admin/transactions/${sale.invoice_no}`,
    sale && `/admin/transactions/${sale.invoice_no}/receipt`,
    '/admin/returns',
    '/admin/returns/new',
    ret && `/admin/returns/${ret.number}`,
    '/admin/suppliers',
    supplier && `/admin/suppliers/${supplier.id}`,
    purchase && `/admin/suppliers/purchases/${purchase.number}`,
    '/admin/staff',
    staff && `/admin/staff/${staff.id}`,
    '/admin/reports',
    ...reports.map((key) => `/admin/reports/${key}`),
    '/admin/settings',
    '/admin/does-not-exist',
  ].filter(Boolean)
  for (const path of adminPaths) await visit(desk, path)

  // A dialog open: the settings confirmation, cancelled without saving.
  await desk.goto(`${BASE}/admin/settings`)
  await settle(desk)
  await desk.getByRole('radio', { name: /Include GST|Exclude GST/ }).and(desk.locator(':not(:checked)')).focus()
  await desk.keyboard.press('Space')
  await desk.getByRole('button', { name: 'Save pricing rules' }).click()
  await desk.getByRole('dialog').waitFor()
  // Radix hides the page behind an open dialog, h1 included.
  await audit(desk, '/admin/settings (confirmation open)', { settled: true })
  await desk.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

  // Admin, phone
  const phone = await newPage(browser, { width: 360, height: 780 })
  await signIn(phone, ADMIN)
  const mobilePaths = [
    '/admin/mobile',
    '/admin/mobile/inventory',
    '/admin/mobile/inventory/movements',
    '/admin/mobile/bills',
    sale && `/admin/mobile/bills/${sale.invoice_no}`,
    '/admin/mobile/more',
    '/admin/mobile/suppliers',
    '/admin/mobile/purchases',
    '/admin/mobile/returns',
    ret && `/admin/mobile/returns/${ret.number}`,
    '/admin/mobile/staff',
    staff && `/admin/mobile/staff/${staff.id}`,
    '/admin/mobile/reports',
    '/admin/mobile/reports/sales-summary',
    '/admin/mobile/settings',
    '/admin',
    '/admin/reports/sales-summary',
    '/admin/settings',
  ].filter(Boolean)
  for (const path of mobilePaths) await visit(phone, path, { phone: true })

  // Cashier: the till and the 403 page.
  const till = await newPage(browser, { width: 1280, height: 860 })
  await signIn(till, CASHIER)
  await visit(till, '/billing')
  await visit(till, '/403')
  const tillPhone = await newPage(browser, { width: 360, height: 780 })
  await signIn(tillPhone, CASHIER)
  await visit(tillPhone, '/billing', { phone: true })
} finally {
  await browser.close()
}

console.log(failures.length ? `\n${failures.length} page(s) failed` : '\nEvery page passed')
process.exit(failures.length ? 1 : 0)
