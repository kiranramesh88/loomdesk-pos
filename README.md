# LoomDesk POS

LoomDesk is a point-of-sale and back-office system for a textile and garment store. It was built for a technical interview assignment. Cashiers ring up bills at the till; the owner manages products, stock, suppliers, returns, staff, reports and settings from an admin that also works on a phone.

> **Assignment scope:** the original assignment brief isn't in this repository. Requirements are traced to the project plan and UI specification (`docs/frontend_implementation_plan.md` §10), not to the brief itself.

## What it does

- **Billing:** product search and barcode lookup, sizes and colours, line and bill discounts, cash, UPI and card payments, and a printable GST receipt.
  - Discounts above the cashier's limit need a senior cashier's or admin's approval PIN.
  - Checkout is idempotent, so a double click can't create two sales.
- **GST:** each unit's slab follows its value after discount: 5% up to ₹2,500, 18% above. All bill maths runs on the server.
- **Products and inventory:** products with variants, stock adjustments with reasons, a stock movement history, and low-stock alerts. Stock only changes through recorded, row-locked movements.
- **Transactions, voids and returns:** sales history, receipts, same-day voids, and returns with refunds worked out from the original sale. Sales are never edited.
- **Suppliers and purchasing:** purchases, receiving stock, supplier payments and balances derived from them.
- **Staff, settings, reports:**
  - Staff are cashiers, senior cashiers and admins, set up with one-time set-password links.
  - Settings cover the store's receipt details and pricing rules.
  - There are ten reports with CSV export and an Overview dashboard.
- **Mobile admin** at `/admin/mobile/`.

**Not included:** there's no payment gateway. Payments and refunds are recorded and labelled as not gateway-verified. There's no customer attached at checkout; bills show "Walk-in".

## Technology

| Part | Stack |
|---|---|
| Backend | Python 3.13, Django 5.2, Django REST Framework, drf-spectacular (OpenAPI), PostgreSQL 18 |
| Frontend | React 19, TypeScript 5.9, Vite, Tailwind CSS 4, TanStack Query, React Router 7, React Hook Form + Zod, Radix UI, Recharts, Lucide icons |
| Serving | Waitress (WSGI), WhiteNoise (static files); one process serves the API, the built app and uploaded photos |
| Security | Session sign-in with CSRF, role-based permissions, row-locked rate limits, a nonce-based Content-Security-Policy |
| Tests | pytest and pytest-django; Vitest and Testing Library; axe-core accessibility checks with Playwright |

## Repository layout

```
backend/    Django project: config/ (settings, URLs, CSP, errors) and apps/* (accounts, catalog, sales,
            inventory, suppliers, returns, reports, store, audit, customers)
frontend/   React app: src/app (router, guards), src/layouts, src/components (design system), src/features/*
deploy/     Container start script and the PostgreSQL role setup
docs/       Implementation plan and phase log, UI specification, deployment guide
Dockerfile  Production image; render.yaml is the Render Blueprint
```

## Local setup (Windows, Git Bash)

You need Python 3.13, Node 22 and PostgreSQL 18. SQLite works for a quick look: set `DB_ENGINE=sqlite`.

```sh
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
cp .env.example .env                      # local settings: database name, user and password
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py fetch_seed_photos   # optional: demo photos from Unsplash
.venv/Scripts/python manage.py seed_demo           # demo store, staff accounts and stock (development only)
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
```

```sh
cd frontend
npm install
npm run dev                               # http://localhost:5173, proxies the API to :8000
```

`seed_demo` prints the demo accounts (admin, senior cashier, cashier) and their approval PINs. They share the development password `loomdesk-demo`, or `SEED_DEMO_PASSWORD` if set. It refuses to run under production settings.

## Tests

```sh
cd backend && .venv/Scripts/python -m pytest          # PostgreSQL, including the concurrency tests
DB_ENGINE=sqlite .venv/Scripts/python -m pytest       # SQLite; PostgreSQL-only tests are skipped
cd frontend && npm run typecheck && npm run lint && npx vitest run --maxWorkers=4 && npm run build
```

- **PostgreSQL tests:** they create and drop a throwaway `test_<POSTGRES_DB>` database, so the database role needs `CREATEDB`.
- **Accessibility:** `npm run check:a11y` runs axe over every page against both dev servers.
- **CI:** `.github/workflows/ci.yml` runs the backend suite on PostgreSQL, the frontend checks and a production image build on every push.

## Deployment

**[docs/deployment.md](docs/deployment.md)** is the full guide. It covers environment variables, the database role, first-time store setup, static files and media, the proxy and HTTPS, the CSP, a smoke test and known limits.

- **Image:** `docker build -t loomdesk .` builds the frontend and backend into one image, and `deploy/start.sh` runs it.
- **Configuration:** settings come only from environment variables. Production refuses to start without a secret key, allowed hosts and PostgreSQL credentials, and it never reads `backend/.env`.
- **Media:** uploaded photos need persistent storage, set with `DJANGO_MEDIA_ROOT`.
- **Proxy:** behind a platform router, set `WAITRESS_TRUSTED_PROXY=*`.
- **Hosted demo:**
  - `setup_store` creates the store record.
  - `load_demo_catalogue` adds the demo products, stock and suppliers, with no accounts.
  - `create_staff` creates each account with its own password.
- **Render:** `render.yaml` is a Blueprint for Render's free plan (deployment guide §10). It isn't deployed yet. On the free plan:
  - The app sleeps when idle.
  - Uploaded photos are lost on restart.
  - The free database expires after 30 days.
- **Smoke test:** `deploy/smoke_test.py <url>` checks any deployment.

## Documentation

- `docs/frontend_implementation_plan.md`: routes, design tokens, decisions, the phase-by-phase log and requirements traceability.
- `docs/loomdesk_pos_ui_design_plan_v2.md`: the UI and behaviour specification.
- `CLAUDE.md`: a condensed architecture guide and the domain rules that cut across modules.
