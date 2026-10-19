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
| `/admin/inventory` | `InventoryPage` (`?q=&state=low|out`); the adjustment form is a dialog |
| `/admin/inventory/movements` | `StockMovementsPage` (`?variant=&type=&from=&to=`) |
| `/admin/transactions` | `TransactionListPage` (`?q=&from=&to=&method=&cashier=&status=`) |
| `/admin/transactions/:invoiceNo` | `TransactionDetailPage` |
| `/admin/returns` | `ReturnListPage` |
| `/admin/returns/new` | `ReturnWizardPage` (`?invoice=` to prefill from a transaction) |
| `/admin/returns/:returnNo` | `ReturnDetailPage` |
| `/admin/suppliers` | `SupplierListPage` |
| `/admin/suppliers/:id` | `SupplierProfilePage` (`?tab=activity|purchases|payments|statement`) |
| `/admin/staff` | `StaffListPage`; add and edit are dialogs |
| `/admin/reports` | `ReportLibraryPage` |
| `/admin/reports/:reportKey` | `ReportWorkspacePage` (`?from=&to=&…`) |
| `/admin/settings` | `SettingsPage` |

### Mobile admin (Admin): the mandatory `/admin/mobile/`
| Path | Page | Bottom tab |
|---|---|---|
| `/admin/mobile/` | `MobileOverviewPage` | Overview |
| `/admin/mobile/products` · `/products/:id` · `/products/new` · `/products/:id/edit` | list, detail, form | Products |
| `/admin/mobile/bills` · `/bills/:invoiceNo` | transaction list and detail | Bills |
| `/admin/mobile/more` | `MobileMoreMenu` | More |
| `/admin/mobile/inventory` · `/returns` · `/returns/new` · `/returns/:returnNo` · `/suppliers` · `/suppliers/:id` · `/staff` · `/reports` · `/reports/:reportKey` · `/settings` | mobile versions of each module | More (highlighted) |

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
1. Catalog search calls `GET /catalog/variants/?q=&category=` (it also matches barcodes) and returns variant-level stock and the current price.
2. The bill is **local state** (`BillProvider` with a reducer), saved to `sessionStorage` so an accidental refresh doesn't lose the cart.
3. `lib/billPreview.ts` calculates a **preview** with the same rules as the server (B1, B2). It's unit-tested against shared fixtures.
4. Checkout calls `POST /sales/` with an `Idempotency-Key` header, a UUID created when the payment dialog opens. The server rechecks stock and prices, recalculates every total, writes Sale, Lines (snapshots), Payment and StockMovements in **one DB transaction**, and returns the authoritative invoice. If its totals differ from the preview, the UI shows the server's figures and flags the difference before confirming.
5. While the request is pending, the submit button is disabled. A retry with the same key returns the original sale instead of creating a duplicate.

### 6.5 Images
`Product.image` (one photo per product for now) uses Django `ImageField` storage, served from `/media/` (an object store in production). The API returns absolute URLs. `ProductPhoto` enforces one treatment everywhere: `object-contain` on a white background, a fixed aspect ratio, lazy loading, and the `ImageOff` placeholder as the fallback.

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

---

## 7. Acceptance checklists

Every checklist assumes the cross-cutting checks pass:
- [ ] Loading, empty, error (with retry) and permission-denied states all exist.
- [ ] Only Lucide icons are used.
- [ ] Tokens are used, with no raw hex values in components.
- [ ] Keyboard access and visible focus work.
- [ ] Nothing overflows horizontally at 360 px.
- [ ] Figures come from the API.

### Design system and shells
- [ ] Manrope loads everywhere, including inputs and buttons. No fallback flash on cached loads.
- [ ] The sidebar's active state matches the route, including nested routes (`/admin/products/12` highlights Products).
- [ ] At ≤820 px the sidebar collapses to a rail with tooltips. At ≤560 px desktop admin hides the sidebar, and a link to `/admin/mobile/` is offered.
- [ ] Each visual group has at most one filled primary button.
- [ ] Dialogs trap focus, close on Esc (non-destructive dialogs only) and return focus to their trigger.
- [ ] Cashiers can't reach `/admin/*`, either by URL or by API (403). They don't see admin links in the billing topbar.

### Billing
- [ ] Search by name, SKU or barcode. A barcode scan plus Enter adds the item directly when it matches a single variant.
- [ ] `/` focuses the search box. The no-results state has a "Clear search" action.
- [ ] Category chips filter the results, and the count updates.
- [ ] Out-of-stock variants show "Out of stock" as text and can't be added. Quantity can't exceed available stock.
- [ ] The variant picker shows the stock for each size and colour combination.
- [ ] The bill panel stays visible on desktop, and the total and CTA are always on screen.
- [ ] An empty bill shows an empty state, and checkout is disabled.
- [ ] The summary shows subtotal, discount, taxable value, tax and total, in the order from B1.
- [ ] Discount respects the role limit (§8.2), and the server enforces it.
- [ ] The payment dialog shows the amount due. For cash, an amount below the due blocks completion and change is calculated. UPI and card require a reference and are labelled "Recorded by cashier, not gateway-verified".
- [ ] Double-clicking, retrying or refreshing during submit never creates two sales (tested with the idempotency key).
- [ ] The success dialog shows the invoice number and offers Print receipt and New sale. The receipt prints without app chrome and includes line items, tax breakdown and payment.
- [ ] Refreshing mid-bill keeps the cart.

### Overview
- [ ] One date range drives every date-dependent panel and is shown as a visible label.
- [ ] The KPIs are Net sales, Bills completed, Average bill and Low-stock variants, each with a definition tooltip.
- [ ] Comparisons appear only when comparison data exists.
- [ ] The trend chart (Recharts) uses a single blue line with faint gridlines and has a text summary or table alternative.
- [ ] If one panel fails, it shows its own retry state and the others still render.
- [ ] Clicking a low-stock row opens inventory, and clicking a bill opens its transaction.
- [ ] Before the first sale, a first-use empty state is shown.

### Products
- [ ] Search and the filters (category, availability, stock state) are reflected in the URL. Active filters are shown with a Clear action.
- [ ] The table shows Product (with photo), SKU, Category, Price, Stock (as text), Status and Actions. Long names wrap without clipping.
- [ ] The form has sections for Info, Pricing & tax, Variants and Inventory. Errors are inline and values are kept after a server error.
- [ ] Duplicate SKUs and barcodes are rejected by the server and the error is shown on the field.
- [ ] Archiving requires confirmation. Editing a product doesn't change past invoices (verified on an existing sale).
- [ ] Cost and margin are visible only to Admin.

### Inventory
- [ ] The summary shows tracked variant, low-stock and out-of-stock counts.
- [ ] The adjustment form has a variant, a type (add, remove or set counted), quantity and reason. A reason is required for remove and set. It previews current → resulting quantity before confirming.
- [ ] Negative stock is rejected by the server.
- [ ] Every change appears in movement history with its type, delta, linked reference, actor, time and reason.

### Transactions
- [ ] Search by invoice number or customer, and filter by date, method, cashier and status.
- [ ] Amounts are right-aligned, and statuses use a consistent badge.
- [ ] The detail page uses an invoice layout: lines, discounts, tax breakdown, payments with a "manually recorded" label, and linked returns.
- [ ] There's no edit action. Voiding requires the permission, a reason and a confirmation, and creates an audit entry.
- [ ] Reprint works from the detail page.

### Returns
- [ ] The wizard starts from an invoice (search or scan) and shows sold, already returned and eligible quantities for each line.
- [ ] Quantity is capped at the eligible amount, by both the UI and the server.
- [ ] The refund is calculated by the server from the original line values. The review step shows refund amount, method and disposition before confirming.
- [ ] Items go back into stock only for the "sellable" disposition, as a movement record.
- [ ] The original sale isn't changed. The transaction shows a derived "Partially returned" or "Returned" state and a link to the return.

### Suppliers
- [ ] The list shows Name, Category, Contact, Recorded balance (labelled as such), Status and Actions.
- [ ] The profile has tabs for Activity, Purchases, Payments and Statement. The statement shows a running balance with references.
- [ ] The contact form has no balance field. Balances change only through purchase and payment entries.

### Staff and access
- [ ] The list shows Name, Email, Role, Status and Last activity (only if tracked), with an Active/Inactive filter.
- [ ] Adding a user uses an invite or set-password flow. Passwords are never displayed.
- [ ] Changing a role or deactivating a user takes effect in the API immediately. Deactivated users keep their history.
- [ ] Every role-gated UI element has a matching API permission test.

### Reports
- [ ] The library lists only reports that are actually implemented.
- [ ] Each report workspace has a date range, filters, a summary row, a chart only where it shows a trend, a sortable table and CSV export.
- [ ] Gross, discounts, returns and net are defined on screen. Unconfirmed payments are excluded, and the original transaction values are used.

### Settings
- [ ] Store name, code and address (printed on receipts), plus register and tax defaults. Changing them doesn't affect past invoices.

### Mobile admin
- [ ] `/admin/mobile/` and every sub-route work on a direct load, on refresh and with browser back.
- [ ] The bottom nav (Overview, Products, Bills, More) shows the active state, and More is highlighted on its child pages.
- [ ] Every admin section is reachable from More. There are no placeholders.
- [ ] Tables become card rows (primary label, metadata, and amount, status or action on the right).
- [ ] Forms open as full-screen pages or bottom sheets with a reachable Close or Back.
- [ ] Frequent actions are ≥44 px. Nothing overflows horizontally at 360×800 and 390×844 (Playwright).
- [ ] A slow or failing request shows a retry state, never a blank screen.

### Final visual pass
- [ ] Radii, shadows and spacing match the §4 tokens on every page.
- [ ] Pages are tested with long product names, ₹10,00,000+ amounts, zero transactions and 500+ rows.
- [ ] All product photos use the same `ProductPhoto` treatment.

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
