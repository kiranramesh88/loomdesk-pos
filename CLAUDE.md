# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

LoomDesk is a POS (point-of-sale) system for a textile/retail store, built as an interview assignment. Work follows the phases in `docs/frontend_implementation_plan.md`. **Phases 0–11 are done** (Phase 3 is Products, Phase 4 is Billing, Phase 5 is Transactions with an initial sales summary, Phase 6 is Inventory, Phase 7 is Suppliers and Purchasing, Phase 8 is Mobile admin, Phase 9 is deployment and production readiness, Phase 10 is security hardening, and Phase 11 is assignment completion; Phase 12, deployment readiness, has made sign-in throttling row-locked and prepared the Docker image and Render Blueprint, and awaits approval to deploy; see the plan's §9, and §10 for the requirements traceability). Phase 0 covers the Django project and models, session login, the typed API client, the router with role guards, and the login page. Phase 1 covers the shared design system in `frontend/src/components/`. Phase 2 covers the admin shell in `frontend/src/layouts/admin/`. Phase 3 covers the Products module (`apps/catalog` API, `features/products`). Phase 4 covers Billing (`apps/sales`, `features/billing`, `layouts/billing`). Phase 5 covers Transactions (`features/transactions`, plus the history endpoints in `apps/sales`). Phase 6 covers Inventory (`apps/inventory` API, `features/inventory`). Phase 7 covers Suppliers (`apps/suppliers`, `features/suppliers`). Phase 8 covers Mobile admin (`layouts/mobile`, plus a `mobile/` folder in each feature). Phase 9 covers production settings, static and media serving, and the store-setup commands; `docs/deployment.md` is the deploy guide. Phase 10 covers the row-locked attempt limits (`apps/accounts/attempts.py`), the sign-in-limited Django admin (`config/admin_site.py`) and the Content-Security-Policy (`config/csp.py`). Phase 11 covers voids and returns (`apps/returns`, `apps/audit`, `features/returns`), staff accounts (`apps/accounts/staff.py`, `features/staff`), store settings (`features/settings`), reports and the Overview (`apps/reports`, `features/reports`, `features/overview`), their mobile pages, and an accessibility pass. Every module in `adminNav.ts` is built. `AdminPlaceholderPage` stays for any future module, which renders it until an entry is added to `MODULE_ROUTES` in `app/router.tsx`. In dev builds, `/dev/ui` shows every shared component in every state.

## Commands

Backend commands run from `backend/` on Windows Git Bash. Python is in `.venv/Scripts/`.

```sh
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
cp .env.example .env                                  # settings are read from backend/.env
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py fetch_seed_photos [--force]   # downloads demo photos into seed/photos/
.venv/Scripts/python manage.py seed_demo [--reset]    # staff, tax rules, catalogue + stock, suppliers, customers
.venv/Scripts/python manage.py seed_demo --refresh-photos   # replace only the seed products' photos
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
.venv/Scripts/python -m pytest                        # all tests
.venv/Scripts/python -m pytest apps/accounts/tests.py::test_logout_ends_session   # one test
.venv/Scripts/python manage.py spectacular --file schema.yml --validate           # after any API change
```

- PostgreSQL is the supported database, and local development uses a PostgreSQL database named `loomdesk`. When Postgres isn't installed, set `DB_ENGINE=sqlite`, either in `.env` or prefixed to a command, and Django uses `db.sqlite3` instead. Tests use in-memory SQLite under that flag.
- **Database selection:** a variable set in the real environment beats `backend/.env` (the file only fills gaps).
  - `DB_ENGINE=sqlite` prefixed to a command always means SQLite.
  - Without it, and with no `DB_ENGINE` in `.env`, every command uses PostgreSQL with the `POSTGRES_*` values.
- **Tests on PostgreSQL:** run pytest without `DB_ENGINE`. pytest-django uses `config.settings.test` and creates, then drops, a throwaway `test_<POSTGRES_DB>` database, so the role needs `CREATEDB`. If a database with that name already exists, it is dropped without asking.
  - The concurrent last-unit checkout and last-units adjustment tests run only on PostgreSQL.
  - Windows install: PostgreSQL 18 runs as the `postgresql-x64-18` service. Its tools (`psql`, `pg_isready`) are in `C:\Program Files\PostgreSQL\18\bin`, not on PATH.
- Every seeded account uses the password `SEED_DEMO_PASSWORD` (default `loomdesk-demo`). `seed_demo` prints each account's email, role and approval PIN. It refuses to run under `config.settings.prod`; a real store uses `setup_store` (store record, GST rules, categories) and `create_staff` (prompts for the password and PIN) instead.
- A hosted demo adds `load_demo_catalogue`: the demo products, stock and suppliers with **no accounts**, allowed under production settings, refusing any store that already has products, stock, suppliers, purchases or sales. It and `seed_demo` share `apps/store/demo_catalogue.py`.
- **Dependencies are pinned exactly** (`requirements.txt`, `requirements-dev.txt`, Python in `.python-version`). To upgrade, change a pin, reinstall, run both suites, then commit.
- **Image:** `docker build -t loomdesk .` from the repository root (`Dockerfile`, `.dockerignore`). The container runs `deploy/start.sh`, which needs `WAITRESS_TRUSTED_PROXY`. `render.yaml` is the Render Blueprint (`docs/deployment.md` §10); applying it creates paid resources. `.github/workflows/ci.yml` runs the tests and builds the image.

Frontend commands run from `frontend/`:

```sh
npm install
npm run dev          # http://localhost:5173 — proxies /api, /media, /django-admin, /static to Django on :8000
npm run gen:api      # regenerate src/types/api.gen.ts from backend/schema.yml (never hand-edit it)
npm run typecheck
npm run lint
npm test             # vitest run; one file: npx vitest run src/lib/money.test.ts; one test: add -t "name"
                     # on a busy machine some tests hit the 5s timeout; npx vitest run --maxWorkers=4 is reliable
npm run build
npm run check:a11y   # axe (WCAG 2.1 A/AA) over every page; needs both dev servers and the seed accounts; read-only
```

- **Pinned versions:** TypeScript is pinned to 5.9 because `openapi-typescript` and `typescript-eslint` don't support TS 6/7 yet. `@hookform/resolvers` is pinned to v5 because v6 has a broken peer dependency.
- Playwright (`@playwright/test` and Chromium) is installed for browser checks, but there's no e2e suite or config yet. `@axe-core/playwright` (dev only) drives `scripts/a11y.mjs`.
- **Recharts** draws the trend charts. It is lazy-loaded (`features/reports/components/TrendChart.tsx`, its own ~350 kB chunk) on the Overview and Reports only.

## Source-of-truth documents

- `docs/frontend_implementation_plan.md`: the route map, design tokens, folder layout, API strategy, acceptance checklists and the user's decisions (§8: GST rules, discount approval). Check it before starting a phase.
- `docs/loomdesk_pos_ui_design_plan_v2.md`: the frontend specification for module behaviour, accessibility and the test checklist.
- `reference/loomdesk-ui-reference.html`: a vanilla-JS prototype that is the **primary visual reference**. Don't port its business logic: its data lives in memory and its 5% tax is illustrative. Its CSS is split across five `<style>` blocks, and the last two (`loomdesk-final-corrections`, `loomdesk-grid-and-blue-chart-fixes`) are authoritative. The third block's green palette was abandoned.

## Architecture

### Backend (`backend/`)
- **Layout:** `config/` holds the split settings (`base`, `dev`, `prod`, `test`), URLs, the error envelope and pagination. Domain apps live in `apps/*`.
- **Production settings (`config.settings.prod`, the default for `wsgi.py`):** they never read `backend/.env`, and they stop at start-up when a required variable is missing (secret key, allowed hosts, `POSTGRES_*`). They refuse SQLite. `config/test_production.py` loads them in a subprocess with a clean environment. WhiteNoise serves `/static/` and Waitress is the WSGI server; `docs/deployment.md` lists every variable.
- **Attempt limits:** the approval PIN (5 per approver) and `/django-admin/` sign-in (5 per account, 10 per address) count in `AttemptGuard` rows through `apps/accounts/attempts.reserve()`. Each attempt is counted and committed under a row lock *before* the secret is checked, so simultaneous guesses can't exceed the limit.
  - This only works outside the request transaction, so those views use `transaction.non_atomic_requests`. Checkout checks the PIN before opening the sale's transaction.
  - For such views, `config/exceptions.py` keeps DRF from marking an enclosing transaction for rollback (in tests, pytest's).
  - The PostgreSQL thread test `test_simultaneous_wrong_pins_cannot_exceed_the_limit` proves the limit holds. It fails against the old read-then-write count.
- **Django admin:** `config.apps.LoomDeskAdminConfig` replaces `django.contrib.admin` in `INSTALLED_APPS`, so `admin.site` is the sign-in-limited `config/admin_site.LoomDeskAdminSite`.
- **Content-Security-Policy (`config/csp.py`):** a policy per path (the app, `/api/`, Swagger UI, `/media/`, `/django-admin/`), with a per-request nonce (`request.csp_nonce`) and no `'unsafe-inline'` or `'unsafe-eval'` anywhere.
  - `spa_index` writes the nonce into `index.html`, and `frontend/src/lib/cspNonce.ts` hands it to Radix (the `__webpack_nonce__` global for dialogs, the `nonce` prop on Select's viewport).
  - A new library that injects `<style>` elements needs the same treatment.
  - It's off in dev (`LOOMDESK_CSP_ENABLED`), and `DJANGO_CSP_REPORT_ONLY=true` sends it as report-only.
  - Swagger UI uses `SpectacularSwaggerSplitView` with `config/templates/loomdesk/swagger_ui.html`.
- **API throttling (`apps/accounts/throttling.py`):** sign-in and set-password links (10/min per client) use `LockedScopedRateThrottle`, a sliding window in one `ThrottleWindow` row per scope and address, read and written under `SELECT … FOR UPDATE` in its own committed transaction. It holds across workers, and nothing relies on Django's cache.
  - A throttled view must use `transaction.non_atomic_requests` on `dispatch`; the throttle raises `ImproperlyConfigured` otherwise, and a test checks every throttled endpoint uses it.
  - The client is `REMOTE_ADDR` only, never `X-Forwarded-For`. Behind a proxy, Waitress's `--trusted-proxy` flags set it (`docs/deployment.md` §6).
  - Deploy checks `loomdesk.E001`–`E002` (`apps/store/checks.py`) guard the build and the collected assets.
- **URLs:** the API is at `/api/v1/`, with the OpenAPI schema at `/api/v1/schema/` and Swagger UI at `/api/v1/docs/`. Django's admin is at **`/django-admin/`** because the SPA owns `/admin/*`, including `/admin/mobile/`. Every other path falls through to `config/spa.py`, which serves `frontend/dist/index.html`.
- **Auth:** session-based with CSRF; there's no JWT. `LoginView` is explicitly `csrf_protect`ed because DRF skips CSRF for anonymous users. Users log in with their email. The SPA learns who is signed in from `GET /auth/session/`, which always returns 200 with `{user: Me | null}` and sets the CSRF cookie. `/auth/me/` stays protected. A wrong password returns **400** `invalid_credentials`, never 403, so it can't be confused with a CSRF failure. `User.role` (`admin`, `senior_cashier`, `cashier`) drives the permission classes in `apps/accounts/permissions.py`.
- **Store:** `GET /api/v1/store/` is admin-only and read-only. It returns `{name, code, state}` for the shell's store card. Tax and discount settings aren't exposed there.
- **SPA serving:** the production build uses `base: '/static/'`, and `STATICFILES_DIRS` points at `frontend/dist`, so Django serves the hashed assets as static files. The SPA fallback only returns `index.html`, with `Cache-Control: no-cache`; a missing asset is a plain 404 and an unknown `/api/` path gets the JSON error envelope. `config/tests.py` guards this, and `pytest.ini` includes `config` in its test paths.
- **Error envelope:** every API error has the shape `{detail, code, fields}` (`config/exceptions.py`). The frontend depends on it.
- **Money and rates:** money is always **integer paise** (`*_paise` fields), and tax rates are **basis points** (`*_bp`, so 500 = 5%).
- **Catalogue API:** `/api/v1/catalog/` (`products/`, `categories/`, `tax-rules/`) is admin-only. Products have a unique style `sku` and are deactivated (`status=inactive`), never deleted. A product save replaces its variant list atomically, and nested errors come back as dotted paths (`variants.2.sku`) that map onto react-hook-form names.
- **Billing and sales API:** staff (`IsStaffMember`) use `/api/v1/billing/` (`products/`, `categories/`, `approvers/`, `settings/`) and `/api/v1/sales/` (`quote/`, `POST /`, `{invoice_no}/`). The till never sees cost prices. All bill maths lives in `apps/sales/pricing.py`, and `services.checkout()` writes the sale, lines, payment and stock movements in one transaction. Checkout requires an `Idempotency-Key` UUID header and the confirmed `expected_total_paise` (a mismatch gives 409 `total_changed`). An over-limit discount carries `approver_id` and `approval_pin`. Sales are immutable snapshots, including the store details and the approver's name printed on the receipt. `GET /sales/` lists history with filters (`q`, `date_from`, `date_to`, `cashier`, `method`, `status`). `visible_sales()` scopes both list and detail: cashiers see only their own sales. `/sales/summary/` and `/sales/cashiers/` are admin-only.
- **Stock:** `Variant` is the stock-tracked unit. `Variant.on_hand` changes **only** through `apps/inventory/services.record_movement()`, which locks the row and writes a `StockMovement`. Never assign `on_hand` directly.
- **Inventory API:** `/api/v1/inventory/` (`variants/`, `variants/{id}/`, `summary/`, `movements/`, `adjustments/`) is admin-only. Manual adjustments go through `services.adjust_stock()`: kind `add`, `remove` or `count`, a required reason, and the previewed `expected_on_hand`, which is compared under the row lock (a mismatch gives 409 `stock_changed`). Movements are append-only. Low stock means 1 to the variant's `reorder_level`.
- **Suppliers API:** `/api/v1/suppliers/` is admin-only. Suppliers are deactivated, never deleted.
  - A `Purchase` (`PUR-000001`) is recorded with no stock effect. `POST …/purchases/{number}/receive/` adds stock once, atomically, through `record_movement()` (type `purchase`, with the purchase number as reference). A repeat gets 409 `already_received`.
  - Recording a purchase and recording a payment both need an `Idempotency-Key`.
  - Supplier payments are entered by staff and are never gateway-verified.
  - `GET /suppliers/purchases/` lists purchases from every supplier (`status`, `q`). Purchase lines carry read-only `current_on_hand` for the receive preview.
- **Voids:** `POST /sales/{invoice_no}/void/` (admin) needs a reason, and only a sale from the current store day with no returns can be voided. It locks the sale, marks it `voided` and puts the stock back through `record_movement()` (type `void`). Anything else is a return.
- **Returns API:** `/api/v1/returns/` (`invoice/{no}/` for what can still be returned, `quote/`, `POST /`, `{number}/`) is admin-only. `services.create_return()` locks the sale, caps each line at sold minus already returned, and works the refund out from the sale's snapshots and its allocated discount, never the browser's figures. A `Return` (`RET-000001`) has its lines and one `Refund` (original method or cash; UPI and card need a reference and are never gateway-verified). Only the `sellable` disposition restocks (type `return`); damaged and inspection-hold items change no stock. `POST` needs an `Idempotency-Key`. The sale itself never changes; its return state is derived.
- **Audit:** `apps/audit.record()` writes an append-only `AuditEntry` for voids, returns, staff changes and settings saves. Never put a password, PIN, token or link in its details. It's shown as the Activity log report.
- **Staff API:** `/api/v1/staff/` (`{id}/`, `deactivate/`, `reactivate/`, `pin/`, `setup-link/`) is admin-only. New staff get a one-time set-password link, shown once and valid 3 days (`PASSWORD_RESET_TIMEOUT`); a newer link, a used one or a password change invalidates it. `/auth/set-password/…` is public and throttled (`set_password`, 10/min). Admins never see or set a password. An admin can't demote or deactivate themselves or the last active admin. Deactivation ends the account's sessions and keeps its history.
- **Store settings API:** `GET/PATCH /api/v1/store/settings/` (admin) edits the store details printed on receipts and the pricing rules (`prices_include_tax`, `cashier_discount_limit_pct`); saves are audited. GST rules are read-only (`/catalog/tax-rules/`). Saved sales keep their own snapshot.
- **Reports API:** `/api/v1/reports/` lists the reports in `apps/reports/reports.REPORTS`; `/reports/{key}/` returns one shape (summary metrics, typed columns, rows, an optional trend and the definitions shown on screen), and `/reports/{key}/export/` the same rows as CSV (BOM, rupees, formula-like text quoted). All admin-only. Dates are store dates, default the last 30 days, at most 366; rows stop at 5,000 (`truncated`). Net sales are sales of completed bills minus refunds; voided bills are excluded, and payments are recorded, not verified.
- **Store date:** `GET /store/` includes `today`, the store's local date. Use it for "today" figures rather than the browser's clock.
  - The balance is received purchases minus payments. It's derived, never stored.
  - Product and Supplier statuses share the schema enum `ActiveStatusEnum`.
- **Tax:** `TaxRule.rate_bp_for(unit_taxable_paise)` handles flat rules and the GST price-band rule (5% up to ₹2,500 per unit after discount, 18% above). The rule comes from `Product.tax_rule` if set, otherwise from the category.
- **Store settings:** `StoreSettings` is a single row (`StoreSettings.load()`). It holds `prices_include_tax` (default False: prices exclude GST, which is added at checkout) and `cashier_discount_limit_pct` (default 10%). Discounts above that limit need a Senior cashier's or Admin's approval PIN (`User.set_approval_pin` / `check_approval_pin`).

### Frontend (`frontend/src/`)
- **Layout:** `app/` holds the router, guards and providers; `App.tsx` only composes them. Layouts live in `layouts/`. Domain-free primitives go in `components/ui/`, and `components/feedback/` holds the full-page states. Each feature is a folder in `features/<name>/` containing `api.ts` (TanStack Query hooks), `pages/` and `components/`.
- **Data access:** all API calls go through `lib/http.ts`'s `apiFetch` (download links build on its exported `API_BASE`). It handles CSRF, turns failures into `ApiError` (`isUnauthenticated` / `isForbidden`), and reports network errors as status 0. Query keys come only from `lib/queryKeys.ts`. Mutations never retry.
- **Types:** API types come from the generated `types/api.gen.ts` and are re-exported from `types/domain.ts`.
- **Admin shell:** `layouts/admin/adminNav.ts` is the single source for the sidebar, the rail, the phone drawer, the route table (`app/router.tsx` builds one `<path>/*` route per item) and page titles (route `handle.title` → `useAdminTitle`). Add a module there; don't hand-write a separate route or nav entry. Each page's `PageHeader` provides the only `<h1>`; the topbar title is plain text. Page code is lazy-loaded (`app/lazyPages.ts`) with a skeleton and an `errorElement` inside `<main>`, so the shell never blanks.
- **Mobile admin:** `/admin/mobile/*` uses `layouts/mobile/MobileAdminLayout` (header, single column, fixed bottom nav). `mobileNav.ts` holds the tabs and More items, and `mobileRoutes.tsx` holds the routes with `{title, tab}` handles. Pages live in `features/<name>/mobile/`, reuse the feature hooks, and use `MobilePageHeader`, `MobilePanel` and `MobileRow` from `layouts/mobile/MobilePage.tsx`. Writes on mobile are limited to the stock adjustment (a two-step review) and receiving a purchase; returns, staff, reports and settings are read-only there, and everything else links to the full admin.
- **Reports and Overview:** `features/reports` holds the library, the workspace (dates and filters in the URL, metric tiles, a trend with a text summary and a table toggle, a sortable table that draws the first 500 rows, CSV export, definitions) and `mobile/`. `features/overview` is `/admin` (last 7 store days by default; each panel loads and fails on its own). After any sale, return, void, adjustment, receipt, staff or settings change, invalidate `queryKeys.reports.all`.
- **Billing:** the bill is reducer state in `features/billing/bill.ts`, saved per user to `sessionStorage`, together with its checkout key, which is cleared whenever the bill changes. The panel shows only the server's `POST /sales/quote/` figures (`useBillQuote`) and never does tax maths in the browser.
- **Routing:** `RequireRole` (in `app/guards.tsx`) redirects anonymous users to `/login?next=…` and the wrong role to `/403`. Admins land on `/admin`, everyone else on `/billing`. `safeNextPath` rejects external `next` values.
- **Testing:** test helpers are in `src/test/render.tsx`. `renderRoutes` renders a memory router with a fresh query client and the toast provider. `app/router.tsx` exports `routes`, so tests can mount the real route table. jsdom matches no media query, so shell tests see the phone layout unless they stub `window.matchMedia`. Tests mock `fetch` instead of the hooks.

## Domain rules that cut across modules

These are easy to get wrong. The backend must enforce them, not just the UI.

- **Immutable sales.** Sold lines keep a snapshot of name, SKU, HSN, price, tax rate and tax amount at the time of sale. Completed bills are never edited. A void needs a reason, a permission check and a confirmation.
- **Tax calculation order.** Calculate line totals, then the bill discount (shared across lines in proportion to value), then each line's taxable value, then GST per unit. Pick the GST slab using each unit's value after discount.
- **Returns** create a separate return record and a separate refund record. The maximum returnable quantity is sold minus already returned. The refund uses the original transaction values. Items are restocked only if the chosen disposition is sellable. The original sale never changes; its return state is derived.
- **Supplier balances** are derived from purchase and payment entries and are never typed in directly.
- **Payments:** label manually recorded payments as not gateway-verified. Don't count unconfirmed payments as revenue. Checkout must be idempotent (send an `Idempotency-Key` header) so a double-submit can't create two sales.
- **Roles:** every option hidden in the UI must have a matching API permission check. Deactivating an account keeps its history.
- **Reports** use real API data with documented metric definitions (gross, discounts, returns, net). Call the ledger an "operational ledger" unless proper double-entry accounting is implemented.
- **After mutations,** invalidate the affected queries: a sale affects transactions and inventory, and a return affects returns, stock and reports. Don't apply optimistic updates to financial actions.

## UI conventions

- **Shared components:** use the ones in `components/ui/` (Button, IconButton, TextField, Textarea, SearchInput, Select, Menu, Card, KpiCard (with an optional `definition` tooltip), DataTable (opt-in `sortValue` per column, `defaultSort`, `limit`), StatusBadge, Dialog, ConfirmDialog, Toast/`useToast`, Skeleton, InlineAlert, PageHeader, Form layout, MoneyValue) and `components/feedback/` (EmptyState, ErrorState, StatusScreen, PageLoader). Don't restyle raw elements. Every form control wraps `Field`, which places the label above, the hint or error below, and wires the aria ids.
- **Tokens:** colours, type sizes, radii, shadows and breakpoints come from `src/styles/tokens.css`. That file is a Tailwind v4 `@theme` that **clears Tailwind's defaults**, so only token classes exist (`bg-surface`, `text-ink-2`, `rounded-card`, `text-caption`, `shadow-panel`). ESLint rejects raw hex colours in TS/TSX. Add a token instead of using an arbitrary value.
- **Typography:** use the role utilities in `src/styles/index.css` (`type-page-title`, `type-section`, `type-body`, `type-label`, `type-helper`, `type-caption`, `type-eyebrow`, `type-figure`, `type-amount`, `type-nav`) rather than combining size, weight and colour by hand.
- **Colour contrast:** `tests/contrast.test.ts` checks every colour pairing against WCAG AA, so add a pairing there when you introduce one. `muted` is the lightest colour allowed for readable text. `ink-disabled` is only for disabled controls. Field boundaries (inputs, textareas, selects, search) use `border-control-border`, which reaches 3:1. The lighter `line*` tokens are only for cards, dividers and buttons.
- **Controls:** heights are `h-control-sm`, `h-control` and `h-control-lg` (32, 38 and 44px). Use `transition-control` rather than `transition-colors`, because the latter animates `outline-color` and makes the focus ring fade in from the wrong colour.
- **Navigation links:** style the active state with `aria-[current=page]:`, not NavLink's function `className`. Radix `asChild` triggers such as `Tooltip` merge `className` as a string and silently break the function form.
- **Tooltips:** `TooltipProvider` lives in `AdminLayout`, not `AppProviders`, which keeps Radix's positioning code out of the main bundle.
- **Root font size:** `<html>` keeps the browser's default size; only `body` is set to 13px. A px size on `html` would shrink every rem-based Tailwind spacing step and override the reader's font-size preference.
- **Dialogs:** a dialog focuses the first field in its body, or Cancel if the body has none, and returns focus to whatever opened it (also as its content unmounts, so lagging timers can't leave focus on `<body>`). Inside a `<dl>`, keep each `dt`/`dd` pair directly in the list or in one `div`, with nothing else in between; axe flags anything else. Wrap absolutely positioned content inside scroll containers in a `relative` element, or it widens the page; `DataTable` already does this.
- **Text and radius limits:** the smallest visible text is `text-caption` (11px), and table cells use `text-small` (12px). Radii come in three steps: `rounded-control` (10px), `rounded-card` (15px) and `rounded-panel` (17px).
- **Breakpoints:** they are mobile-first, translated from the prototype's max-width ones. `sm` starts at 561px, `md` at 821px (full sidebar), and `lg` at 1121px.
- **Fonts and icons:** the font is Manrope (`@fontsource-variable/manrope`), and its weights are tokens: `font-regular` 450, `font-medium` 500, `font-strong` 600, `font-semibold` 650, `font-bold` 700, `font-brand` 750. Icons are Lucide only. The woven LoomDesk mark (`components/brand/Brand.tsx`) is the only custom SVG.
- **Buttons:** allow one filled primary button per visual group. Icon-only buttons use `IconButton`, which requires a `label`.
- **Status and money:** show status as text as well as colour. Format money only with `lib/money.ts` (`formatMoney(paise)` gives `₹48,620.00`), and right-align amounts with the `tabular` utility.
- **States:** every API-backed view needs loading, empty, error, success and permission-denied states. If one panel fails, show the error in that panel instead of blanking the whole page.
