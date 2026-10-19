# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

LoomDesk is a POS (point-of-sale) system for a textile/retail store, built as an interview assignment. Work follows the phases in `docs/frontend_implementation_plan.md`. **Phases 0–2 are done.** Phase 0 covers the Django project and models, session login, the typed API client, the router with role guards, and the login page. Phase 1 covers the shared design system in `frontend/src/components/`. Phase 2 covers the admin shell in `frontend/src/layouts/admin/`. Each admin module renders `AdminPlaceholderPage` until its phase replaces it, and billing and mobile admin still render `ScaffoldPage`. In dev builds, `/dev/ui` shows every shared component in every state.

## Commands

Backend commands run from `backend/` on Windows Git Bash. Python is in `.venv/Scripts/`.

```sh
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
cp .env.example .env                                  # settings are read from backend/.env
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py fetch_seed_photos      # downloads demo photos into seed/photos/
.venv/Scripts/python manage.py seed_demo [--reset]    # staff, tax rules, catalogue + stock, suppliers, customers
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
.venv/Scripts/python -m pytest                        # all tests
.venv/Scripts/python -m pytest apps/accounts/tests.py::test_logout_ends_session   # one test
.venv/Scripts/python manage.py spectacular --file schema.yml --validate           # after any API change
```

- PostgreSQL is the supported database. When Postgres isn't installed, set `DB_ENGINE=sqlite`, either in `.env` or prefixed to a command, and Django uses `db.sqlite3` instead. Tests use in-memory SQLite under that flag.
- Every seeded account uses the password `SEED_DEMO_PASSWORD` (default `loomdesk-demo`). `seed_demo` prints each account's email, role and approval PIN.

Frontend commands run from `frontend/`:

```sh
npm install
npm run dev          # http://localhost:5173 — proxies /api, /media, /django-admin, /static to Django on :8000
npm run gen:api      # regenerate src/types/api.gen.ts from backend/schema.yml (never hand-edit it)
npm run typecheck
npm run lint
npm test             # vitest run; one file: npx vitest run src/lib/money.test.ts; one test: add -t "name"
npm run build
```

- **Pinned versions:** TypeScript is pinned to 5.9 because `openapi-typescript` and `typescript-eslint` don't support TS 6/7 yet. `@hookform/resolvers` is pinned to v5 because v6 has a broken peer dependency.
- Playwright (`@playwright/test` and Chromium) is installed for browser checks, but there's no e2e suite or config yet.

## Source-of-truth documents

- `docs/frontend_implementation_plan.md`: the route map, design tokens, folder layout, API strategy, acceptance checklists and the user's decisions (§8: GST rules, discount approval). Check it before starting a phase.
- `docs/loomdesk_pos_ui_design_plan_v2.md`: the frontend specification for module behaviour, accessibility and the test checklist.
- `reference/loomdesk-ui-reference.html`: a vanilla-JS prototype that is the **primary visual reference**. Don't port its business logic: its data lives in memory and its 5% tax is illustrative. Its CSS is split across five `<style>` blocks, and the last two (`loomdesk-final-corrections`, `loomdesk-grid-and-blue-chart-fixes`) are authoritative. The third block's green palette was abandoned.

## Architecture

### Backend (`backend/`)
- **Layout:** `config/` holds the split settings (`base`, `dev`, `prod`, `test`), URLs, the error envelope and pagination. Domain apps live in `apps/*`.
- **URLs:** the API is at `/api/v1/`, with the OpenAPI schema at `/api/v1/schema/` and Swagger UI at `/api/v1/docs/`. Django's admin is at **`/django-admin/`** because the SPA owns `/admin/*`, including `/admin/mobile/`. Every other path falls through to `config/spa.py`, which serves `frontend/dist/index.html`.
- **Auth:** session-based with CSRF; there's no JWT. `LoginView` is explicitly `csrf_protect`ed because DRF skips CSRF for anonymous users. Users log in with their email. The SPA learns who is signed in from `GET /auth/session/`, which always returns 200 with `{user: Me | null}` and sets the CSRF cookie. `/auth/me/` stays protected. A wrong password returns **400** `invalid_credentials`, never 403, so it can't be confused with a CSRF failure. `User.role` (`admin`, `senior_cashier`, `cashier`) drives the permission classes in `apps/accounts/permissions.py`.
- **Store:** `GET /api/v1/store/` is admin-only and read-only. It returns `{name, code, state}` for the shell's store card. Tax and discount settings aren't exposed there.
- **SPA serving:** the production build uses `base: '/static/'`, and `STATICFILES_DIRS` points at `frontend/dist`, so Django serves the hashed assets as static files. The SPA fallback only returns `index.html`. `config/tests.py` guards this, and `pytest.ini` includes `config` in its test paths.
- **Error envelope:** every API error has the shape `{detail, code, fields}` (`config/exceptions.py`). The frontend depends on it.
- **Money and rates:** money is always **integer paise** (`*_paise` fields), and tax rates are **basis points** (`*_bp`, so 500 = 5%).
- **Stock:** `Variant` is the stock-tracked unit. `Variant.on_hand` changes **only** through `apps/inventory/services.record_movement()`, which locks the row and writes a `StockMovement`. Never assign `on_hand` directly.
- **Tax:** `TaxRule.rate_bp_for(unit_taxable_paise)` handles flat rules and the GST price-band rule (5% up to ₹2,500 per unit after discount, 18% above). The rule comes from `Product.tax_rule` if set, otherwise from the category.
- **Store settings:** `StoreSettings` is a single row (`StoreSettings.load()`). It holds `prices_include_tax` and `cashier_discount_limit_pct` (default 10%). Discounts above that limit need a Senior cashier's or Admin's approval PIN (`User.set_approval_pin` / `check_approval_pin`).

### Frontend (`frontend/src/`)
- **Layout:** `app/` holds the router, guards and providers; `App.tsx` only composes them. Layouts live in `layouts/`. Domain-free primitives go in `components/ui/`, and `components/feedback/` holds the full-page states. Each feature is a folder in `features/<name>/` containing `api.ts` (TanStack Query hooks), `pages/` and `components/`.
- **Data access:** all API calls go through `lib/http.ts`'s `apiFetch`. It handles CSRF, turns failures into `ApiError` (`isUnauthenticated` / `isForbidden`), and reports network errors as status 0. Query keys come only from `lib/queryKeys.ts`. Mutations never retry.
- **Types:** API types come from the generated `types/api.gen.ts` and are re-exported from `types/domain.ts`.
- **Admin shell:** `layouts/admin/adminNav.ts` is the single source for the sidebar, the rail, the phone drawer, the route table (`app/router.tsx` builds one `<path>/*` route per item) and page titles (route `handle.title` → `useAdminTitle`). Add a module there; don't hand-write a separate route or nav entry. Each page's `PageHeader` provides the only `<h1>`; the topbar title is plain text. Page code is lazy-loaded (`app/lazyPages.ts`) with a skeleton and an `errorElement` inside `<main>`, so the shell never blanks.
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

- **Shared components:** use the ones in `components/ui/` (Button, IconButton, TextField, Textarea, SearchInput, Select, Menu, Card, KpiCard, DataTable, StatusBadge, Dialog, ConfirmDialog, Toast/`useToast`, Skeleton, InlineAlert, PageHeader, Form layout, MoneyValue) and `components/feedback/` (EmptyState, ErrorState, StatusScreen, PageLoader). Don't restyle raw elements. Every form control wraps `Field`, which places the label above, the hint or error below, and wires the aria ids.
- **Tokens:** colours, type sizes, radii, shadows and breakpoints come from `src/styles/tokens.css`. That file is a Tailwind v4 `@theme` that **clears Tailwind's defaults**, so only token classes exist (`bg-surface`, `text-ink-2`, `rounded-card`, `text-caption`, `shadow-panel`). ESLint rejects raw hex colours in TS/TSX. Add a token instead of using an arbitrary value.
- **Typography:** use the role utilities in `src/styles/index.css` (`type-page-title`, `type-section`, `type-body`, `type-label`, `type-helper`, `type-caption`, `type-eyebrow`, `type-figure`, `type-amount`, `type-nav`) rather than combining size, weight and colour by hand.
- **Colour contrast:** `tests/contrast.test.ts` checks every colour pairing against WCAG AA, so add a pairing there when you introduce one. `muted` is the lightest colour allowed for readable text. `ink-disabled` is only for disabled controls. Field boundaries (inputs, textareas, selects, search) use `border-control-border`, which reaches 3:1. The lighter `line*` tokens are only for cards, dividers and buttons.
- **Controls:** heights are `h-control-sm`, `h-control` and `h-control-lg` (32, 38 and 44px). Use `transition-control` rather than `transition-colors`, because the latter animates `outline-color` and makes the focus ring fade in from the wrong colour.
- **Navigation links:** style the active state with `aria-[current=page]:`, not NavLink's function `className`. Radix `asChild` triggers such as `Tooltip` merge `className` as a string and silently break the function form.
- **Tooltips:** `TooltipProvider` lives in `AdminLayout`, not `AppProviders`, which keeps Radix's positioning code out of the main bundle.
- **Root font size:** `<html>` keeps the browser's default size; only `body` is set to 13px. A px size on `html` would shrink every rem-based Tailwind spacing step and override the reader's font-size preference.
- **Dialogs:** a dialog focuses the first field in its body, or Cancel if the body has none, and returns focus to whatever opened it. Wrap absolutely positioned content inside scroll containers in a `relative` element, or it widens the page; `DataTable` already does this.
- **Text and radius limits:** the smallest visible text is `text-caption` (11px), and table cells use `text-small` (12px). Radii come in three steps: `rounded-control` (10px), `rounded-card` (15px) and `rounded-panel` (17px).
- **Breakpoints:** they are mobile-first, translated from the prototype's max-width ones. `sm` starts at 561px, `md` at 821px (full sidebar), and `lg` at 1121px.
- **Fonts and icons:** the font is Manrope (`@fontsource-variable/manrope`), and its weights are tokens: `font-regular` 450, `font-medium` 500, `font-strong` 600, `font-semibold` 650, `font-bold` 700, `font-brand` 750. Icons are Lucide only. The woven LoomDesk mark (`components/brand/Brand.tsx`) is the only custom SVG.
- **Buttons:** allow one filled primary button per visual group. Icon-only buttons use `IconButton`, which requires a `label`.
- **Status and money:** show status as text as well as colour. Format money only with `lib/money.ts` (`formatMoney(paise)` gives `₹48,620.00`), and right-align amounts with the `tabular` utility.
- **States:** every API-backed view needs loading, empty, error, success and permission-denied states. If one panel fails, show the error in that panel instead of blanking the whole page.
