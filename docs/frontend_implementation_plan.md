# LoomDesk POS: Frontend Implementation Plan

**Status:** All decisions approved on 20 Oct 2026 (see §8). **Phases 0–2 are complete** (see §9).
**Inputs:**
- `reference/loomdesk-ui-reference.html`: the primary visual reference.
- `docs/loomdesk_pos_ui_design_plan_v2.md`: the implementation guideline, referred to below as "the spec".

**Stack:** React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Lucide React and Recharts on the frontend. Django REST Framework and PostgreSQL on the backend.

> **How to read the prototype's CSS.** The prototype applies five CSS layers in order. The third layer (`loomdesk-elevated-design`) briefly switched the palette to green and the sidebar to a light colour. The fourth layer (`loomdesk-final-corrections`) explicitly *restores* the navy and blue brand. The fifth layer (`loomdesk-grid-and-blue-chart-fixes`) recolours the charts blue. **Every token below is taken from the final computed result, meaning layers 4 and 5.** Values that appear only in layer 3 are discarded.

---

## 0. Inconsistencies found

Items marked **Approved** were decided by the user on 20 Oct 2026 (see §8). Every other item has a resolution that follows the spec's rules.

### Visual

| # | Prototype (final layer) | Spec | Proposed resolution |
|---|---|---|---|
| V1 | Manrope (layer 3 used DM Sans) | Inter / system sans | Use **Manrope**, as you requested. Drop DM Sans and Inter. |
| V2 | Radii of 15 px (catalog cards), 16 px (KPI cards), 17 px (panels and cart) and 20 px (KPI track) | 8–12 px, applied consistently | **Approved.** Keep the prototype's radii, since they define its character, but reduce them to **3 named steps**: 9 (controls), 15 (cards), 17 (panels). The 20 px KPI track goes away (see V4). |
| V3 | Many labels at 9–10 px: SKU tag 9, KPI footer 10, panel subtitle 10, cart footnote 10, sum rows 11 | Hints 11–12 px minimum; tables 12–13 px | **Approved.** Raise the floor to **11 px** for any visible text, and to 12 px for table cells. Bigger values and titles stay as they are. This is a small density change. |
| V4 | `.kpi-grid` has a tinted gradient "track" behind the KPI cards. The prototype's own comment says *"no wide tinted track behind them"* yet sets one anyway. | Avoid decorative backgrounds | **Approved.** Remove the track and separate the cards with whitespace only. |
| V5 | Table row hover is `#fafcf9`, a green tint left over from layer 3 | Neutral palette | Change it to `#f8f9fc`, the table header surface. |
| V6 | Glyphs and emoji: `▦` on the store icon, `↗` on the help card, `↑` in the mobile KPI trend, and per-product emoji (`👔`, `👖`…) used as image fallbacks | Lucide icons, real photography | Replace every glyph with Lucide (`Store`, `ArrowUpRight`, `TrendingUp`). The image fallback becomes a neutral `ImageOff` placeholder. |
| V7 | Product photos are Unsplash hotlinks. Two products share one photo (`photo-1714143136372…` is used twice). | Real photography | Download the seed photos into the backend's media storage so the app doesn't hotlink them. Give each product a distinct photo. In production, store owners upload their own images. |
| V8 | The billing topbar shows **"Mobile admin"** and **"Admin portal"** buttons to a user whose role is *Cashier* | Don't expose admin destinations to cashiers | Render those links only for roles that can access admin. |
| V9 | `Settings` exists as a page but is missing from the desktop sidebar `nav` array | Settings is item 9, a supporting area | Add it to a separate "Setup" group at the bottom of the sidebar. |
| V10 | The mobile admin is a phone-frame **overlay** inside the desktop page | A real route at `/admin/mobile/` | Build real routes (see §2). The phone frame itself is not built. |
| V11 | Page title is "Reports" in the nav and "Reports & insights" in the heading | "Reports & insights" / "Ledger and reports" | Use "Reports" in the nav and "Reports & insights" as the page heading. Never say "ledger" unless proper double-entry accounting exists. |

### Business logic

These can't be carried over from the prototype.

| # | Prototype | Spec / correct behaviour | Resolution |
|---|---|---|---|
| B1 | **Discount is subtracted after tax**: `total = subtotal + 5% tax on the full subtotal − discount` | The spec shows discounts and tax explicitly. Indian GST applies to the post-discount value. | Calculate in this order: line totals → discount → taxable value → tax → grand total. Server-authoritative. |
| B2 | A flat **5% tax** on the whole cart | The spec calls the 5% illustrative and says to snapshot tax details per line | Store a **tax rate on each product**, configurable per product or category, and snapshot it on each sale line. Rates are set out in §8.1. |
| B3 | Stock is kept **per product**, with sizes and colours as plain lists | Size and colour are stock-tracked variants | `Product` holds many `Variant`s, each with its own SKU, barcode, optional price override and stock. |
| B4 | Stock edits mutate `p.stock` directly (the prototype's own toast admits this) | Every change creates a stock movement | `StockMovement` is the only way stock changes. On-hand quantity is derived or kept in sync by the server. |
| B5 | Refund amounts are **hardcoded by product name** (`Towel ? 449 : …`) | Refund comes from the original line values | The server calculates refunds from the snapshotted sale line and any discount allocated to it. |
| B6 | A return **mutates the sale's status** to "Refunded" | The original sale stays immutable | Sales store their own status (Completed or Voided). The return state (None / Partially returned / Returned) is **derived** from return records and shown alongside. |
| B7 | Payments are "Cash / UPI / Card" with completion faked locally | Payment honesty | Record payments as **manually confirmed**, with a cashier-entered reference for UPI and card. Label them "Recorded by cashier, not gateway-verified". No gateway integration. |
| B8 | Any user can apply a discount | The spec has an optional Senior-cashier approval | **Approved.** Cashiers can discount up to 10% of the bill. Anything above that needs a Senior cashier or Admin PIN, and the server enforces it (§8.2). |
| B9 | Customers can be attached at checkout, but neither file has a customer module | Transactions are searchable by customer | Add a minimal `Customer` model (name and phone) with lookup and quick-create from billing. There's no admin customers page. **Approved.** |
| B10 | Supplier `due` is a plain stored field | The balance is derived from purchases and payments | Add `SupplierPurchase` and `SupplierPayment` entries, with simple "Record purchase" and "Record payment" forms on the supplier profile. Purchase *ordering* stays out of scope. **Approved.** |
| B11 | The receipt preview is a placeholder with no line items | Full thermal receipt with a print stylesheet | Build the complete receipt from the stored invoice. |

### Files and naming

| # | Issue | Resolution |
|---|---|---|
| F1 | Your brief references `reference/loomdesk-ui-reference.html`. The file was `referance/loomdesk_pos_ui_referance.html`, and the spec §11 called it `loomdesk_pos_ui_demo.html`. | **Done.** Renamed to `reference/loomdesk-ui-reference.html`, and the spec now refers to it by that name. |
| F2 | Django's built-in admin mounts at `/admin/` by default, which **collides** with the SPA's `/admin/*` and `/admin/mobile/` routes | Mount the Django admin at `/django-admin/` and the API at `/api/v1/`. Everything else falls through to the SPA. |
| F3 | The spec recommends shadcn/ui, but your library list doesn't include it | Don't use shadcn/ui. See §6.3 for the minimal primitives I propose instead. |

---

## 1. Implementation plan

Each phase ends in something that can be demoed. The backend and frontend for a module ship together, following the spec's order in §10. The big change from that order is that billing comes early.

> **Renumbered on 20 Oct 2026 (the user's call):** Products was built as **Phase 3**, ahead of Billing, and Billing became **Phase 4**. **Phase 5** covered Transactions and an initial sales summary only; voids and Returns are not yet scheduled. **Phase 6** is the Inventory module: stock levels, adjustments and movement history from row 4. **Phase 7** is Suppliers and Purchasing (the supplier half of row 6); Staff and Overview/Reports are not yet scheduled. **Phase 8** is the mobile admin for the modules built so far. **Phase 9** is deployment and production readiness only; row 9's accessibility and visual hardening pass is not yet scheduled. **Phase 10** is security hardening: the PIN race, the Django admin sign-in limit and a Content-Security-Policy. **Phase 11** completes the assignment: voids and returns, staff, settings, reports and the Overview, their mobile pages, and the accessibility and visual pass (rows 5–7 and 9, without deployment). The table below keeps the original plan for reference; §9 logs the order actually built.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundations** | Scaffold Vite, set up the Tailwind theme from §4's tokens, load Manrope and wire the providers (Router, QueryClient). Scaffold Django: settings, Postgres, apps, session auth, OpenAPI schema. Generate TS types from the schema. Add seed data (products with variants and photos, staff, suppliers). | `npm run dev` and `manage.py runserver` both work. Login works. The typed API client compiles against the generated schema. |
| **1. Design system** | Build the shared primitives from §3.4, a `/dev/ui` showcase route (dev builds only), and loading, empty, error and permission states. | Every primitive renders in all its variants. A keyboard pass on Dialog, Select and Menu passes. |
| **2. Shells and routing** | `AdminLayout` (sidebar, topbar, the 820 px collapsed rail), `BillingLayout` and `MobileAdminLayout`. Route guards by role. 403 and 404 pages. SPA fallback in Django. | Every route in §2 resolves, including a direct load and a refresh of `/admin/mobile/`. Cashiers are redirected away from `/admin`. |
| **3. Billing** | Catalog search and barcode, category chips, variant picker, bill panel, discount, customer attach, payment dialog, success screen, receipt print. Server: catalog read API, `POST /sales/` with an idempotency key, stock decrement and movements in one transaction. | The billing checklist in §7 passes. |
| **4. Products and Inventory** | List, filters, product form with `VariantEditor`, product detail, stock adjustment with preview, movement history. | This sets the list, form and detail patterns that the remaining modules reuse. |
| **5. Transactions and Returns** | Transaction list and detail (invoice layout), void with reason, `ReturnWizard`, return list and detail. | Return eligibility and refund amounts are computed by the server. |
| **6. Suppliers and Staff** | Supplier list, profile, statement, and purchase and payment entries. Staff list, invite and edit, deactivate. | Balances are derived. Role changes take effect in the API. |
| **7. Overview and Reports** | KPI row, sales trend (Recharts), payment-method breakdown, recent bills, low stock. Report library and report workspace with CSV export. | Every figure comes from the API, and metric definitions are shown. |
| **8. Mobile admin** | The full `/admin/mobile/*` tree from §2, reusing the feature hooks with mobile row and card components. | The mobile checklist in §7 passes at 360×800 and 390×844. |
| **9. Hardening** | Accessibility pass, reduced motion, long-text and large-number tests, a final visual consistency pass, deployment. | All of §7 passes on the deployed site. |

---

## 2. Route map

Every route is a client route under one SPA. Django serves `index.html` for any path that doesn't match `/api/`, `/django-admin/`, `/static/` or `/media/`, so direct loads and refreshes always work.

### Public
| Path | Page | Notes |
|---|---|---|
| `/login` | `LoginPage` | After login, admins go to `/admin` and cashiers go to `/billing` |
| `/` | redirect | Sends users to their role's home |

### Billing portal (Cashier, Senior cashier, Admin)
| Path | Page |
|---|---|
| `/billing` | `CheckoutPage`. Steps (variant, payment, success) are dialogs, not routes, so no navigation happens during a bill. |
| `/billing/receipt/:invoiceNo` | `ReceiptPage`: a print-optimised view used for print and reprint |

### Admin desktop (Admin)
| Path | Page |
|---|---|
| `/admin` | `OverviewPage` (`?from=&to=`) |
| `/admin/products` | `ProductListPage` (`?q=&category=&stock=&status=&page=`) |
| `/admin/products/new` | `ProductFormPage` |
| `/admin/products/:id` | `ProductDetailPage` |
| `/admin/products/:id/edit` | `ProductFormPage` |
| `/admin/inventory` | `InventoryPage` (`?q=&category=&state=&status=&sort=&page=`); the adjustment form is a dialog |
| `/admin/inventory/movements` | `StockMovementsPage` (`?q=&variant=&type=&from=&to=&page=`) |
| `/admin/transactions` | `TransactionListPage` (`?q=&from=&to=&method=&cashier=&status=`) |
| `/admin/transactions/:invoiceNo` | `TransactionDetailPage` |
| `/admin/returns` | `ReturnListPage` |
| `/admin/returns/new` | `ReturnWizardPage` (`?invoice=` to prefill from a transaction) |
| `/admin/returns/:returnNo` | `ReturnDetailPage` |
| `/admin/suppliers` | `SupplierListPage` |
| `/admin/suppliers/:id` | `SupplierProfilePage` (sections, not tabs; see the Phase 7 log) · `/new`, `/:id/edit`, `/:id/purchases/new` |
| `/admin/suppliers/purchases/:purchaseNo` | `PurchaseDetailPage` (receive, edit, cancel) · `/edit` |
| `/admin/staff` | `StaffListPage`; add and edit are dialogs |
| `/admin/reports` | `ReportLibraryPage` |
| `/admin/reports/:reportKey` | `ReportWorkspacePage` (`?from=&to=&…`) |
| `/admin/settings` | `SettingsPage` |

### Mobile admin (Admin): the mandatory `/admin/mobile/`
| Path | Page | Bottom tab |
|---|---|---|
| `/admin/mobile/` | `MobileOverviewPage` | Overview |
| `/admin/mobile/inventory` · `/inventory/:variantId` · `/inventory/:variantId/adjust` · `/inventory/movements` | stock list, variant, two-step adjustment, ledger | Inventory |
| `/admin/mobile/bills` · `/bills/:invoiceNo` · `/bills/:invoiceNo/receipt` | bill list, detail and receipt reprint | Bills |
| `/admin/mobile/more` | `MobileMorePage` | More |
| `/admin/mobile/suppliers` · `/suppliers/:id` · `/purchases` · `/purchases/:number` | supplier list and profile; purchases and receiving | More (highlighted) |

Phase 8 changed this table: Inventory takes the Products tab (catalogue editing stays in the full admin, linked from More), and Returns, Staff, Reports and Settings get mobile routes when their modules are built.

### System
`/403` and `*` (404). There's also `/dev/ui`, which exists only in dev builds.

Query strings hold shareable state (filters, date range, tab), as the spec §7 asks. Dialogs, the cart and variant selection stay in local state.

---

## 3. Component hierarchy

```
<App>
 └─ <AppProviders>            QueryClientProvider · SessionProvider · ToastProvider
     └─ <RouterProvider>
         ├─ <LoginPage>
         ├─ <RequireRole roles=[cashier, senior, admin]>
         │   └─ <BillingLayout>                 BillingTopbar (brand · register/session · role-gated admin links · user)
         │       └─ <CheckoutPage>              BillProvider (current bill: lines, customer, discount)
         │           ├─ <CatalogArea>
         │           │   ├─ <BillingTitleRow>   title · RegisterChip
         │           │   ├─ <CatalogSearch>     SearchInput + ScanButton (keyboard-wedge barcode)
         │           │   ├─ <CategoryChips>
         │           │   └─ <ProductGrid> ── <CatalogCard> (ProductPhoto · SkuTag · ColorSwatches · price · stock · AddButton)
         │           ├─ <BillPanel>             sticky
         │           │   ├─ <CustomerRow> ── <CustomerPickerDialog>
         │           │   ├─ <BillLineList> ── <BillLine> (thumb · title · variant · QuantityControl · remove)
         │           │   └─ <BillSummary>       DiscountRow ── <DiscountDialog> · SummaryRows · Total · CheckoutButton
         │           ├─ <VariantPickerDialog>   OptionChips (size, colour) · stock · qty
         │           ├─ <PaymentDialog>         DueAmount · PaymentMethodPicker · CashReceived/ChangeDue · ReferenceInput
         │           └─ <CheckoutSuccessDialog> invoice no · Print receipt · New sale
         ├─ <RequireRole roles=[admin]>
         │   ├─ <AdminLayout>
         │   │   ├─ <AdminSidebar>  Brand · StoreSelector · NavGroup(Workspace) · NavGroup(Setup) · HelpCard · ProfileMenu
         │   │   ├─ <AdminTopbar>   Breadcrumb/eyebrow · PageTitle · GlobalSearch · IconButtons · UserChip
         │   │   └─ <Outlet/>       each page = <PageHeader> + feature components
         │   │        e.g. ProductListPage
         │   │             ├─ <PageHeader title action=<Button primary>Add product</Button>/>
         │   │             ├─ <FilterBar> SearchInput · Select× · ActiveFilterChips · Clear
         │   │             └─ <DataTable columns rows state>  → loading Skeleton / EmptyState / ErrorState slots
         │   └─ <MobileAdminLayout>  MobileHeader (brand · bell) · <Outlet/> · <MobileBottomNav>
         │        pages compose the same feature hooks with <MobileList> ── <MobileListRow>
         └─ <ForbiddenPage> · <NotFoundPage>
```

### 3.1 Layer rules
- **Pages** (`features/*/pages`) read route params and search params, call feature hooks, and compose components. They contain no fetch calls and no business rules.
- **Feature components** (`features/*/components`) get typed props and know their domain, for example `StockStatusBadge` maps a `StockState` to a badge.
- **UI primitives** (`components/ui`) know nothing about the domain and are styled only through tokens.
- **Hooks** (`features/*/api.ts`) wrap TanStack Query, and **lib** holds pure functions such as money formatting and bill preview maths.

### 3.2 Shared feedback primitives
`QueryBoundary` takes a query result and renders `Skeleton` while loading, `ErrorState` (with retry) on error, `EmptyState` when there's no data, and otherwise its children. Every panel that calls the API is wrapped in one, so a single failure stays inside its panel.

### 3.3 Feature components
These are the lists from spec §6, unchanged. Mobile adds `MobileProductRow`, `MobileBillRow`, `MobileKpiGrid`, `MobileMoreMenu` and `BottomSheet`.

### 3.4 Primitive inventory
`Button` (primary / secondary / ghost / danger, with `loading`), `IconButton` (requires `label`), `Input`, `Textarea`, `SearchInput`, `Select`, `Checkbox`, `RadioCards` (used for payment methods), `OptionChip`, `DateRangePicker`, `Badge` and `StatusBadge`, `Panel` with header and body, `SummaryCard` (KPI), `DataTable`, `Pagination`, `Dialog`, `BottomSheet`, `ConfirmActionDialog`, `Tabs`, `Menu`, `Tooltip`, `Toast`, `FieldError`, `Skeleton`, `EmptyState`, `ErrorState`, `MoneyValue`, `DateTimeValue`, `Avatar` and `ProductPhoto` (fixed aspect ratio, `object-contain` on white, `ImageOff` fallback).

---

## 4. Design tokens

All values come from the prototype's final layer except where §0 says otherwise. They're defined as CSS custom properties in `src/styles/tokens.css` and exposed to Tailwind via `@theme`, so Tailwind's default palette is never used directly.

### 4.1 Colour
| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#F5F7FB` | App workspace |
| `--color-surface` | `#FFFFFF` | Panels, cards, inputs |
| `--color-surface-muted` | `#F8F9FC` | Table header, row hover, summary tiles |
| `--color-surface-tint` | `#F8FAFF` | Customer row, payment total |
| `--color-ink` | `#172337` | Titles, totals |
| `--color-ink-2` | `#26364E` | Panel titles, primary cell text |
| `--color-ink-3` | `#45536A` | Table body text |
| `--color-muted` | `#778297` | Descriptions, metadata |
| `--color-muted-2` | `#8290A5` | Hints, captions. Verify its contrast at 11 px. It may need darkening to `#6B7790` to reach AA. |
| `--color-line` | `#E7EBF2` | Default border |
| `--color-line-strong` | `#E0E6F0` | Control borders |
| `--color-line-soft` | `#F0F2F7` | Inner dividers |
| `--color-primary` | `#3159D9` | Primary CTA, active chip, links, chart line |
| `--color-primary-hover` | `#274AC2` | |
| `--color-primary-soft` | `#EDF2FF` | KPI icon, add button, count pill |
| `--color-primary-border` | `#DBE4FB` | Soft primary button borders |
| `--color-focus` | `#9DB5FF` | 3 px focus ring, 2 px offset |
| `--color-navy` | `#17243A` | Sidebar background |
| `--color-navy-2` | `#202F48` | Store selector, help card |
| `--color-navy-3` | `#253650` | Nav hover |
| `--color-navy-active` | `#2E4C91` | Active nav, plus a 3 px inset `#83A0FF` |
| `--color-navy-text` | `#A5B2C8` | Inactive nav text |
| `--color-success` / `-bg` | `#168765` / `#E9F7F1` | Paid, active, completed |
| `--color-warning` / `-bg` | `#A96A12` / `#FFF5E4` | Low stock, pending |
| `--color-danger` / `-bg` | `#C44E58` / `#FFF0F1` | Errors, out of stock, void |
| `--color-neutral-badge` | `#EEF1F6` / `#5C6B82` | Refunded, inactive |
| Chart series | `#3159D9`, `#8BA1EE`, `#D1DBFF`, `#E7ECF6` | Donut and series order |

### 4.2 Typography
The font is **Manrope** (weights 400, 500, 600, 700 and 800), self-hosted with `@fontsource/manrope`. The fallback stack is `ui-sans-serif, system-ui, "Segoe UI", sans-serif`. Use `font-variant-numeric: tabular-nums` on all money and quantities.

| Role | Size / line height | Weight | Tracking |
|---|---|---|---|
| Page heading (h2) | 24 / 32 desktop, 20 / 28 mobile | 700 | −0.75 px |
| Topbar title | 15 / 22 | 650 | 0 |
| Grand total, KPI value | 25 / 30 (22 on mobile) | 700 | −0.75 px |
| Catalog price | 16 / 22 | 700 | −0.45 px |
| Panel / dialog title | 14 / 20 (panel 13) | 700 | −0.3 px |
| Body / control text | 13 / 20 | 450–500 | 0 |
| Table cell | 12 / 18 (main cell 600) | 450 / 600 | 0 |
| Table header | 11 / 16, uppercase | 600 | +0.45 px |
| Label, caption, hint | **11** / 16 (floor) | 450–500 | 0 |
| Nav item | 13 / 20 | 600 active 650 | 0 |
| Eyebrow / nav caption | 11 / 16, uppercase | 650 | +1 px |

Manrope supports variable weights, so the fractional weights (450, 550, 650, 750) render with the variable font file.

### 4.3 Radius, elevation, spacing, motion
| Token | Value | Applies to |
|---|---|---|
| `--radius-sm` | 6 px | SKU tag, small badges |
| `--radius-control` | 9–10 px | Buttons, inputs, selects, chips, nav items, quantity buttons |
| `--radius-card` | 15 px | Catalog cards, KPI cards, mobile panels (prototype uses 14 on mobile, unified to 15) |
| `--radius-panel` | 17 px | Panels, cart panel, dialogs |
| `--shadow-card` | `0 2px 7px rgba(23,36,58,.025)` | Cards at rest |
| `--shadow-card-hover` | `0 7px 18px rgba(35,60,130,.07)` plus a −2 px lift | Catalog card hover only |
| `--shadow-panel` | `0 3px 14px rgba(23,36,58,.025)` | Panels |
| `--shadow-overlay` | `0 14px 38px rgba(23,36,58,.07)` | Dialogs, menus, toasts |
| `--shadow-primary` | `0 4px 10px rgba(49,89,217,.13)` | Primary button |
| Spacing | 4 px base: 4, 8, 12, 16, 20, 24, 32 | The prototype's odd values (13, 17, 19) round to the nearest step |
| Page padding | 28 desktop / 22 ≤1120 / 16 ≤820 / 12 ≤560 | `main` |
| Panel padding | 18–20 | Header `18 20 16`, body `0 20 18` |
| Motion | 150 ms ease-out (120–180 range) | Hover, popover, dialog; switched off under `prefers-reduced-motion` |

### 4.4 Layout constants and breakpoints
These are custom Tailwind `screens` taken from the prototype, not Tailwind's defaults.

| Token | Value |
|---|---|
| `sm` (phone) | ≤560 px |
| `md` (tablet, sidebar collapses to a 70 px rail) | ≤820 px |
| `lg` (compact desktop) | ≤1120 px |
| Sidebar | 238 px, or a 70 px rail at ≤820 |
| Topbar | 72 px, or 62 px on phone |
| Billing grid | `1fr 360px`, then `1fr 340px` at ≤1120, then a single column at ≤820. Max width 1580. |
| Catalog grid | 3 columns at ≥561 px, 2 columns at ≤560, 16 px gap (10 px on phone) |
| Catalog image | 130 px tall (122 / 125 / 112 at the breakpoints), `object-contain`, white, padding `15 42 12` |
| Touch target | ≥44 px for frequent mobile actions |

---

## 5. Folder structure

```
loomdesk/
├─ CLAUDE.md
├─ docs/                         spec + this plan
├─ reference/                    prototype HTML (loomdesk-ui-reference.html)
├─ frontend/
│  ├─ index.html
│  ├─ vite.config.ts             proxies /api and /media to Django in dev
│  ├─ src/
│  │  ├─ main.tsx
│  │  ├─ app/
│  │  │  ├─ App.tsx              providers + <RouterProvider> only
│  │  │  ├─ router.tsx           route table (lazy-loaded feature pages)
│  │  │  ├─ providers.tsx
│  │  │  └─ guards.tsx           RequireAuth, RequireRole
│  │  ├─ layouts/
│  │  │  ├─ admin/               AdminLayout, AdminSidebar, AdminTopbar
│  │  │  ├─ billing/             BillingLayout, BillingTopbar
│  │  │  └─ mobile/              MobileAdminLayout, MobileHeader, MobileBottomNav
│  │  ├─ components/
│  │  │  ├─ ui/                  domain-free primitives (§3.4)
│  │  │  └─ feedback/            QueryBoundary, EmptyState, ErrorState, Skeleton, Forbidden
│  │  ├─ features/
│  │  │  ├─ auth/                api.ts, session context, LoginPage
│  │  │  ├─ catalog/             products + variants: api.ts, types.ts, components/, pages/, mobile/
│  │  │  ├─ inventory/
│  │  │  ├─ billing/             BillProvider, bill reducer, components/, pages/
│  │  │  ├─ transactions/
│  │  │  ├─ returns/
│  │  │  ├─ suppliers/
│  │  │  ├─ staff/
│  │  │  ├─ reports/             incl. overview
│  │  │  └─ settings/
│  │  ├─ lib/
│  │  │  ├─ http.ts              fetch wrapper: CSRF, JSON, ApiError normalisation
│  │  │  ├─ money.ts             paise ↔ display, INR formatting
│  │  │  ├─ dates.ts
│  │  │  ├─ billPreview.ts       pure, unit-tested preview maths (mirrors server rules)
│  │  │  └─ queryKeys.ts         central key factory for invalidation
│  │  ├─ types/
│  │  │  ├─ api.gen.ts           generated from OpenAPI — never hand-edited
│  │  │  └─ domain.ts            UI-facing aliases/enums (Role, StockState, PaymentMethod…)
│  │  └─ styles/
│  │     ├─ tokens.css           §4 custom properties
│  │     ├─ index.css            Tailwind entry, @theme mapping, base styles
│  │     └─ print.css            receipt print stylesheet
│  └─ tests/                     Vitest + Testing Library (unit/component), Playwright (e2e, mobile viewports)
└─ backend/
   ├─ manage.py
   ├─ config/                    settings/{base,dev,prod}.py, urls.py (api/v1, django-admin, SPA fallback)
   ├─ apps/
   │  ├─ accounts/               User + Role, session auth endpoints, permissions
   │  ├─ store/                  StoreSettings, Register, tax configuration
   │  ├─ catalog/                Category, Product, Variant, ProductImage
   │  ├─ inventory/              StockMovement (+ on-hand maintenance)
   │  ├─ customers/              Customer
   │  ├─ sales/                  Sale, SaleLine (snapshots), Payment, idempotency, void
   │  ├─ returns/                Return, ReturnLine, Refund
   │  ├─ suppliers/              Supplier, SupplierPurchase, SupplierPayment
   │  ├─ reports/                read-only aggregate endpoints + CSV export
   │  └─ audit/                  AuditLog
   ├─ seed/                      management command + product photos
   └─ tests/                     pytest-django
```

---

## 6. Frontend/backend integration

### 6.1 Contract
- **REST under `/api/v1/`**. The DRF schema is generated by `drf-spectacular`, and `openapi-typescript` generates `types/api.gen.ts` from it. *Why add these:* a single source of truth for the contract, so a backend change that breaks the frontend fails at compile time instead of during the demo. Both are dev-time tools only and add nothing to the bundle.
- **Money** travels as **integer paise** (`"total_paise": 284800`). Never use floats. Display formatting lives only in `lib/money.ts`. Quantities are integers.
- **Errors** follow one envelope, `{ "detail": str, "code": str, "fields": { field: [msg] } }`. `lib/http.ts` turns it into an `ApiError`, and forms map `fields` to inline `FieldError`s.
- **Lists** use `?page=&page_size=` and return `{ results, count, next, previous }`. Filters mirror the frontend query string names.

### 6.2 Auth and permissions
- **Django session auth with CSRF**, served from the same origin. In dev, the Vite proxy makes it same-origin too. *Why not JWT:* no token storage in JS and no refresh logic, which is simpler and safer for a browser-only app.
- `GET /api/v1/auth/me/` returns the user, role and permission flags. The `SessionProvider` caches it, and both route guards and role-gated UI read it.
- Every gated UI element has a matching DRF permission class. The UI hides things for convenience; the API enforces them. A 403 renders `ForbiddenState`, and a 401 redirects to `/login?next=`.

### 6.3 Server state (TanStack Query)
- There's one `api.ts` per feature with `useXList`, `useX` and `useCreateX` hooks, keyed through `lib/queryKeys.ts`.
- **Invalidation after mutations:**

| Mutation | Queries to invalidate |
|---|---|
| Sale | transactions, catalog stock, inventory, overview and reports |
| Return | returns, the related transaction, inventory, overview and reports |
| Stock adjustment | inventory, movements, catalog stock |
| Supplier entry | that supplier, the supplier list |
| Staff role change | staff, plus `auth/me` if it's the current user |

- **No optimistic updates** on financial or stock mutations. They're only allowed on low-risk toggles like UI preferences, if any exist.
- `staleTime` is short (30 s) for catalog stock in billing and longer (5 min) for reference data like categories and settings.

### 6.4 Billing data flow
1. Catalog search calls `GET /billing/products/?q=&category=` (it also matches exact barcodes and variant SKUs) and returns active products with their sellable variants, stock and current price. *(Built in Phase 4; see §9.)*
2. The bill is **local state** (`BillProvider` with a reducer), saved to `sessionStorage` so an accidental refresh doesn't lose the cart.
3. ~~`lib/billPreview.ts`~~ **Changed in Phase 4:** the bill panel shows `POST /sales/quote/`, the server pricing the bill with the same code checkout uses. No tax maths is duplicated in the browser.
4. Checkout calls `POST /sales/` with an `Idempotency-Key` header, a UUID created when the payment dialog opens. The server rechecks stock and prices, recalculates every total, writes Sale, Lines (snapshots), Payment and StockMovements in **one DB transaction**, and returns the authoritative invoice. Checkout sends the total the cashier confirmed (`expected_total_paise`); if the server's total differs, nothing is saved (409 `total_changed`) and the bill re-prices for the cashier to confirm again.
5. While the request is pending, the submit button is disabled. A retry with the same key returns the original sale instead of creating a duplicate.

### 6.5 Images
`Product.image` (one photo per product for now) uses Django `ImageField` storage, served from `/media/` (an object store in production). The API returns site-relative URLs (`/media/products/…`), which the Vite proxy and Django both serve. Uploads go to `POST /catalog/products/{id}/image/` (JPEG, PNG or WebP, up to 5 MB, verified with Pillow, stored under the product SKU), and `DELETE` on the same path removes the photo. `ProductPhoto` enforces one treatment everywhere: `object-contain` on a white background, a fixed aspect ratio, lazy loading, and the `ImageOff` placeholder as the fallback.

### 6.6 New dependencies
None are added until you approve them.

| Package | Why | Alternative if not approved |
|---|---|---|
| `@fontsource/manrope` | Self-hosted font with no third-party request | Load Manrope from Google Fonts in `<link>` |
| `@radix-ui/react-dialog`, `-popover`, `-select`, `-tabs`, `-dropdown-menu` | Unstyled, accessible focus-trapping and keyboard behaviour, as spec §8 requires. Building these by hand is a common source of a11y bugs. | Build `Dialog`, `Menu` and `Select` by hand on top of `<dialog>` |
| `react-hook-form` + `zod` | Typed forms that keep values after server errors, and per-field errors | Controlled forms with a small `useForm` helper |
| `drf-spectacular`, `openapi-typescript` | Typed contract (see §6.1) | Hand-written TS types |
| `vitest`, `@testing-library/react`, `@playwright/test` | Unit tests for bill maths, and e2e tests at the mobile viewports | None. These are needed to verify §7. |
| Backend: `django-filter`, `django-cors-headers` (dev only, if not proxied), `pytest-django`, `Pillow` | Filtering, image fields, tests | n/a |
| Backend: `whitenoise` (Phase 9) | Serves the built SPA and admin assets with `DEBUG=False`, compressed and with far-future caching for hashed files, without a separate web server | A web server (nginx, Caddy) serving `STATIC_ROOT` in front of Django |
| Backend: `waitress` (Phase 9) | A production WSGI server that runs on Windows as well as Linux; `runserver` isn't for production | Gunicorn (Linux only) |
| `recharts` + its peer `react-is` (Phase 11, D6) | The trend chart named in this plan's stack. Lazy-loaded on the Overview and Reports only (its own ~350 kB chunk), so billing never loads it. It styles through presentation attributes and the CSSOM, so the CSP needs no change. | A hand-drawn SVG line |
| `@axe-core/playwright` (Phase 11, D11, dev only) | Automated WCAG 2.1 A/AA checks in a real browser (`npm run check:a11y`) | Manual review only |

---

## 7. Acceptance checklists

Every checklist assumes the cross-cutting checks pass:
- [x] Loading, empty, error (with retry) and permission-denied states all exist. *Per module tests mock each state; permission-denied is the `/403` redirect plus API 403s.*
- [x] Only Lucide icons are used. *Plus the woven brand mark.*
- [x] Tokens are used, with no raw hex values in components. *ESLint rejects raw hex in TS/TSX.*
- [x] Keyboard access and visible focus work. *Phase 11 browser checks: skip link, sortable headers by Enter and Space, Select and dialogs by keyboard, visible 3 px rings; axe finds no violations on 55 pages.*
- [x] Nothing overflows horizontally at 360 px. *Every mobile route and the desktop pages at 360 px, with stress data (Phase 11).*
- [x] Figures come from the API.

### Design system and shells
- [ ] Manrope loads everywhere, including inputs and buttons. No fallback flash on cached loads. *Phase 11 confirmed every visible control on 18 pages uses Manrope; the cached-load flash wasn't measured.*
- [x] The sidebar's active state matches the route, including nested routes (`/admin/products/12` highlights Products). *AdminShell tests.*
- [x] At ≤820 px the sidebar collapses to a rail with tooltips. At ≤560 px desktop admin hides the sidebar, and a link to `/admin/mobile/` is offered. *Browser check, Phase 11.*
- [x] Each visual group has at most one filled primary button. *Browser check over 18 admin pages, Phase 11.*
- [x] Dialogs trap focus, close on Esc (non-destructive dialogs only) and return focus to their trigger. *Including when Radix's timer lags (Phase 11).*
- [x] Cashiers can't reach `/admin/*`, either by URL or by API (403). They don't see admin links in the billing topbar. *Re-checked on the production server for every Phase 11 endpoint.*

### Billing
- [x] Search by name, SKU or barcode. A barcode scan plus Enter adds the item directly when it matches a single variant.
- [x] `/` focuses the search box. The no-results state has a "Clear search" action.
- [x] Category chips filter the results, and the count updates.
- [x] Out-of-stock variants show "Out of stock" as text and can't be added. Quantity can't exceed available stock.
- [x] The variant picker shows the stock for each size and colour combination.
- [x] The bill panel stays visible on desktop, and the total and CTA are always on screen.
- [x] An empty bill shows an empty state, and checkout is disabled.
- [x] The summary shows subtotal, discount, taxable value, tax and total, in the order from B1.
- [x] Discount respects the role limit (§8.2), and the server enforces it. *The approval PIN is checked inside `POST /sales/`; see the Phase 4 log for how this differs from §8.2.*
- [x] The payment dialog shows the amount due. For cash, an amount below the due blocks completion and change is calculated. UPI and card require a reference and are labelled "Recorded by cashier, not gateway-verified".
- [x] Double-clicking, retrying or refreshing during submit never creates two sales (tested with the idempotency key).
- [x] The success dialog shows the invoice number and offers Print receipt and New sale. The receipt prints without app chrome and includes line items, tax breakdown and payment.
- [x] Refreshing mid-bill keeps the cart.

### Overview
- [x] One date range drives every date-dependent panel and is shown as a visible label. *Last 7 store days by default, in `?from&to`.*
- [x] The KPIs are Net sales, Bills completed, Average bill and Low-stock variants, each with a definition tooltip. *The definition is a tooltip on an info button beside each label, with a short visible footnote under the figure.*
- [x] Comparisons appear only when comparison data exists. *No comparison is shown: there's no previous-period figure in the API yet.*
- [x] The trend chart (Recharts) uses a single blue line with faint gridlines and has a text summary or table alternative. *Both: a sentence under the chart and a "Show as table" toggle.*
- [x] If one panel fails, it shows its own retry state and the others still render.
- [x] Clicking a low-stock row opens inventory, and clicking a bill opens its transaction.
- [x] Before the first sale, a first-use empty state is shown.

### Products
- [x] Search and the filters (category, availability, stock state) are reflected in the URL. Active filters are shown with a Clear action.
- [x] The table shows Product (with photo), SKU, Category, Price, Stock (as text), Status and Actions. Long names wrap without clipping.
- [x] The form has sections for Info, Pricing & tax, Variants and Inventory. Errors are inline and values are kept after a server error.
- [x] Duplicate SKUs and barcodes are rejected by the server and the error is shown on the field.
- [x] Archiving requires confirmation. Editing a product doesn't change past invoices (verified on an existing sale). *Verified in Phase 4 by `test_receipt_matches_the_saved_sale_after_catalogue_and_store_changes`.*
- [x] Cost and margin are visible only to Admin. *The whole catalogue API is admin-only for now.*

### Inventory
- [x] The summary shows tracked variant, low-stock and out-of-stock counts.
- [x] The adjustment form has a variant, a type (add, remove or set counted), quantity and reason. A reason is required for remove and set. It previews current → resulting quantity before confirming. (Phase 6 requires a reason for every adjustment, including add.)
- [x] Negative stock is rejected by the server.
- [x] Every change appears in movement history with its type, delta, linked reference, actor, time and reason. Sale references link to the transaction, purchase receipts (`PUR-…`) to the purchase, and returns (`RET-…`) to the return.

### Transactions
- [x] Search by invoice number or customer, and filter by date, method, cashier and status. *Invoice number, date range, cashier, method and status (completed, voided, partly returned, returned) are built. Customer search is out of scope (D7): bills show "Walk-in".*
- [x] Amounts are right-aligned, and statuses use a consistent badge.
- [x] The detail page uses an invoice layout: lines, discounts, tax breakdown, payments with a "manually recorded" label, and linked returns.
- [x] There's no edit action. Voiding requires the permission, a reason and a confirmation, and creates an audit entry. *No edit action (the API returns 405). Voids are admin-only and limited to today's bills with no returns (D1, D2).*
- [x] Reprint works from the detail page.

### Returns
- [x] The wizard starts from an invoice (search or scan) and shows sold, already returned and eligible quantities for each line. *Typed or scanned into one field; it also starts from the transaction page.*
- [x] Quantity is capped at the eligible amount, by both the UI and the server. *Including simultaneous returns (PostgreSQL thread tests).*
- [x] The refund is calculated by the server from the original line values. The review step shows refund amount, method and disposition before confirming.
- [x] Items go back into stock only for the "sellable" disposition, as a movement record. *Damaged and inspection-hold items change no stock (D4).*
- [x] The original sale isn't changed. The transaction shows a derived "Partially returned" or "Returned" state and a link to the return.

### Suppliers
- [x] The list shows Name, Category, Contact, Recorded balance (labelled as such), Status and Actions. *Each row links to the profile, where the actions live.*
- [x] The profile has tabs for Activity, Purchases, Payments and Statement. The statement shows a running balance with references. *Built as sections on one page (details, figures, purchases, statement) because there's no Tabs component; payments appear in the statement, and there's no separate activity feed.*
- [x] The contact form has no balance field. Balances change only through purchase and payment entries.

### Staff and access
- [x] The list shows Name, Email, Role, Status and Last activity (only if tracked), with an Active/Inactive filter. *Last activity is the last sign-in.*
- [x] Adding a user uses an invite or set-password flow. Passwords are never displayed. *A one-time link, shown once and valid 3 days, handed over in person; no email is sent (D5).*
- [x] Changing a role or deactivating a user takes effect in the API immediately. Deactivated users keep their history. *Their open sessions stop working at once.*
- [x] Every role-gated UI element has a matching API permission test. *For the Phase 11 modules: returns, voids, staff, settings and reports (with export and valuation) each refuse cashiers and senior cashiers in tests, and were re-checked on the production server.*

### Reports
- [x] The library lists only reports that are actually implemented. *Ten, from the server's registry.*
- [x] Each report workspace has a date range, filters, a summary row, a chart only where it shows a trend, a sortable table and CSV export. *Stock reports take no dates. The table draws the first 500 rows of the chosen order, with "Show all"; the CSV has every row.*
- [x] Gross, discounts, returns and net are defined on screen. Unconfirmed payments are excluded, and the original transaction values are used. *Every payment is recorded, not confirmed, and says so; voided bills are excluded.*

### Settings
- [x] Store name, code and address (printed on receipts), plus register and tax defaults. Changing them doesn't affect past invoices. *One register, so there are no register settings (D9). The pricing rules are editable; GST rules are shown read-only (D10).*

### Mobile admin
- [x] `/admin/mobile/` and every sub-route work on a direct load, on refresh and with browser back.
- [x] The bottom nav (Overview, Inventory, Bills, More) shows the active state, and More is highlighted on its child pages. Inventory replaces Products (Phase 8).
- [x] Every admin section is reachable from More. There are no placeholders. *Returns, Reports, Staff & access and Settings joined in Phase 11, read-only, with links to the full admin for changes.*
- [x] Tables become card rows (primary label, metadata, and amount, status or action on the right).
- [x] Forms open as full-screen pages or bottom sheets with a reachable Close or Back.
- [x] Frequent actions are ≥44 px. Nothing overflows horizontally at 360×800 and 390×844 (Playwright).
- [x] A slow or failing request shows a retry state, never a blank screen.

### Final visual pass
- [x] Radii, shadows and spacing match the §4 tokens on every page. *Only token classes exist (the theme clears Tailwind's defaults); screenshots of every Phase 11 page were reviewed.*
- [x] Pages are tested with long product names, ₹10,00,000+ amounts, zero transactions and 500+ rows. *Injected through Playwright, with nothing written: ₹99,99,99,999.99 figures, 110-character names, 600 and 5,000 report rows; zero transactions in unit tests.*
- [x] All product photos use the same `ProductPhoto` treatment.

---

## 8. Decisions

| # | Decision | Status |
|---|---|---|
| 1 | V2 / V3 / V4: radii unified to 3 steps (9 / 15 / 17), an 11 px text floor (12 px in tables), no tinted KPI track | **Approved** |
| 2 | B2: GST rates. The user delegated this, and the rules are in §8.1. | **Approved** |
| 3 | B8: discounts above a limit need Senior cashier approval. The rules are in §8.2. | **Approved** |
| 4 | B9 / B10: a minimal Customer model, and supplier purchase and payment entries | **Approved** |
| 5 | F1: rename the reference file | **Done** |
| 6 | §6.6: which dependencies to add | **Approved** (all) |

### 8.1 GST rules (seed defaults)

These follow the GST rate rationalisation that took effect on **22 Sep 2025**:

| Category | HSN chapter | Rule |
|---|---|---|
| Shirts, Kurtas, Bottomwear, Dresses (ready-made garments) | 61 / 62 | **5%** if the per-piece taxable value is ≤ ₹2,500, **18%** above that |
| Home linen (towels, bed linen) | 63 | **5%** if the per-piece taxable value is ≤ ₹2,500, **18%** above that |
| Accessories (bags, totes) | 42 / 63 | **18%** flat. Treat this as a placeholder until the actual HSN code is confirmed. |

How the rules are applied:
- **The rule belongs to the category.** A category's `TaxRule` holds either a flat rate or a price-banded rate (threshold plus lower and upper rate). A product can override its category's rule. The rules live in a table, so an admin can correct them without a code change.
- **The rate is chosen per unit, after discount.** The slab threshold is tested against each unit's *taxable* value, which is the line price minus that line's share of any bill discount. A ₹2,700 shirt discounted to ₹2,400 falls in the 5% slab.
- **A bill discount is shared out across lines** in proportion to each line's value, so each line has its own taxable value. Any paise left over from rounding go to the largest line.
- **Prices exclude tax and GST is added at checkout**, which matches the prototype. Indian clothing shops usually display tax-inclusive MRP instead. Switching is a single setting (`StoreSettings.prices_include_tax`), and the bill-preview maths will support both from the start. The prototype's behaviour is the default until the user says otherwise.
- **Each sale line snapshots** its HSN code, rate, taxable value and tax amount. The receipt and tax summary report show CGST and SGST as half the rate each, since the store makes intra-state sales from Kozhikode, Kerala.
- **Every seeded product** costs less than ₹2,500, so the seed data all falls in the 5% slab. The test fixtures include items above ₹2,500 so the 18% path is exercised.
- These rates are seed defaults for a demo. They aren't tax advice and should be checked with the store's accountant before real use.

### 8.2 Discount approval

Discount limits by role:

| Role | Limit on bill discount |
|---|---|
| Cashier | Up to **10% of the bill subtotal**, with no approval needed |
| Senior cashier, Admin | Up to 100%, the whole subtotal |

How approval works:
- **The limit is configurable.** It's stored as `StoreSettings.cashier_discount_limit_pct`, default 10, and can be changed in Settings.
- **The approval flow.** When a cashier enters a discount above their limit, the discount dialog switches to "Approval required". A Senior cashier or Admin picks their name and enters their **approval PIN**. Each staff member's 4–6 digit PIN is set by an Admin and stored hashed, never shown.
  - The frontend calls `POST /api/v1/approvals/discount/` with `{approver_id, pin, discount_paise, subtotal_paise}`.
  - The server checks the PIN and the approver's role and limit. It returns an `approval_id` that's **single-use, expires after 5 minutes**, and is tied to that discount amount.
  - Wrong PINs are rate-limited: 5 attempts locks that approver's PIN for 15 minutes.
- **At checkout,** `POST /sales/` sends the discount and its `approval_id` when one is needed. The server rechecks the role limit, rejects an approval that is missing, expired, reused or for a different amount, and records the approver on the sale.
- **Audit.** Each approval writes an `AuditLog` entry with the cashier, approver, amount, percentage and invoice. The transaction detail page shows "Discount approved by …".
- **When an approval stops being valid:** if the bill changes after approval and the discount percentage goes up, for example because an item was removed, the approval no longer applies and the cashier is asked again.
- **Senior cashiers and Admins** working the register themselves apply discounts directly, but those discounts are still recorded in the audit log.

---

## 9. Phase log

### Phase 0: Foundations (done, 20 Oct 2026)

**Built:**
- **Django 5.2 LTS project:** split settings, the `/api/v1/` API with OpenAPI schema and Swagger docs, Django's admin at `/django-admin/`, and the SPA fallback.
- **Login API:** session auth with CSRF enforced, including on login. Endpoints are `auth/csrf`, `login`, `logout` and `me`. Login is limited to 10 attempts a minute.
- **Models:** User with roles and a hashed approval PIN, StoreSettings, TaxRule, Category, Product, Variant, StockMovement (through `record_movement`), Customer and Supplier.
- **Demo data:** the seed commands load staff, the GST rules, 9 products as 90 variants with EAN-13 barcodes and opening stock (every unit has a movement record), suppliers and customers.
- **Frontend:** Vite, React 19, Tailwind v4 tokens with the default theme cleared, self-hosted Manrope, React Router 7 with role guards, TanStack Query, the typed API client, money helpers, and the login page.

**Verified:**
- 23 pytest tests and 25 Vitest tests pass. `tsc`, `eslint` and `vite build` are clean.
- A live login through the Vite proxy works: CSRF rejection, generic bad-credential message, session, `/me`, media files, and a direct load of `/admin/mobile/`.

**Differences from the plan:**
- **One photo per product:** `Product.image` holds a single photo instead of a separate `ProductImage` model.
- **Placeholders:** Phase 2 replaces the `ScaffoldPage` placeholders.
- **Playwright** comes later, with the first e2e checks.
- **Pinned versions:** TypeScript 5.9, because `openapi-typescript` and `typescript-eslint` reject TS 6/7. `@hookform/resolvers` v5, because v6 has a broken peer dependency.
- **ESLint** comes from Vite's standard React/TS setup. It also bans raw hex colours in components.
- **P-1008 (Classic Chino)** has no photo. The prototype reused the denim photo for it, so it shows the placeholder until a distinct photo is added at `backend/seed/photos/P-1008.jpg`.

**Open finding: contrast (needs a decision).**
These prototype colours are below WCAG AA (4.5:1) for small text:
- `muted` `#778297` is 3.87:1 on white.
- `muted-2` `#8290A5` is 3.24:1.
- The success, warning and danger badge text is about 4.1:1 on its tinted background.

The nearest compliant shades keep the same hue and are only slightly darker:

| Token | Prototype | Proposed |
|---|---|---|
| `muted` | `#778297` | `#697285` |
| `muted-2` | `#8290A5` | merge into `muted` |
| `success` | `#168765` | `#157E5E` |
| `warning` | `#A96A12` | `#9F6411` |
| `danger` | `#C44E58` | `#BA4A54` |

**Resolved in Phase 1:** approved and applied (see below).

### Phase 1: Design system (done, 20 Oct 2026)

**Colour changes:**
- **Approved shades:** `muted` is now `#697285`. `success`, `warning` and `danger` are now `#157E5E`, `#9F6411` and `#BA4A54`.
- **`muted-2` removed:** placeholders use `muted`. `ink-disabled` (`#8290A5`) is kept only for disabled text, which WCAG exempts.
- **Focus ring:** the prototype's ring, `#9DB5FF`, was 2.0:1 against white. It's now `#6C86F5`, the brand gradient's start colour, at 3.30:1.
- **Brand colours:** primary `#3159D9` and navy `#17243A` are unchanged. Every pairing tested passes with them.

**Typography:** role utilities (`type-*`) cover page title, section, body, label, helper, caption, eyebrow, figure, amount and nav. The smallest text is 11px.

**Components:** Button, IconButton, Field, TextField, Textarea, SearchInput, Select (Radix), Menu (Radix), Card, KpiCard, DataTable with CellStack, StatusBadge, Dialog (Radix), ConfirmDialog, ToastProvider/useToast, Skeleton, InlineAlert, PageHeader, Form/FormSection/FormGrid/FormActions, MoneyValue, EmptyState and ErrorState. There's also a dev-only gallery at `/dev/ui`.

**Verified:**
- 88 Vitest tests pass, including 31 contrast checks in `tests/contrast.test.ts`. `tsc`, `eslint` and the production build are clean, and the gallery is excluded from the production bundle.
- Inspected in Chromium at 1440px, 1280px, 390px and 360px:
  - Keyboard: tab order, focus rings, Select, Menu, Dialog and ConfirmDialog.
  - Phones: dialogs become full-screen sheets, and nothing overflows horizontally.

**Bugs found and fixed in the browser:**
- **Page width:** the sr-only table caption widened the page at 360px.
- **Focus ring:** it faded in from the wrong colour.
- **Focus after closing:** focus fell to `<body>` after closing a dialog that had no `Dialog.Trigger`, or one opened from a menu.
- **Initial focus:** dialogs opened on the close button instead of the first field.

**Phase 1 cleanup (approved):**
- **Field boundaries:** a new `control-border` token (`#848EA0`) is used for text fields, textareas, selects and search fields. It measures 3.30:1 on white and 3.08:1 on bg. Hover darkens it to `muted`. Disabled fields keep the light line, which WCAG exempts. Cards, dividers and buttons are unchanged.
- **Session check:** the app's startup check now calls `GET /auth/session/`, which returns 200 with `{user: null}` when nobody is signed in. Before, an anonymous `/auth/me/` request logged a 403 on every signed-out page load.
- **Wrong password:** it now returns 400 `invalid_credentials`. Before, it returned 403, the same status as a CSRF rejection.
- **Security unchanged:** CSRF on login, the 10/min login throttle and protection on `/auth/me/` all still apply, and tests cover them.

**Open:**
- **Bundle size:** the JS bundle is 485 kB (152 kB gzipped). Route-level lazy loading arrives with the feature pages.

### Phase 2: Admin application shell (plan, approved 20 Oct 2026)

**Scope:** `AdminLayout` for `/admin/*`. Billing and mobile shells are separate phases. No feature pages. Every admin route renders an in-shell placeholder until its phase.

**Visual reference:** the prototype's `.sidebar`, `.topbar` and `.main-content`, from layer 1 as corrected by layer 4. Values come from existing tokens. Prototype sizes below the approved floor (9–10px captions) are raised to 11px.

**Files**
- `layouts/admin/AdminLayout.tsx`: a flex shell with the sidebar, then a workspace column holding the topbar and `<main id="main">`. Adds a "Skip to content" link.
- `layouts/admin/AdminSidebar.tsx`:
  - Navy, 238px wide, 215px at ≤1120 and a 70px icon rail at ≤820.
  - Brand, then the store card, then the Workspace group, then a new Setup group (Settings, fixing V9), then the profile block.
- `layouts/admin/AdminTopbar.tsx`:
  - Sticky, 76px tall (68px at ≤820, 62px at ≤560), white at 96% opacity with a bottom line.
  - Left: the eyebrow ("Loom & Linen / Workspace") and the section name.
  - Right: "Mobile view" (secondary), "Open billing" (primary), a separator, then the user chip.
- `layouts/admin/UserMenu.tsx`: the user chip (avatar, name, role) opens a `Menu` with the name and email, then "Sign out". The sidebar's profile button opens the same menu.
- `layouts/admin/AdminNavDrawer.tsx`: phone navigation (see decision 1).
- `layouts/admin/adminNav.ts`: the typed nav config (`{to, label, icon, group}`). It's the single source for the sidebar, rail tooltips, drawer and topbar titles.
- `features/admin/AdminPlaceholderPage.tsx`: a `PageHeader` plus an `EmptyState` saying when the module arrives. It replaces `ScaffoldPage` for admin.

**Behaviour**
- **Active state:**
  - Uses `NavLink`; Overview uses `end` so it matches only `/admin`. Nested routes stay active, so `/admin/products/12` highlights Products.
  - Active styling: `navy-active` background, a 3px inset `navy-indicator` bar and `aria-current="page"`.
- **Headings:**
  - The topbar's section name is plain text, not a heading. Each page's `PageHeader` provides the only `<h1>`; the prototype has two competing headings.
  - `document.title` is "<Page> · LoomDesk", taken from a route `handle`.
- **Rail (561–820px):**
  - Labels, captions and the profile text are hidden.
  - Each item keeps an `aria-label` and gets a tooltip on hover and focus.
  - The topbar user chip shows only the avatar.
- **Phones (≤560px):** the sidebar is hidden and a menu button appears at the left of the topbar (see decision 1). "Mobile view" stays visible as a link to `/admin/mobile/`.
- **Loading:**
  - The session check keeps using the existing `PageLoader` before the shell exists.
  - After that, the shell stays mounted. Route chunks are lazy-loaded, with a skeleton fallback inside `<main>` only, so navigation never blanks the sidebar.
  - A chunk-load failure shows `ErrorState` with a retry, again inside `<main>`.
- **Access denied:**
  - Non-admins keep being redirected to `/403` by the existing `RequireRole`; the guard is unchanged.
  - An unknown `/admin/...` path shows a not-found state inside the shell rather than a full-page 404.
- **Sign out:** calls the existing `useLogout`, which clears the cache, then goes to `/login`. A failure shows a toast.
- **Bundle:** admin routes are lazy-loaded, which also starts reducing the 485 kB bundle.

**Backend (small, read-only):** add `GET /api/v1/store/`, readable by any signed-in staff member. It returns `{name, code, state}` for the sidebar store card, so the store name isn't hardcoded. Includes tests and a schema regeneration.

**Not built, because they would be fake controls:**
- Global search and its ⌘K shortcut.
- The notification bell.
- The "Need a hand? Quick guide" card.
- The store-switcher chevron (there's only one store).
- The Returns count badge (no returns API yet).

Each arrives with the phase that gives it real data.

**Tests**
- **Vitest:**
  - Active state for Overview versus nested routes, and `aria-current`.
  - Cashiers are redirected away from `/admin`.
  - Sign out calls the API and lands on `/login`.
  - The drawer opens, traps focus, closes on Escape and when a route is chosen, and returns focus to the menu button.
  - The skip link moves focus to `<main>`.
  - Document titles are correct.
  - The store card handles loading and error states.
- **Playwright:** run at 1440, 1120, 820, 560, 390 and 360px. Checks: screenshots I actually view, no horizontal overflow, a keyboard walk through the nav, rail tooltips, and the phone drawer. Also a direct load and a refresh of a nested admin URL through Django's SPA fallback.

### Phase 2: Admin application shell (done, 20 Oct 2026)

**Built as planned, with the four approved decisions:**
1. **Phone drawer:** a navy slide-in drawer at ≤560px that uses the shared nav config, with "Switch to mobile admin" as its primary action. It uses Radix Dialog for the focus trap, Escape, backdrop, an `aria-hidden` background and focus return.
2. **Store endpoint:** `GET /api/v1/store/` is admin-only and read-only. It's tested for admins, signed-out users, cashiers and senior cashiers, and against writes (405).
3. **No placeholder controls:** no search or ⌘K, no bell, no quick-guide card, no store switcher and no Returns badge. There are no keyboard listeners.
4. **Rail tooltips:** `@radix-ui/react-tooltip` shows rail labels on hover and keyboard focus.

**Fixes found while verifying:**
- **Spacing scale:** `<html>` had `font-size: 13px`, so 1rem was 13px and every Tailwind spacing step ran at 81% (for example, `p-5` was 16px instead of 20px). This dated from Phase 0. The size is now on `body` only. Phase 1 screens keep their layout and get the intended spacing.
- **SPA fallback:** it returned `index.html` for the built `/assets/*.js`, so the production build couldn't start when Django served it (also from Phase 0). Assets now build under `/static/`, Django serves them as static files, and regression tests cover it.
- **Rail styling:** NavLink's function `className` broke inside the tooltip trigger, because Radix Slot merges it as a string. Active styling now uses `aria-[current=page]`.
- **Sign out:** a failed sign-out used to clear the local session while the server session stayed alive. It now keeps the user signed in and shows a toast.
- **Bundle:** the main chunk is 495 kB (155 kB gzipped). Admin code is a separate lazy chunk of 111 kB (37 kB gzipped).

**Open:**
- **Production serving:** in production `DEBUG=False`, so the `/static/` files need `collectstatic` and a static server (WhiteNoise or the web server). That's decided in Phase 9.
- **Store data in billing:** if Phase 3 receipts need the store details, `/store/` permissions should widen to staff then.

### Phase 3: Products (done, 20 Oct 2026)

**Backend (`apps/catalog`):**
- **API** under `/api/v1/catalog/`, every endpoint `IsAdmin`:
  - `products/`: list with `q` (name, product SKU, variant SKU, exact barcode), `category`, `status`, `stock` (in, low or out of stock), `ordering` (name, sku, price, stock, updated) and pagination.
  - `products/{id}/`: detail (variants, effective GST rule and HSN, last eight stock movements) and `PATCH`.
  - `products/{id}/image/`: photo upload and delete.
  - `categories/` and `tax-rules/`: read-only.
  - Products can't be deleted (405). They're deactivated instead.
- **Schema changes** (migration `catalog.0002`):
  - `Product.sku`, the unique style code. Existing rows are back-filled from their variant SKUs.
  - The `archived` status becomes `inactive`.
- **Variants:**
  - Saved in the same atomic request as the product.
  - Duplicate size and colour, SKU and barcode are caught inside the request and across products. Errors come back as `variants.N.field`.
  - The error envelope now flattens nested errors into dotted paths.
  - EAN and UPC barcodes must pass their check digit.
  - Blank barcodes are stored as `null`, so they never collide.
- **Stock:**
  - The product form never writes `on_hand`.
  - New variants can carry opening stock, recorded through `record_movement` as an `OPENING` movement.
  - A variant with movements keeps its size and colour and can't be removed. It can only be marked inactive.
  - A unique-constraint race returns a clean 400.
- **Tests:** 68 new catalogue tests cover permissions, CSRF, search, filtering, sorting, validation, duplicates, variant rules, rollback and stock integrity.

**Frontend (`features/products`):**
- **Routes:** `/admin/products`, `/new`, `/:productId` and `/:productId/edit`, lazy-loaded through the router's per-module `MODULE_ROUTES`.
- **List:**
  - Search, filters and sort live in the URL.
  - The search box waits 300 ms after typing stops. Clear drops any search still waiting.
  - The table becomes cards at ≤560px.
  - It has loading, empty (filtered or new), error-with-retry and page-out-of-range states.
- **Form:**
  - Sections: Product information, Pricing & tax, Variants & inventory.
  - zod validation plus server errors mapped onto fields.
  - Values are kept after a failed save.
  - Margin hint, GST rule summary, and variant SKUs suggested in the house style.
  - The photo is applied on save, so Cancel discards it.
- **Detail:** summary with cost and margin, a variants table (rows on phones), recent movements, and Deactivate/Reactivate behind a confirmation.
- **Shared UI:** a new `Checkbox` component, and `apiFetch` now sends `FormData`.
- **Bundle:** the login route is now lazy too, so react-hook-form and zod no longer sit in the entry chunk. The main chunk went from 495 kB to 240 kB.

**Open:**
- **Billing access:** the catalogue API is admin-only. Billing will need a staff-readable search endpoint without cost prices, rather than a wider permission here.
- **Stock adjustment:** stock adjustment and full movement history belong to the Inventory module.
- **Past invoices:** the checklist item that edits leave past invoices unchanged can only be verified once Billing creates sales.
- **Old photos:** reseeding leaves the previous photo files in `media/`. Only the image endpoint deletes a replaced photo.

### Phase 4: Billing (done, 20 Oct 2026)

**Backend (new app `apps/sales`):**
- **Models** (migration `sales.0001`):
  - `Sale`: invoice number, cashier, time, every total, the `prices_include_tax` setting at the time, the discount approver, and a snapshot of the store's name, code, address, state and GSTIN.
  - `SaleLine`: snapshots name, product and variant SKU, size, colour, HSN, unit price, quantity, discount share, taxable value, GST rate and tax.
  - `Payment`: one per sale. It stores method (cash, UPI or card), amount, cash tendered and change, and the UPI or card reference. `gateway_verified` is always `False`.
  - `InvoiceCounter`: locked per sale, so numbers (`LD-000001`) have no gaps. A failed sale rolls its number back.
  - Sales are read-only in Django admin and have no edit or delete endpoints (405).
- **Pricing** (`sales/pricing.py`): the single implementation of §8.1.
  - Money is integer paise, with divisions done in `Decimal` and rounded half-up.
  - The bill discount is shared across lines by value, with leftover paise going to the largest line.
  - The GST slab is chosen per unit after its discount share.
  - Prices are **tax-exclusive** by default (`StoreSettings.prices_include_tax = False`), with GST added on top. Tax-inclusive prices are supported if the setting is turned on.
  - The receipt splits each rate equally into CGST and SGST, with the odd paisa going to SGST.
- **Staff endpoints** (`IsStaffMember`; the admin catalogue API is unchanged):
  - `GET /billing/products/`: active products with only their active variants. It returns name, photo, SKU, category, HSN and GST rule, plus each variant's id, SKU, size, colour, barcode, price and stock. It never returns cost prices or movement history. `q` matches name, SKU, variant SKU or exact barcode; `category` filters.
  - `GET /billing/categories/`, `GET /billing/approvers/` (active Senior cashiers and Admins with a PIN set), and `GET /billing/settings/` (store name and code, tax-inclusive flag, cashier discount limit).
  - `POST /sales/quote/`: prices a bill without saving it. It returns per-line figures with current stock, the totals, the GST breakdown, the user's discount limit and whether approval is needed.
  - `GET /sales/{invoice_no}/`: the saved sale for the receipt. Cashiers see their own sales; Senior cashiers and Admins see all.
- **Checkout** (`POST /sales/`, `services.checkout`):
  - The client sends variant ids, quantities, the discount, the payment, the total it confirmed, and the approver and PIN if needed. Prices and totals are always re-read on the server; client prices are ignored.
  - Variants are locked (`select_for_update`, in id order) and their active state and stock are rechecked.
  - Sale, lines, payment and stock movements (`record_movement`, type SALE, referenced by invoice number) are written in one transaction. Stock can't go negative: the row lock, `record_movement`'s check and the database constraint all guard it.
  - **Idempotency:** the `Idempotency-Key` UUID header is required. It's unique per cashier, so a retry returns the original sale (200), even when two identical requests race. Reusing a key for a different bill gives 409 `idempotency_key_reused`, naming the invoice that was already saved.
  - Payment rules: cash must cover the total. UPI and card need a reference.
- **Discount approval** (deviation from §8.2, documented here):
  - Limits are as planned: a cashier may give up to `cashier_discount_limit_pct` of the subtotal; Senior cashiers and Admins may give up to 100% and are recorded as the approver.
  - Above the limit, the approver's id and PIN are sent with `POST /sales/` and checked inside the checkout transaction, instead of through a separate `POST /approvals/discount/` returning a single-use `approval_id`.
  - Wrong PINs are counted per approver in Django's cache. After 5, that approver's PIN locks for 15 minutes.
  - The approver is stored on the sale and printed on the receipt. There's no separate `AuditLog` yet.
  - Because approval happens at completion, it can't go stale when the bill changes.
- **Tests:** 65 sales tests cover role access, the staff catalogue's fields and filters, pricing (both slabs, the per-unit slab after discount, proportional discounts, flat and override rules, tax-inclusive prices), quantity and stock validation, inactive items, cash, UPI and card rules, idempotency (replay, key reuse, per-cashier keys), rollback on a mid-write failure, last-unit sales, discount limits and PINs, and receipts matching the saved sale.
  - The truly concurrent last-unit test needs Postgres and is skipped on SQLite. A SQLite test instead simulates stock disappearing after the check.

**Frontend (`features/billing`, `layouts/billing`):**
- **Shell:** `BillingLayout` shows the brand, store name and code, the signed-in cashier's menu, and an "Admin portal" link only for admins. It has no sidebar.
- **Workspace** (`/billing`):
  - Search by name, SKU or barcode. `/` focuses it, and a scanned code plus Enter adds that exact variant.
  - Category chips, and product cards with photos and stock in words. Sold-out items stay visible but disabled.
  - A variant picker with nothing preselected. It shows price and remaining stock per option, and sold-out options are disabled.
  - The bill shows quantity steppers (capped at the stock the server reports), remove, clear (with confirmation), and discount by percent or amount.
  - Every figure on the bill comes from the server quote, in §7's order.
  - At ≥821px the bill is a sticky side panel. Below that, a bottom bar keeps the total and "View bill" on screen and opens the bill as a sheet.
  - The bill (and its checkout key) is kept per user in `sessionStorage`.
  - Add and scan feedback appears under the search box, not as toasts, which would cover the bill's total.
- **Payment dialog:**
  - It shows the total to collect and a breakdown, with the amount repeated on the Complete button.
  - Cash takes the amount received, with quick amounts and change due. UPI and card need a reference and say they're entered by the cashier, not gateway-verified.
  - It shows approver and PIN fields when needed.
  - Server field errors are mapped onto the form. A total that changed, items that changed, and network or server failures each get their own message.
  - The Idempotency-Key is created the first time payment opens and kept until the bill changes or the sale completes, so a retry after a lost response (even after a refresh) can't record the sale twice.
- **After the sale:** the sale-complete dialog shows the invoice number, total, method and change, with View & print receipt and New sale. `/billing/receipt/:invoiceNo` renders only saved data and prints without app chrome.
- **Shared changes:**
  - `Dialog` gains a `flush` option for the bill sheet.
  - `MEDIA.split` is added.
  - Toasts are hidden when printing.
  - A print stylesheet is added.
  - Four contrast pairings are added.
- **Tests:** 36 new tests (13 unit, 23 page). They cover access, search, scan, filters, empty and error states, variant choice, server totals, stock errors, refresh, discount approval, cash, UPI, retry with the same key, total changes, wrong PIN, receipt contents and print, not-found receipts, and the phone bottom bar.

**Open:**
- **Customer attach:** not built; every sale is a walk-in. It wasn't in the Phase 4 brief, and the `Customer` model is ready for it.
- **No real gateway:** payments are only recorded, never verified with a bank.
- **Split payments:** not supported; there's one method per sale.
- **Receipt access:** the receipt is reached from the sale-complete dialog or its URL. Reprinting from transaction details comes with the Transactions module.
- **PIN lockout:** the counter lives in Django's cache (per process in development). Production should use a shared cache such as Redis.
- **Concurrency:** the threaded last-unit test hasn't been run here (no Postgres available).
- **Seed photos:** some demo photos are poor matches (for example "Floral Midi Dress"), and "Classic Chino" has none. That's seed data from Phase 3.

### Phase 5: Transactions and sales history (done, 20 Oct 2026)

Scope set by the user: the transactions list, transaction detail, receipt reprint and an initial sales summary. Voids, Returns, customer attach and a full reports module are not part of it.

**Backend (`apps/sales`):**
- **`GET /sales/`:** sales history, newest first, paginated (`page`, `page_size`, default 25).
  - Filters: `q` (invoice number, partial), `date_from` and `date_to` (store dates in Asia/Kolkata, inclusive), `cashier`, `method` and `status`. A backwards range returns 400 on `date_to`.
  - Each row has the invoice number, time, cashier, units sold, discount, total, payment method, `gateway_verified` and status.
  - Same path as `POST /sales/` (checkout), which is unchanged.
- **Access**, enforced in one place (`visible_sales`) for both list and detail:
  - Admins and Senior cashiers see every sale.
  - Cashiers see only their own, and a `cashier=` filter can't widen that.
  - Another cashier's invoice, an unknown number or a malformed one all return 404. Deactivated accounts are signed out (403).
- **`GET /sales/summary/` (admin only):** completed sales matching the same filters as the list.
  - Returns the count, total, subtotal, discount and GST, plus groups by payment method (all three, zeros included), by store date and by cashier.
  - Every group adds up to the headline figures. Figures are the totals saved on each bill.
- **`GET /sales/cashiers/` (admin only):** staff who have recorded a sale, including deactivated accounts, for the cashier filter.
- **Approver name snapshot:** the discount approver's name is now saved on the sale (`discount_approved_by_name`, migration `sales.0002`).
  - Before this, the receipt read the approver's current name, so renaming the account rewrote old receipts. The new tests found this.
  - The migration fills existing sales from the approver's current name, the best record left for them.
- **Tests:** 27 new history tests cover sign-in and role access, own-sales scoping, unknown and malformed invoices, list fields, ordering and pagination, search, each filter, store-date boundaries, bad ranges, history unchanged after product, tax, store and approver changes, and reprinting writing nothing.
  - The reprint test checks for no new sale, no stock movement, the same totals and time, and no invoice number used.
  - The summary tests check totals, groups, filters, the empty summary, and saved rather than current prices.

**Frontend (`features/transactions`):**
- **`/admin/transactions`:**
  - Search and filters live in the URL (`?q=&from=&to=&cashier=&method=&page=`).
  - Summary cards (Completed sales, Recorded sales total, GST on these bills, Discounts given), each with its definition as a footnote.
  - The list shows a table from `lg` and cards below that, so tablets never scroll sideways.
  - Breakdown panels by payment method, day (the latest 14 days shown) and cashier.
  - A note says the figures are recorded sales, not settled payments, and that returns aren't deducted.
  - UPI and card are marked "not gateway-verified" in the list, the breakdown and the detail page.
  - A backwards date range shows a warning instead of a request.
- **`/admin/transactions/:invoiceNo`:** an invoice layout with Bill, Payment and Store (the snapshot), then the items sold, totals with CGST and SGST per rate, and the approver.
  - There's no edit action.
  - Malformed invoice numbers show not-found without a request.
- **`/admin/transactions/:invoiceNo/receipt`:** reprints with the same `Receipt` component the till uses (moved to `features/billing/components/Receipt.tsx`). It reads the cached sale and sends no writes.
  - The admin sidebar and topbar are hidden when printing.
- **Shared changes:**
  - A sale now also invalidates `sales.history` (lists, summaries, cashiers).
  - `MEDIA.wide` (from `lg`) is added.
  - The Inventory and Returns placeholders no longer claim a phase number.
- **Tests:** 18 page tests cover access, list fields, server search, filters following into the summary, backwards ranges, URL cleaning, pagination, a page past the end, empty and filtered-empty states, list and summary errors with retry, phone cards, detail contents, unknown, malformed and failing invoices, and reprint (print called, only GETs, a single fetch).

**Expected console errors in browser checks:** the 404 for the deliberately unknown invoice `LD-999999`, and the 403 and 404 responses from the deliberate cashier API probes.

**Open:**
- **Concurrency test:** the threaded last-unit test from Phase 4 still needs PostgreSQL. None is installed here: no Windows service or client, no Docker, and the WSL Ubuntu distribution has no PostgreSQL. It stays explicitly skipped, and SQLite results don't stand in for it.
- **Discount approvals:** there's no separate audit trail yet (see the Phase 4 deviation). The approver is recorded on the sale.
- **Seed photos:** the demo photo corrections (from Phase 4) are still open.
- **Cashier history:** cashiers have no history page in the billing portal. The API already scopes `/sales/` to their own sales for when one is added.
- **Not yet built:** voids, Returns (and so returns in the summary), customer search, and summary CSV export.
- **Daily breakdown:** it lists only the latest 14 days with sales. Earlier days are reached with the date filter.

### PostgreSQL validation (20 Oct 2026)

Run against a local PostgreSQL 18.6 with a dedicated `loomdesk` role that has `LOGIN` and `CREATEDB` only (no superuser or `CREATEROLE`). Every run used `config.settings.test` and a throwaway `test_loomdesk` database, created and dropped by pytest-django. `db.sqlite3` was unchanged, as checked by size, modification time and hash.

- **Concurrent last-unit checkout** (four tills, one unit): 11 separate runs passed, each with a fresh test database (1 run, then 10 repeats). Each time exactly one sale was saved, three were refused for stock, and stock ended at 0.
- **Full backend suite:** the first PostgreSQL run had 194 passed and 5 failed, all in `test_client_routes_get_the_spa_shell`.
  - **Cause:** a test-configuration mismatch, not a PostgreSQL incompatibility. `base.py` sets `ATOMIC_REQUESTS`, but the SQLite override in `config/settings/test.py` replaced the whole database dict and dropped it. So SQLite test runs never wrapped requests in transactions, unlike development and production. On PostgreSQL, the SPA fallback view tried to open a transaction in a test with no database access. With the setting restored, the same failure reproduced on SQLite.
  - **Fixes:**
    - The SQLite test override keeps `ATOMIC_REQUESTS: True`.
    - `spa_index` is marked `transaction.non_atomic_requests`. It only reads `index.html`, so the app shell no longer opens a transaction or depends on the database.
    - A guard test checks that the test settings keep `ATOMIC_REQUESTS`.
  - **After the fixes:** 200 passed on PostgreSQL (0 failed, 0 skipped, 0 deselected). On SQLite, 199 passed and 1 was skipped (the PostgreSQL-only concurrency test).

**Database configuration (current behaviour, not yet changed):**
- `backend/.env` sets `DJANGO_SETTINGS_MODULE=config.settings.dev` and the `POSTGRES_*` values. It has no `DB_ENGINE`.
- So `manage.py` commands without `DB_ENGINE=sqlite` target a PostgreSQL database named `loomdesk`, which hasn't been created. They fail to connect, and nothing is written anywhere.
- Commands with `DB_ENGINE=sqlite` still use `db.sqlite3`.

**Recommendations (waiting for the user's decision):**
- **Local development:** move to PostgreSQL so development matches production. Create a `loomdesk` database owned by the `loomdesk` role, run `migrate` and `seed_demo` against it, and keep `db.sqlite3` only as a fallback. Until then, adding `DB_ENGINE=sqlite` to `backend/.env` would make plain commands use SQLite again.
- **Production:**
  - Use `config.settings.prod`, which `wsgi.py` and `asgi.py` already default to.
  - Supply real environment variables or a secret manager, not a `.env` file.
  - Give the app a dedicated role that owns only its database, with no `CREATEDB`, superuser or `CREATEROLE`. Test and dev roles must never point at production.
  - Use a strong generated password, keep the database off the public network, and require TLS if it runs on another host (not yet configurable in settings).
  - Use a shared cache such as Redis for the PIN lockout (see Phase 4).

### Local development database (20 Oct 2026)

Approved by the user after the PostgreSQL validation above.
- Before creating anything: no `loomdesk` database existed (the server held only `postgres`), and `db.sqlite3` was intact and fully migrated.
- Created `loomdesk` (owner `loomdesk`, UTF8, from `template0`), ran `migrate` (27 migrations), and confirmed the connection as `loomdesk` on PostgreSQL 18.6.
- Ran `seed_demo` without `--reset`, after confirming the target was PostgreSQL `loomdesk` with no products.
- Plain `manage.py` commands now use this database. `DB_ENGINE=sqlite` still selects `db.sqlite3`, which was not modified (same hash before and after).

### Phase 6: Inventory (done, 20 Oct 2026)

Scope set by the user: an inventory overview with variant- and product-level quantities, search, filters and server pagination, stock adjustments with reasons, staff and time, movement history, low-stock indicators from each variant's reorder level, and desktop and mobile layouts. Suppliers, purchase orders, returns and advanced reporting are not part of it.

**Backend (`apps/inventory`, all admin-only via `IsAdmin`):**
- **`GET /inventory/variants/`:** one row per variant, including inactive variants and products so stock on them stays visible.
  - Each row has on hand, reorder level, stock state, whether it's sellable, the product's total on hand, and the latest movement's type and time. No prices or costs.
  - Filters: `q` (product name or SKU, variant SKU, exact barcode), `category`, `state` (`in_stock`, `low_stock`, `out_of_stock`) and `status` (`active` = sellable, `inactive`). Ordering by `product`, `stock` or `moved`, with an id tiebreak so pages stay stable. Paginated like every list.
  - `GET /inventory/variants/{id}/` returns one row.
- **`GET /inventory/summary/`:** tracked variants (active variants of active products), low stock, out of stock and units on hand. Low means 1 to the reorder level; out means 0. This is the same rule as `Variant.stock_state`.
- **`POST /inventory/adjustments/`:** `{variant, kind: add|remove|count, quantity, reason, expected_on_hand}`.
  - `services.adjust_stock()` locks the variant row, compares it with `expected_on_hand` (409 `stock_changed` if a sale or another adjustment moved it since the preview), then writes one movement through `record_movement()`, all in one transaction.
  - Negative results are refused (400 on `quantity`). Add and remove need at least 1 unit; a count may match current stock and records a zero change. Quantities are whole numbers up to 10,000. Every kind needs a reason of at least 3 characters.
  - The signed-in admin is the actor; the movement's time is the server's.
  - Inactive items can still be adjusted, so discontinued stock can be written off.
- **`GET /inventory/movements/`:** the ledger, newest first, with variant and product, type, change, balance after, reason, reference and actor. Filters: `q` (product, variant SKU or reference), `variant`, `type`, `date_from` and `date_to` (store dates, inclusive; a backwards range is a 400). There are no write methods.
- **Tests (`apps/inventory/test_api.py`, 46):** sign-in and role access for every endpoint (cashiers and senior cashiers get 403, and a cashier adjustment changes nothing), row fields, product totals, search, each filter, per-variant reorder levels, ordering and pagination, the summary, add, remove and count with their movements and actor, zero-change counts, negative stock, invalid input changing nothing, stale previews (409), write-offs on inactive items, a failed write rolling back the whole adjustment, earlier history left untouched, movement fields, filters and pagination, and append-only endpoints.
  - **Concurrency (PostgreSQL only):** four admins remove the last two units at once. Exactly one succeeds, three get 409, stock ends at 0, and one removal is recorded.

**Frontend (`features/inventory`):**
- **`/admin/inventory`:** four summary figures with definitions, a toolbar (search, category, stock level, sellable or inactive, sort) mirrored in the URL, a table from `lg` and cards below, low and out-of-stock badges as text, a "Not on sale" badge for inactive items, and links to each variant's history.
- **Adjust stock dialog:** the variant with its live on-hand figure, add, remove or set counted, quantity, reason, and a current → result preview. It checks input and negative results before sending, and sends the previewed figure. On `stock_changed` it explains what moved and refreshes the figure, so the admin confirms again knowingly. Nothing is optimistic: a success invalidates inventory, the admin catalogue and the till's catalogue.
- **`/admin/inventory/movements`:** the ledger with search, type and date filters, the same table and card split, signed changes, invoice references linking to the transaction, and "System" for movements without an actor. With `?variant=` it shows that variant's stock and an Adjust action.
- **Shared changes:**
  - `components/ui/Pagination.tsx` replaces identical copies in Products and Transactions.
  - `lib/useDebouncedSearch.ts` holds the debounced, URL-synced search used by both inventory toolbars. The Products and Transactions toolbars keep their own copy for now.
  - Product saves and sales now also invalidate `inventory`.
  - Inventory takes the Phase 6 badge in the nav; Suppliers and Staff no longer claim it.
- **Tests (`inventory.test.tsx`, 15):** cashier access, row and summary contents, filters and search in the URL and request, pagination, phone cards, a list error that keeps the page, client validation and preview, the request body, the success toast and refetch, a stale preview (409) refreshing the figure, server field errors, movement fields and links, the single-variant view, backwards ranges and unknown variants, and URL and quantity parsing.

**Browser check (PostgreSQL dev database, 1440, 1120, 820, 390 and 360 wide):** 28 of 30 checks passed.
- Passed: summary matching the API, the low-stock filter, pagination, client-side negative-stock blocking, the preview, a stale preview refused after a real concurrent add and then confirmed, the toast, history with reason and actor, no page overflow and the right table or card layout at every width, the dialog at phone width, and cashiers sent to 403 with API reads and adjustments refused.
- Not passed: the sale-reference link wasn't exercised because the new dev database has no sales yet (covered by the page test). The console showed the expected 409 from the deliberate stale-preview check.
- **Dev data side effect:** two early runs of the check script read the wrong figure and recorded two real −1 adjustments on `SH-CT-001-S-BLU`. They were reversed with a recorded +2 ("Browser check: reverses test removals #66 and #67"). Stock is back to its seeded figure, and the ledger keeps all the browser-check movements, as an append-only ledger should.

**Open:**
- Reorder levels are edited on the product form; there's no bulk edit.
- No CSV export of stock or movements.
- Purchases and returns don't exist yet, so their movement types never appear.

### Phase 7: Suppliers and Purchasing (done, 20 Oct 2026)

Scope set by the user: supplier management, purchase recording, stock receiving through the existing movement service, supplier history with payments recorded (not verified), and inventory integration. Staff, Overview, Reports and accounting are not part of it.

**Reconciliation before the phase (read-only, no database change):** `SH-CT-001-S-BLU` is at 3. Its ledger is opening +3, #66 −1 and #67 −1 (the accidental removals), #68 +1 and #69 −1 (the intended concurrent-add pair), and #70 +2 (the documented reversal). The running balance is consistent at every step, the five browser-check movements net to zero, and no other variant has a non-opening movement. All 68 variants reconcile with their ledgers. The "damaged sample" reason on #66, #67 and #69 was text supplied by the check script; nothing was damaged. #70's reason records the correction.

**Backend (`apps/suppliers`, all admin-only via `IsAdmin`):**
- **Models:** `Supplier` gains contact name, GSTIN, address, state, notes and `updated_at`. New models:
  - `Purchase`: `PUR-000001` numbers; status `ordered` ("Awaiting goods"), `received` or `cancelled`; supplier invoice number and date; notes; stored totals; who recorded, received or cancelled it and when; and the idempotency key.
  - `PurchaseLine`: a snapshot of the product name, SKU, size and colour, plus quantity, unit cost, GST rate and amounts. One line per variant.
  - `SupplierPayment`.
  - Constraints: one supplier invoice number per supplier (case-insensitive, ignoring blanks and cancelled purchases), one purchase or payment per idempotency key per user, and payment amounts above zero. Migration `0002_purchases_and_payments` is additive.
- **Suppliers:** `GET/POST /suppliers/` (search over name, contact, phone, email and exact GSTIN; status and category filters; name or balance ordering; paginated), `GET /suppliers/categories/`, and `GET/PATCH /suppliers/{id}/`. There's no delete: deactivating keeps every purchase and payment, blocks new purchases, and still allows purchases already awaiting goods to be received. Balances are read-only.
- **Purchases:**
  - `POST /suppliers/purchases/quote/` prices draft lines.
  - `GET/POST /suppliers/{id}/purchases/`: the POST needs an `Idempotency-Key` UUID. A replay returns the same purchase; a key reused with a different body gets 409.
  - `GET/PUT /suppliers/purchases/{number}/`: edits only while awaiting goods.
  - `POST …/receive/` and `POST …/cancel/` (a reason is needed to cancel).
  - **Pricing (`services.price_lines`):** tax per line is `round_half_up(quantity × unit cost × rate)`. The rate is the GST slab entered from the invoice; when it's left blank, the product's own rule is applied to the unit cost.
  - **Validation:** 1 to 100 lines, quantities of 1 to 10,000, a positive cost, a known GST slab, no future dates, and an active supplier and active variants.
- **Receiving (`services.receive_purchase`):** one transaction that locks the purchase row and writes one `purchase` movement per line through `record_movement()`, in variant order. Each movement references the purchase number and gives the supplier and invoice as its reason. The purchase is then marked received.
  - Recording a purchase changes no stock.
  - A second receive gets 409 `already_received` with no stock change, and a cancelled purchase gets 409 `purchase_closed`.
  - The supplier invoice number is required before receiving.
  - A failure on any line rolls back every line and the status.
- **Payments:** `GET/POST /suppliers/{id}/payments/` takes an idempotency key. The method (bank transfer, UPI, cheque or cash) is only a label: nothing is charged, and `gateway_verified` is always false. Payments can't be edited or voided.
- **Balance and statement:** the balance is received purchases minus recorded payments. Purchases awaiting goods are shown separately and aren't owed. `GET /suppliers/{id}/statement/` lists received purchases and payments by date with a running balance; an advance shows as a negative balance.
- **Schema:** Product and Supplier statuses now share `ActiveStatusEnum` (it was `ProductStatusEnum`). `PurchaseStatusEnum` and `SupplierPaymentMethodEnum` are named.
- **Tests (`apps/suppliers/tests.py`, 62):** access for every endpoint and role; supplier CRUD and validation; balances that can't be typed in; deactivation; search, filters, ordering and pagination; totals at 5%, 18% and an explicit 12%, with half-up rounding and the quote matching the record; recording without a stock change; invalid purchases saving nothing; idempotent replay and key reuse; invoice uniqueness; editing; snapshots; receiving once with one movement per line; a second receive refused; rollback when the second line fails; cancelling; ledger reconciliation through the inventory movements API; payments and the statement.
  - **Concurrency (PostgreSQL only):** four simultaneous receives give one 200 and three 409s, and stock goes up once.

**Frontend (`features/suppliers`):**
- **`/admin/suppliers`:** search, category, status and sort mirrored in the URL; a table from `lg`, cards below; and the recorded balance labelled, with advances marked.
- **Forms:** add and edit supplier (react-hook-form + zod, GSTIN uppercased, server errors on fields, no balance field).
- **Profile:** contact details, four figures (recorded balance, goods received, payments recorded, awaiting goods) with definitions, purchases with a status filter and pagination, and the statement. Deactivate and reactivate need confirmation.
  - **Record payment dialog:** says it neither sends money nor checks with a bank. One key per opened form, so a retry after a lost response records one payment.
- **Record and edit purchase:** variant search (reusing `/inventory/variants/?status=active`), lines with quantity, unit cost and GST ("Product rule" or a slab), and totals only from the server's debounced quote. One idempotency key per opened form.
- **Purchase detail:** the line snapshot and totals. While awaiting goods it shows Receive, Edit and Cancel.
  - Receive confirms the units and the amount owed. It's disabled until an invoice number is entered, and `already_received` is shown as done, not as an error.
  - Cancel needs a reason.
  - Received purchases link to their stock movements.
  - Receiving invalidates suppliers, inventory, the admin catalogue and the till's catalogue.
- **Stock ledger:** `PUR-…` references link to the purchase (`referencePath` in `features/inventory/labels.ts`).
- **Nav:** Suppliers takes the Phase 7 badge. The AdminShell placeholder tests now use Returns.
- **Tests (`suppliers.test.tsx`, 21):** cashier access; list contents, filters in the URL and request, phone cards and the empty state; form validation, the payload and server errors; profile figures, purchases and statement; a missing supplier; a payment retried with the same key; deactivation; recording with the server's totals, the key and no receive call; server line errors; receiving, an already-received purchase, a missing invoice number, cancelling, the received view, a malformed number; the ledger link; and parsing helpers.

**Browser check (PostgreSQL dev database, 1440, 1120, 820, 390 and 360 wide):** 28 of 28 passed, then 7 of 7 in a read-only re-check after fixes. No console errors.
- **Passed:** list, profile, supplier form and purchase form at every width without sideways scrolling; an empty form sending nothing; the server quote shown as the total; recording leaving stock unchanged; the receive and payment dialogs' wording (both closed without submitting); cancelling with a reason; the balance unchanged; and cashiers sent to 403 and refused by the API.
- **Fixed after the first run:** the item search stayed open after Add until its debounce caught up; list contacts wrapped with a dangling separator; and the purchase totals' border didn't span the card.
- **Dev data:** migration `suppliers.0002` applied. One purchase, `PUR-000001` for Cotton Collective (1 × `SH-CT-001-S-BLU` at ₹1 + 5% GST, invoice `BROWSER-CHECK-1`), was recorded and then cancelled ("Browser check: not a real purchase"). It changed no stock or balance. No payments were recorded and no goods were received in the browser; those are covered by the API and page tests. Stock movements still end at #70.

**Decisions and limits:**
- **No partial receipts.** Purchase ordering is out of scope (B10), so a purchase records what the supplier billed. If fewer items arrive, edit the quantities before receiving, or cancel and re-record.
- Receiving doesn't update the product's cost price.
- No purchase discounts, no CGST/SGST/IGST split, and no freight or other charges.
- There's no store-wide purchases list; purchases are listed per supplier.
- There are no returns to suppliers and no debit notes. Payments can't be edited, voided or allocated to particular purchases.
- This is an operational record, not accounting. Supplier balances aren't reconciled with a bank.

### Phase 8: Mobile admin (done, 20 Oct 2026)

Scope set by the user: a phone-first admin at `/admin/mobile/*` for the overview, inventory (with adjustments), bills and receipt reprints, suppliers, and purchases with receiving. It reuses the existing APIs and business rules. No new accounting, purchase orders, partial receipts or supplier returns.

**Backend (small, additive, admin-only like the rest of `apps/suppliers`):**
- `GET /suppliers/purchases/` (operation `purchases_list`): purchases from every supplier, newest first, with the `status` filter and `q` over the purchase number, supplier invoice number and supplier name. It lets a phone find a delivery without knowing the supplier. Phase 7's "no store-wide purchases list" limit no longer applies.
- Purchase lines gain read-only `current_on_hand` (the variant's stock now), so the receive confirmation can show "now → after" per line. The server still adds exactly `quantity` when receiving.
- `GET /store/` gains `today`, the store's local date, so "today" figures don't depend on the phone's clock or time zone.
- Tests: the store-wide list (ordering, status filter, search, a bad status, row fields, and access for every role), `current_on_hand`, and the store's `today`.

**Frontend:**
- **Shell (`layouts/mobile/`):**
  - `MobileAdminLayout`: a sticky header (brand, store, account menu), a single 640px-max column, and a fixed bottom nav with safe-area padding, hidden in print.
  - `mobileNav.ts` holds the tabs, the More items and each route's `{title, tab}` handle; `mobileRoutes.tsx` lazy-loads every page.
  - Page errors and unknown paths stay inside the shell. `RequireRole(['admin'])` guards it, so the server's role checks are unchanged.
  - `ScaffoldPage` is removed.
- **Overview:**
  - Today's sales and bills come from `/sales/summary/` for the store's date; low and out-of-stock counts come from `/inventory/summary/`.
  - It also shows quick actions, purchases awaiting goods, the lowest-stock variants and the latest bills.
  - A failed figure shows "—" with a retry; the other panels are unaffected.
- **Inventory:**
  - **List:** search, a stock-level chip filter and sort, all in the URL.
  - **Variant page:** on hand, reorder level, product total, facts and the last five movements.
  - **Ledger:** type filter and per-variant view. `LD-` and `PUR-` references open the mobile pages.
  - **Adjustment:** a two-step page. The edit step shows the live result; the review step shows the current and resulting quantity, the reason, and that movements can't be edited.
  - Confirming sends the reviewed `expected_on_hand`. On 409 `stock_changed`, the page returns to the edit step with the new figure and records nothing.
  - Validation is shared with the desktop dialog (`validateAdjustment`).
- **Bills:**
  - **List:** invoice search, a date range (with a "today" shortcut from the store date), method chips, and the matching count and total.
  - **Detail:** reuses the desktop sections (`SaleSections.tsx`), including the manual-payment warning.
  - **Receipt:** reprint renders the till's `Receipt` from the saved sale and calls `window.print()`; nothing is written. `SaleGate` gains `listPath` and `frame`, so the mobile not-found, error and loading states keep a header and back link.
- **Suppliers (read-only on mobile):**
  - **List:** search and a status filter.
  - **Profile:** Call and Email links, four recorded figures labelled "Not bank-verified" and "Not owed until received", purchases with a status filter, recorded payments each marked "Not verified", and the statement as an operational record.
  - Editing and recording payments link to the full admin.
- **Purchases:**
  - The list defaults to Awaiting goods.
  - The detail shows line quantities, costs, GST and, while awaiting goods, stock now and after receiving.
  - **Receive:** a confirmation lists every line's stock change, the units and the amount owed, and says it can't be undone. It's disabled without the supplier's invoice number.
  - A second submission gets the server's `already_received` and is reported as already done.
  - Edit and cancel stay in the full admin.
- **Shared components:** `ChipGroup` (single-choice 44px radio chips that wrap rather than scroll) and a `touch` size for `Pagination`.
- **Tests (`layouts/mobile/mobile.test.tsx`, 21):**
  - Cashiers sent to 403 on four direct URLs without any admin request; signed-out visitors sent to login with `next`.
  - Overview figures for the store date, and a failed figure that retries.
  - Tab state and in-shell not-found.
  - Inventory filters in the URL and request, and an error with retry.
  - Adjustment: review before any write and the exact body; client validation sending nothing; 409 `stock_changed` handling; a malformed id never requested.
  - Bills: reprint calls print with no write; a missing bill.
  - Purchases: the default filter; the receive confirmation and a single POST; `already_received`; a missing invoice number.
  - Suppliers: unverified payment labels.

**Validation:**
- **Frontend:** typecheck, lint and build are clean. 257 tests pass.
  - Two existing timing-sensitive tests (the admin-shell login redirect and a products list test) each timed out once under full parallel load. They pass alone and in three further full runs.
- **Backend:** 307 passed on PostgreSQL; on SQLite, 304 passed and 3 were skipped (the PostgreSQL-only concurrency tests).
- **Schema:** `spectacular --validate --fail-on-warn` is clean, and the regenerated schema and `api.gen.ts` match the committed ones.

**Browser check (PostgreSQL dev database, Vite proxy):** 96 of 97 read-only checks plus 14 of 14 stubbed checks passed.
- **Layout:** 16 pages at 360, 390, 820 and 1440 wide, with no horizontal overflow anywhere and no interactive target under 32px. Frequent actions use the 44px size.
- **Behaviour:**
  - One `<h1>`; tab state; back navigation keeping filters; a deep link surviving reload.
  - The adjustment review showing 2 → 1, then Back to edit without confirming.
  - No Receive on the cancelled purchase; supplier labels; the nav hidden in print.
- **Cashier:** sent to 403 on five mobile URLs. 12 admin API calls refused with 403 (two of them were deliberately invalid POSTs).
- **Signed out:** sent to login with `next`, and the API refused.
- **Console:** the one "failure" was the browser logging those deliberate 404 and 403 responses. No script errors.
- **Stubbed:** the dev database has no sales and no purchase awaiting goods, so the receipt reprint and the receive dialog were checked at 360 and 390 against a browser-stubbed sale and purchase, with every API write aborted. Print was called once, print media hid the controls, and the dialog showed 2 → 12 and 0 → 3 and was cancelled.
- **Dev data:** the database is unchanged: 0 sales, movements still end at #70, total on hand 162, one cancelled purchase, 0 payments. `db.sqlite3` is untouched.

**Decisions and limits:**
- **Inventory replaces the spec's Products tab.** Product editing is linked from More to the full admin.
- **No notification bell.** There is no notification backend, so the header doesn't show a bell that does nothing.
- **Suppliers are read-only on mobile.** Recording payments, editing suppliers, and recording, editing or cancelling purchases stay in the full admin. Receiving is the one write.
- **Unbuilt modules.** Returns, Staff, Reports and Settings have no mobile pages until their phases.
- **Tablet and desktop.** Wider screens get the same centred column; there's no separate tablet layout.

### Phase 9: Deployment and production readiness (done, 20 Oct 2026)

Scope set by the user: production configuration, static and frontend delivery, database and media, a security review, and a deployed acceptance run. No new modules.

**Target (the user's choice):** there is no hosting account. The production configuration runs locally (`DEBUG=False`, WhiteNoise, Waitress) against a separate PostgreSQL database, `loomdesk_prod`, and `docs/deployment.md` is a host-agnostic guide. With no public URL, the app is not claimed production-ready for a public host.

**Production configuration (`config/settings/prod.py`):**
- **Environment only:** production never reads `backend/.env`.
  - Start-up stops when the secret key is missing, under 50 characters or a known placeholder, or when the allowed hosts or a `POSTGRES_*` value is missing.
  - SQLite is refused.
  - `config/test_production.py` proves each refusal in a subprocess with a clean environment.
- **HTTPS:** secure session and CSRF cookies, HSTS, SSL redirect, and `X-Forwarded-Proto` from the proxy.
  - Also nosniff, a same-origin referrer policy, `X-Frame-Options: DENY` and 12-hour sessions.
  - Redirect and HSTS can be turned off by variable, for a local run only.
- **Database:** PostgreSQL with configurable `sslmode`, a connect timeout, and pooled connections with health checks.
- **Errors:** logs go to stdout. Production 404 and 500 responses are JSON envelopes under `/api/` and plain text elsewhere, never a debug page. The OpenAPI schema and Swagger UI are admin-only.
- **Store setup without demo data:** `seed_demo` refuses production settings.
  - `setup_store` creates the store record, GST rules and categories, and warns while the receipt details are still the demo store's.
  - `create_staff` creates real accounts. It rejects the demo password and weak passwords, and never takes a password as an argument.

**Static and media:**
- `collectstatic` gathers the Vite build into `STATIC_ROOT`, and WhiteNoise serves it compressed.
- Vite's hashed files get a one-year immutable cache, and `index.html` gets `no-cache`. A missing asset is a plain 404, not the SPA.
- Uploads go to `DJANGO_MEDIA_ROOT`, a directory outside the code. Django serves it, or a proxy does with `DJANGO_SERVE_MEDIA=false`.
- Deploy checks `loomdesk.E001`–`E004` fail `check --deploy` when the build or collected assets are missing, or the cache is unsuitable.

**Security finding fixed: the lockout and throttle never fired on PostgreSQL.**
- **The problem:** with `ATOMIC_REQUESTS`, DRF rolls back the request's transaction on an error response, so a database cache on that connection lost the very failures it was counting. Process-local memory isn't shared between workers either.
- **The fix:** the cache now has its own autocommit alias on the same database (`config/routers.py`). Every worker and instance shares it, and it needs no new service.
- **The guard:** check E004 rejects a cache on an atomic alias.

**Database:** `deploy/postgres/create_database.sql` creates the application role and its database.
- The role has no superuser, `CREATEDB` or `CREATEROLE`, and owns only its database. `CONNECT` is revoked from `PUBLIC`.
- psql prompts for the password, and the script stops without changes if the role or the database already exists.
- The user ran it as `postgres`. Afterwards I verified that `loomdesk_app` has no superuser, `CREATEDB` or `CREATEROLE`, and that the dev role `loomdesk` can't connect to `loomdesk_prod`.

**Demo photos:** `seed_data.PHOTO_URLS` now points at Unsplash photos that match each product (Unsplash License, no Unsplash+).
- Replaced: the shirt, kurta, midi dress, tee, chinos and kurti.
- `fetch_seed_photos --force` re-downloads them.
- `seed_demo --refresh-photos` replaces only the photos on an existing demo database. I ran it on the dev database; sales, stock and movements are unchanged.

**Validation:**
- **Frontend:** typecheck, lint and build clean; 257 tests pass.
- **Backend:** 334 passed on PostgreSQL. On SQLite, 331 passed and 3 were skipped (the PostgreSQL-only concurrency tests).
- **Schema:** unchanged and valid.
- **Smoke tests (Waitress, production settings, `loomdesk_prod`):**
  - Hashed JS and CSS are gzip-compressed with an immutable cache.
  - A missing asset and a missing photo return a text 404.
  - Unknown `/api/` paths get the JSON 404 envelope.
  - An unknown `Host` gets 400.
  - The schema gets 403 when signed out.
  - The CSRF cookie is `Secure`.
- **Acceptance run (Playwright through the UI, checked through the API):**
  - **Product:** the admin signed in and created a product with two variants and a photo.
  - **Purchase:** recorded from a new supplier with no stock change, then received: +6 and +4, two `purchase` movements, and a second receive refused with 409.
  - **Sale:** the cashier sold one unit at the till, taking stock from 6 to 5.
  - **Reprint:** the admin opened the transaction and reprinted twice. No write requests were sent, and the sale, movement and stock counts didn't change.
  - **Cashier limits:** sent to 403 on an admin URL, refused with 403 by six admin APIs, and shown no cost prices.
  - **Routing:** five nested routes survived a refresh, and a signed-out deep link went to login and back.
  - **Layouts:** the mobile admin fit at 360 and 390 px, with no sideways scroll at tablet or desktop width.
  - **Media:** after a server restart, the uploaded photo was still served.
- **On the production configuration:**
  - Five wrong PINs were refused; the sixth attempt, and then the correct PIN, were locked out, and nothing was written.
  - Login returned 429 after ten attempts a minute.
  - Both counters were rows in `loomdesk_prod`'s cache table.

**Limits and deferred items (at the time; `docs/deployment.md` §9 has the current list):**
- **Lockout race:** the counter is a read-then-write, so simultaneous wrong PINs can allow one or two extra attempts.
- **No CSP header yet,** and the `/django-admin/` login isn't throttled.
- **One database role:** the runtime role also runs migrations.
- **Host duties:** backups and TLS belong to the host.
- **Not built yet:**
  - Returns, Staff, Reports and Settings, and their mobile pages. Until Settings exists, `setup_store` sets the store's receipt details.
  - Voids.
  - The "every admin section reachable from More" checklist item stays open until those modules exist.
- **Not yet run:** the accessibility and visual hardening pass from row 9 of §1.
- **Product form (left as is):** a scripted `fill` of the variant SKU straight from the Colour field appends to the suggested SKU, because the suggestion is written when Colour loses focus. A person who clicks or tabs into the field sees the suggestion first.

### Phase 10: Security hardening (done, 20 Oct 2026)

Scope set by the user: close the approval-PIN race, rate-limit `/django-admin/` sign-in, and add a Content-Security-Policy, with no new features and no public deployment. No new libraries.

**A. Approval-PIN lockout under concurrency**
- **The problem:** the lockout read a count from the cache, checked the PIN, then wrote count + 1. Simultaneous wrong PINs all read the same count, and each got a guess.
  - The database cache can't increment atomically.
  - A row written in the checkout's transaction would be rolled back along with the refused checkout.
- **The guard:** `AttemptGuard` (one row per key, migration `accounts.0002`) and `apps/accounts/attempts.reserve()`.
  - `reserve()` locks the row with `SELECT … FOR UPDATE`, refuses at the limit, and otherwise counts the attempt *before* the PIN is checked, in its own committed transaction.
  - Simultaneous attempts queue on the row lock, so at most five PINs are checked per approver. The lock lasts until 15 minutes after the last one, and the right PIN clears the count, as before.
- **Checkout:** checks the approval before opening the sale's transaction, then re-checks the figures under the stock lock. An over-limit discount still needs an approver if prices moved.
  - The sale view uses `transaction.non_atomic_requests`. It already ran its own transaction.
  - `config/exceptions.py` keeps DRF from marking an enclosing transaction for rollback for such views. In production there is none; in tests it's pytest's.
- **Tests:**
  - **Simultaneous wrong PINs:** a PostgreSQL thread test sends eight wrong PINs at once, on bills for different items, with the PIN check slowed so they overlap. Exactly five are checked and three refused, and no sale or stock change follows.
    - Against the old code it fails: more than five were checked.
    - It first passed against the old code by accident. The bills shared a product, then the test database lacked the store-settings row, whose insert queued every till; in a real store that row already exists. The final test creates the row first and uses a separate product per bill.
  - **Without pytest's transaction (as in production):** each refused checkout writes nothing but stays counted.
  - **Bypass attempts:** other cashiers, fresh idempotency keys and the quote endpoint all hit the same lock.
  - **Window:** the lock ends 15 minutes after the last attempt, and the right PIN clears earlier wrong ones.
  - **Replay:** a replayed bill checks no PIN.
  - **The guard itself:** unit tests for the limit, the window, release and clear, multi-key give-back, hashed account keys and the clean-up of idle rows.

**B. Django admin sign-in limit**
- **The site:** `config/admin_site.LoomDeskAdminSite`, installed through `config.apps.LoomDeskAdminConfig`, which replaces `django.contrib.admin` in `INSTALLED_APPS`.
- **The limits:** 5 failed sign-ins per account and 10 per client address in 15 minutes, on the same guard.
- **A lockout:** gets the normal sign-in page with a message, status 429 and `Retry-After`; its password is never checked.
- **A successful sign-in:** clears its account's count and isn't held against its address. A store account without staff access counts as a failure.
- **Privacy:** account keys are hashes, never emails.
- **Tests:** a normal sign-in; the lockout (with authentication watched, so the locked attempt is proven unchecked); expiry; the address limit across accounts; successes not counting; non-staff accounts.

**C. Content-Security-Policy (`config/csp.py`)**
- **Policies by path:**
  - **The app:** `script-src 'self'`, and `style-src 'self'` plus a per-request nonce. Also `img-src 'self' blob:`, `font-src 'self' data:` (one Manrope subset is inlined into the CSS), `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`.
  - **`/api/`:** `default-src 'none'`.
  - **Swagger UI:** jsDelivr. It switches to `SpectacularSwaggerSplitView`, so there is no inline script, and a template puts the nonce on its inline style.
  - **`/media/`:** images only, sandboxed.
  - **`/django-admin/`:** its own static files. Rendered admin pages have no inline scripts, styles or handlers.
  - No policy allows `'unsafe-inline'` or `'unsafe-eval'`.
- **What needed adapting:**
  - **Radix dialogs** inject a scroll-lock `<style>` through react-remove-scroll. Django writes the nonce into `index.html`, and `lib/cspNonce.ts` sets get-nonce's `__webpack_nonce__` fallback, with no new dependency.
  - **Radix Select's viewport** renders its own `<style>`, so `components/ui/Select` passes the nonce.
  - **Zod 4** probes `new Function`, which the browser reports. `main.tsx` sets `z.config({ jitless: true })`.
- **Switches:** report-only with `DJANGO_CSP_REPORT_ONLY=true`; off in development (Vite serves the app, and Django's debug pages are inline).
- **Tests:**
  - The headers and the matching meta nonce on the shell.
  - A new nonce per request.
  - No unsafe source in any policy.
  - Swagger's nonce'd style, file-only scripts, and its script endpoint.
  - The media and admin policies.
  - Report-only and disabled modes.
  - Production settings place the middleware after WhiteNoise.

**Validation:**
- **Frontend:** typecheck, lint and build are clean; 259 tests pass.
  - On this machine the default fully parallel run timed out on 3 to 8 tests (5s) per run. The last commit's code did the same, with 8 and then 4 failures, so it isn't this change.
  - With `--maxWorkers=4`, all 259 passed twice in a row.
- **Backend:** 365 passed on PostgreSQL. On SQLite, 361 passed and 4 were skipped (the PostgreSQL-only concurrency tests, now including the PIN one).
- **Schema and migrations:** the schema is unchanged, and `makemigrations --check` is clean.
- **Migrations applied:** `accounts.0002` was applied to `loomdesk_prod` and to the dev `loomdesk` database (additive; no reset or reseed). `db.sqlite3` is untouched.

**Browser and server checks (Waitress, production settings, `loomdesk_prod`, enforced CSP, every violation recorded):**
- **Nonce:** the shell's policy carries a nonce matching the page's meta.
- **Dialogs:** the injected scroll-lock style carries the nonce and takes effect (`overflow: hidden`).
- **Photos:** the `blob:` preview and `/media/` photos render.
- **Reprint and mobile:** the receipt reprint prints, and five mobile routes load after a refresh.
- **Swagger UI:** renders its operations from jsDelivr.
- **Django admin:** the sign-in page is styled and shows its error, and the sixth failed sign-in on the server got 429 with `Retry-After`.
- **Cashier:** a 20% discount was refused with a wrong PIN, with no sale or stock change. The right PIN then completed `LD-000002` with ₹298 approved by Store Owner, and stock fell by one.
- **Concurrency:** eight simultaneous wrong PINs against the server's threads gave exactly 5 checked and 3 locked out, and no sale.
- **Violations:** after the zod and Select fixes, none in the app, API, docs or admin.

**Limits (also in `docs/deployment.md` §9):**
- **API sign-in throttling** is still DRF's read-then-write throttle in the cache, so a burst from one client can slightly exceed 10 a minute.
- **Per-account lockouts** let anyone who knows an admin's email lock that account's `/django-admin/` sign-in, or an approver's PIN, for 15 minutes.
- **Swagger UI** depends on jsDelivr.
- **A directly opened photo** shows unstyled, because Chrome's image viewer styles it inline.
- **After `collectstatic`,** the server must restart before the new build's files are served (WhiteNoise indexes at start-up).
- **No public deployment** and no CSP report endpoint.

### Phase 11: Assignment completion (done, 20 Oct 2026)

Scope set by the user: returns and voids, staff management, reports, settings, the matching mobile sections, and the accessibility and visual pass. The user approved decisions D1–D12 with their defaults. There was no public deployment. The original assignment brief isn't in the repository, so §10 traces requirements to this plan and the UI specification, not to the brief.

**Decisions (approved):**

| # | Decision |
|---|---|
| D1 | Voids and returns are admin-only (API `IsAdmin`), from the admin and the transaction page, not the till. |
| D2 | Only a bill from the current store day with no returns can be voided, with a reason and a confirmation. Anything else is a return. |
| D3 | Refunds go by the original method or cash. UPI and card need a reference and are labelled not gateway-verified. |
| D4 | Damaged and inspection-hold items change no stock. Held items go back later through a normal adjustment. |
| D5 | A one-time set-password link, shown once, valid 3 days, handed over in person. No email; the admin never sees the password. |
| D6 | Recharts, lazy-loaded on the Overview and Reports only. |
| D7 | Attaching a customer is out of scope; bills show "Walk-in". |
| D8 | A minimal append-only `AuditEntry`, shown as the Activity log report. |
| D9 | One register; no Register model. |
| D10 | GST rules are shown read-only in Settings. |
| D11 | `@axe-core/playwright` as a dev-only dependency. |
| D12 | One commit per sub-phase. |

**Database safety:** `loomdesk` and `loomdesk_prod` were backed up (`pg_dump -Fc`, archives verified) before their schemas changed, and the target was checked before each migration. Both were migrated, never reset or reseeded. The new migrations (`accounts.0003`, `audit.0001`, `inventory.0002`, `sales.0003`, `returns.0001`) only add tables, columns and choices. `loomdesk_prod` still holds its 2 sales, 4 movements and 2 users. `db.sqlite3` is untouched.

**11.1 Voids and returns (`816c8de`)**
- **Voids:** `POST /sales/{no}/void/`. Under the sale's row lock it checks D2, marks the sale `voided` with the reason, who and when, and puts every line back through `record_movement()` (type `void`). Sale lines, totals and the payment are kept.
- **Returns (`apps/returns`):** `Return`, `ReturnLine` and `Refund` records (`RET-000001`).
  - `create_return()` locks the sale and its earlier returns, caps each line at sold minus returned, and works the refund out from the sale line's saved values and its share of the bill discount.
  - Partial returns share out each line's discount and tax so the parts always add up to the line.
  - `POST` needs an `Idempotency-Key`; a retry returns the first result, and reusing a key for a different return is refused.
  - Only `sellable` units restock (type `return`). The sale's return state (partly returned, returned) is derived.
- **Audit (`apps/audit`):** `AuditEntry` refuses updates and deletes through the model and queryset, and `record()` rejects credential-like details.
- **Frontend:** the return wizard (invoice, lines, refund, review), the return list and detail, and the void dialog on the transaction page.
- **Tests:** 36. They cover permissions, caps, refund rounding across every split (parametrised), original values after price changes, dispositions, idempotency, immutability, void rules and audit. Five PostgreSQL thread tests: simultaneous last-unit returns, partial returns, retries with one key, a void racing a return, and simultaneous voids.

**11.2 Staff (`23cc963`)**
- **API:** `/api/v1/staff/` with list, add, edit (name, email, role), deactivate, reactivate, the approval PIN and `setup-link/`.
- **Self-protection:** admins can't change their own role or deactivate themselves, and the last active admin can't be removed. Both are checked under row locks; a PostgreSQL test has two admins demoting each other.
- **Set-password link:** shown once and valid for 3 days. Its signature covers the password hash and the time it was issued, so using it, issuing a newer one or a password change kills it.
  - `/auth/set-password/` is public and throttled, and it refuses the published demo password.
  - A PostgreSQL test submits one link twice at once: one password is set.
- **Audit:** every change is recorded, without passwords, PINs or links.
- **Frontend:** `features/staff` (list, detail, the dialogs, the one-time link dialog) and the public `/set-password/:uid/:token` page.

**11.3 Settings (`b7bd0cb`)**
- **API:** `GET/PATCH /api/v1/store/settings/` edits the store details printed on new receipts (name, code, address, state, GSTIN with a checksum) and the pricing rules. Saves are audited.
- **Frontend:** two forms, a confirmation when the GST-inclusive setting changes (open bills re-confirm their total), and the GST rules read-only. Saved sales keep their snapshot.

**11.4 Reports and the Overview (`b472c7b`)**
- **Reports:** ten from one registry: sales summary, sales by product, by staff, payment methods, returns & refunds, voids, tax summary, inventory valuation, low stock and the activity log.
  - Each has the same shape: summary metrics, typed columns, rows, an optional trend and its definitions.
  - Dates are store dates; ranges are validated (at most 366 days) and filters are checked against their options.
  - CSV export has a BOM, rupees, and formula-like text quoted.
  - All admin-only, including inventory valuation (it shows cost).
- **Frontend:**
  - DataTable gained opt-in sorting (`sortValue`, `defaultSort`, `aria-sort`, stable).
  - KpiCard gained a `definition` tooltip.
  - The report library and workspace, and the Overview. The trend chart is Recharts, lazy-loaded, with a text summary and a table toggle.
  - Report queries are invalidated after every write that changes their figures.
- **Reconciliation:** the sales-summary report matches `/sales/summary/` (dev: ₹3,003.32 over 3 bills; production: ₹2,816.10 over 2 bills).
  - Net sales are sales of completed bills minus refunds. Voided bills are excluded.
  - Tax summary splits GST into CGST and SGST with the odd paisa to SGST, as receipts do.

**11.5 Mobile (`8a81c71`)**
- **Pages:** returns (list and a read-only return), staff (list and a read-only account), reports (the library, and each report as stacked cards with date chips, the trend, CSV export and definitions), and settings (read-only).
- **Navigation:** More lists every section. A bill's returns link to their mobile pages, and report references stay inside the mobile admin.

**11.6 Accessibility and visual pass (`8ec5d12`, plus the row limit in the final commit)**
- **axe (WCAG 2.1 A/AA):** `npm run check:a11y` covers 55 pages, from public, admin desktop and admin at 360 px to billing and a dialog open. It found:
  - **Definition lists:** nested wrappers inside `<dl>` (bill totals, receipt, supplier and purchase facts). Fixed.
  - **The chart:** hidden from assistive tech but focusable through Recharts' keyboard layer. Turned off.
  - **Contrast:** a hint on the selected pricing choice failed AA. Now `ink-3`, with a contrast test.
  - After the fixes, every page passes.
- **Keyboard:** the skip link, the sortable headers (Enter and Space), the date Select, the KPI tooltips and the settings confirmation, with focus back on Save.
  - **Lagging timers:** under load in headless Chrome, Radix's timer-based focus return didn't run and focus was left on `<body>`. Dialogs now also restore focus as their content unmounts. A test holds the timers to prove it.
- **Stress (`page.route`, nothing stored):** ₹99,99,99,999.99 figures, long names and emails, at 360, 820 and 1440 px.
  - KPI figures now wrap instead of spilling out of their card.
  - 5,000 report rows took 2.8 s to draw and 3.1 s to re-sort on the production build. The workspace now draws the first 500 rows of the chosen order (sorting covers all of them), with "Show all". It draws in 1.2 s and sorts in 0.4 s.

**11.7 Final validation**
- **Frontend:** typecheck, lint and build are clean; 313 tests pass (`--maxWorkers=4`).
- **Backend:** 502 pass on PostgreSQL, including all 12 concurrency tests. On SQLite, 490 pass and 12 are skipped (those PostgreSQL-only tests). `makemigrations --check` is clean and the schema is unchanged.
- **Production server (Waitress, `config.settings.prod`, `loomdesk_prod`, enforced CSP; read-only, 26/26):**
  - The Overview chart and all ten reports render.
  - Report figures match the sales summary, and the CSV export works.
  - The void dialog opens and cancels with no change.
  - The mobile sections render with no overflow.
  - A bad set-password link is refused and offers no form.
  - A cashier gets 403 from returns, staff, reports, export, valuation, settings and void.
  - There were no console errors and no CSP violations. Recharts needed no policy change.
- **Browser checks on the dev server:** the mobile sections at 360 and 390 px (30/30), keyboard and stress (33/33), large tables (7/7), and the shell items left open since Phase 2 (6/6: Manrope on every control, the rail and phone sidebar, one primary button per group).

**Limits:** see `docs/deployment.md` §9.

---

## 10. Requirements traceability

The original assignment brief isn't in the repository, so this traces each requirement to where it came from: this plan (§7 and §8) and the UI specification (`docs/loomdesk_pos_ui_design_plan_v2.md`). It doesn't claim compliance with the brief itself. "Built" means implemented, tested and checked in a browser.

| Requirement (source) | Status | Where | Evidence |
|---|---|---|---|
| Sign-in, roles, guarded routes (§2, §6.2) | Built | `apps/accounts`, `app/guards.tsx` | Permission tests per module; cashier 403s on the production server |
| Billing with search, scan, variants, discounts, payments, receipt (§7 Billing, §8) | Built | `apps/sales`, `features/billing` | Phase 4 log; idempotent checkout tests |
| GST price bands and discount approval (§8.1, §8.2) | Built | `apps/sales/pricing.py`, `apps/accounts/attempts.py` | Pricing tests; the PIN race test |
| Products and variants (§7 Products) | Built | `apps/catalog`, `features/products` | Phase 3 log |
| Inventory, adjustments, movement history (§7 Inventory) | Built | `apps/inventory`, `features/inventory` | Phase 6 log; last-unit race tests |
| Transactions, receipts, voids (§7 Transactions) | Built | `apps/sales`, `features/transactions` | Void tests, including the race with a return |
| Returns and refunds (§7 Returns, spec returns module) | Built | `apps/returns`, `features/returns` | 36 tests, 5 on PostgreSQL threads |
| Suppliers, purchases, payments, derived balances (§7 Suppliers) | Built | `apps/suppliers`, `features/suppliers` | Phase 7 log |
| Staff and access (§7 Staff) | Built | `apps/accounts/staff.py`, `features/staff` | 28 tests, 3 on PostgreSQL threads |
| Overview (§7 Overview) | Built | `features/overview` | Overview tests; production render |
| Reports with definitions and CSV (§7 Reports) | Built | `apps/reports`, `features/reports` | 24 backend tests; reconciliation with the sales summary |
| Settings (§7 Settings) | Built, with one register (D9) and read-only GST rules (D10) | `apps/store`, `features/settings` | Settings tests |
| Audit trail for sensitive actions (D8) | Built | `apps/audit` | Append-only and no-credentials tests |
| Mobile admin, every section (§7 Mobile admin) | Built: changes limited to stock adjustments and receiving | `layouts/mobile`, `features/*/mobile` | Mobile tests; 360 and 390 px browser checks |
| Accessibility and visual pass (§7 cross-cutting, Final visual pass) | Built | `scripts/a11y.mjs`, `tests/contrast.test.ts` | axe on 55 pages; keyboard and stress checks |
| Production readiness and security (Phases 9–10) | Built, not deployed publicly | `config/settings/prod.py`, `config/csp.py` | `config/test_production.py`; production-server runs |
| Customer attach at checkout (spec billing) | Not built (D7) | — | Bills show "Walk-in" |
| Payment gateway | Not built, by design | — | Payments and refunds are recorded and labelled as not verified |
| Public deployment | Not done, by instruction | — | `docs/deployment.md` is the guide |
