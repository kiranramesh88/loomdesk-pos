# Deploying LoomDesk

LoomDesk is one Django process that serves the API, the built React app and uploaded photos, backed by PostgreSQL. It needs no other services. This guide is host-agnostic: any Linux or Windows host, VM or platform that can run Python 3.13 and reach PostgreSQL will do. The repository's `Dockerfile` builds a ready image (section 2), and section 10 is the configuration prepared for Render.

```
browser ──HTTPS──▶ TLS proxy / platform router ──HTTP──▶ Waitress ─▶ Django
                   (sets X-Forwarded-Proto)               ├─ /api/v1/…    API (session + CSRF)
                                                          ├─ /static/…    WhiteNoise: SPA assets, Django admin assets
                                                          ├─ /media/…     uploaded product photos (MEDIA_ROOT)
                                                          └─ everything else → index.html (React routes)
                                                         PostgreSQL ◀─ data, sessions and every rate limit
```

## 1. Environment variables

Set these in the host's secret manager or service environment. **Production never reads `backend/.env`**: with `DJANGO_SETTINGS_MODULE=config.settings.prod`, a missing required value stops the process at start-up instead of falling back to development values.

| Variable | Required | Purpose |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | yes | `config.settings.prod` (the default for `wsgi.py`) |
| `DJANGO_SECRET_KEY` | yes | Random, at least 50 characters. Generate with `python -c "import secrets; print(secrets.token_urlsafe(64))"`. Rotating it signs everyone out. |
| `DJANGO_ALLOWED_HOSTS` | yes | Comma-separated host names, e.g. `pos.example.com` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | no | Only if a proxy presents a different origin, e.g. `https://pos.example.com` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` | yes | The production database and its dedicated role (section 3) |
| `POSTGRES_PORT` | no | Default `5432` |
| `POSTGRES_SSLMODE` | no | Default `prefer`. Use `require` or `verify-full` when the database is on another host. |
| `POSTGRES_CONN_MAX_AGE` | no | Seconds to reuse a connection; default `60` |
| `DJANGO_MEDIA_ROOT` | recommended | A persistent directory for uploaded photos (section 5) |
| `DJANGO_STATIC_ROOT` | no | Where `collectstatic` writes; default `backend/staticfiles` |
| `DJANGO_SECURE_SSL_REDIRECT` | no | Default `true`. Set `false` only if the proxy already redirects HTTP to HTTPS. |
| `DJANGO_SECURE_HSTS_SECONDS` | no | Default `31536000` (one year). Use a small value for the first deploy if HTTPS isn't proven yet. |
| `DJANGO_SERVE_MEDIA` | no | Default `true`. Set `false` when the proxy or a CDN serves `/media/`. |
| `DJANGO_LOG_LEVEL` | no | Default `INFO`. Logs go to stdout/stderr. |
| `DJANGO_CSP_REPORT_ONLY` | no | Default `false`. `true` sends the Content-Security-Policy as report-only, so violations show in the browser console without blocking anything (section 7). |
| `WAITRESS_TRUSTED_PROXY` | yes, for the image | The address the proxy connects from, or `*` behind a platform router (section 6). `deploy/start.sh` refuses to start without it. |
| `PORT`, `WAITRESS_THREADS` | no | For the image: the port to listen on (default `8000`; platforms set it) and Waitress threads (default `8`). |

Never set `DB_ENGINE` in production (the settings refuse `sqlite`), and never set `SEED_DEMO_PASSWORD`.

## 2. Build and release

From a clean checkout of the release commit:

```sh
cd frontend && npm ci && npm run build && cd ..          # frontend/dist (hashed assets under /static/)
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt   # .venv\Scripts\ on Windows
.venv/bin/python manage.py collectstatic --noinput        # SPA + admin assets → STATIC_ROOT (compressed)
.venv/bin/python manage.py migrate                        # application tables, default connection
.venv/bin/python manage.py check --deploy                 # must report no errors
```

**With Docker:** `docker build -t loomdesk .` from the repository root does all of the above except `migrate`, `check --deploy` and starting the server:
- The first stage installs the frontend with `npm ci` and builds it; the second installs the pinned `backend/requirements.txt` on Python 3.13.
- `collectstatic` runs during the build with placeholder settings. It opens no database connection, and none of those values exist at runtime.
- `.dockerignore` keeps `.env` files, databases, dumps, media, `node_modules` and local builds out of the image. `.gitattributes` keeps the shell scripts' LF line endings in a Windows checkout.
- The container runs `deploy/start.sh`: it gives the media disk to the unprivileged `loomdesk` user, runs `check --deploy` (fails on errors only), deletes expired sessions, and starts Waitress as that user on `0.0.0.0:$PORT` with the proxy flags.
- Run `python manage.py migrate --noinput` from the image once per release, before it takes traffic (on Render, the pre-deploy command).
- One-off commands that write media run as the app user: `sh /app/deploy/as_app.sh python manage.py …`.

Restart the server after `collectstatic`. WhiteNoise indexes the static files when the process starts, so a running server answers 404 for the new build's hashed assets, and the pages that name them render blank.

`check --deploy` includes LoomDesk's own checks: the frontend build and collected assets exist (E001, E002).

**Upgrading from a release before Phase 12:** sign-in throttling no longer uses Django's cache, so `createcachetable` is no longer needed. The old `loomdesk_cache` table is unused; drop it by hand once the new release runs, after a backup.

**Migrations:** take a database backup first (`pg_dump -Fc`). Run `migrate` once per release, before the new code takes traffic, from one machine. Every migration so far only adds tables or columns.

## 3. Database

Create the role and database once, as a PostgreSQL superuser. `deploy/postgres/create_database.sql` prompts for the new role's password and stops without changes if the role or database already exists:

```sh
psql -U postgres -h <db-host> -f deploy/postgres/create_database.sql
```

- The role owns only its database: no superuser, `CREATEDB` or `CREATEROLE`. Since it can't create databases, running the test suite with production credentials fails instead of touching anything.
- `CONNECT` is revoked from `PUBLIC`, so development and test roles can't open the production database.
- Keep PostgreSQL off the public internet (bind to a private network, or firewall port 5432 to the app host), and require TLS across hosts (`POSTGRES_SSLMODE=require`).
- **Never** run `seed_demo` against production. It refuses to run under production settings, because the demo accounts share a published password. Use `setup_store` and `create_staff` instead (section 4).
- Back up with `pg_dump -Fc` on a schedule and test a restore. Sales, stock movements and supplier records are the store's financial history.

## 4. First-time store setup

```sh
python manage.py setup_store --name "Loom & Linen" --code LL-KKD-01 --address "…" --state Kerala --gstin 32…
python manage.py create_staff --email owner@example.com --name "Store Owner" --role admin   # prompts for password and PIN
python manage.py create_staff --email till1@example.com --name "Till One" --role cashier
```

- `setup_store` creates the store record, the default GST rules and the six categories. It's safe to re-run and never overwrites edits. It warns while the store's name, code or address still hold the demo store's values, or no GSTIN is set: every sale prints these on its receipt and keeps them for good, so set them before the first sale. Review the GST rules with the store's accountant; they're defaults, not advice.
- `create_staff` prompts for the password, or reads it from the environment variable named by `--password-env` in scripted setups. It never takes the password as an argument, and it rejects the demo password and anything Django's password validators reject. `--pin-env` sets a discount-approval PIN for admins and senior cashiers.
- Django's own admin (`/django-admin/`) needs `createsuperuser`. It isn't required to run the store.

## 5. Static files and media

- **Static:** `collectstatic` gathers the Vite build and Django's admin assets into `STATIC_ROOT`, and WhiteNoise serves them gzip-compressed. Vite's fingerprinted files (`/static/assets/index-<hash>.js`) are cached for a year; anything else for a short time. `index.html` is served by the SPA view with `Cache-Control: no-cache`, so a deploy takes effect on the next page load. A missing asset returns a plain 404, never the app's HTML.
- **Media (product photos):** uploads are written to `DJANGO_MEDIA_ROOT`. Point it at storage that survives a redeploy: a mounted volume or persistent disk, outside the code and build directories. A container's own filesystem is not enough. Django serves `/media/` itself by default; at higher traffic let the proxy or a CDN serve that directory and set `DJANGO_SERVE_MEDIA=false`. Back the directory up with the database.

## 6. Running the server

```sh
cd backend
waitress-serve --listen=127.0.0.1:8000 --threads=8 --trusted-proxy=127.0.0.1 \
  --trusted-proxy-headers="x-forwarded-proto x-forwarded-for" config.wsgi:application
```

- Put a TLS-terminating proxy or platform router in front. It must set `X-Forwarded-Proto` and overwrite any value a client sends, because Django uses it to recognise HTTPS (secure cookies, redirects, CSRF).
- **The proxy flags are required.** Without `--trusted-proxy`, Waitress drops the `X-Forwarded-*` headers: Django never sees HTTPS (so `SECURE_SSL_REDIRECT` redirects forever), and every user shares the proxy's address and its limits.
  - `--trusted-proxy` is the address the proxy connects from. On a platform whose router address isn't fixed (Render, Railway, Fly.io, most PaaS), use `--trusted-proxy='*' --trusted-proxy-count=1`, and only if the service is reachable solely through that router.
  - `--trusted-proxy-count=1` takes the client address the router appended and ignores anything the client wrote before it, so a forged `X-Forwarded-For` doesn't make a new client.
  - Bind to `0.0.0.0:$PORT` (the platform's port) on a PaaS, rather than `127.0.0.1:8000`.
- **Workers and instances:** every limit below is stored in PostgreSQL, so it holds across threads, processes and instances.
  - **Approval PIN:** 5 wrong PINs per approver, then that PIN is locked until 15 minutes after the last one.
  - **Django admin sign-in:** 5 failures per account and 10 per client address in 15 minutes. A locked-out attempt gets status 429 and its password isn't checked.
  - These two count in `AttemptGuard` rows (`apps/accounts/attempts.py`). Each attempt is counted under a row lock, and committed, before the secret is checked. However many attempts arrive at once, no more than the limit are checked. A request that fails later can't roll its count back.
  - **API sign-in and set-password links:** 10 requests a minute per client address each (`DEFAULT_THROTTLE_RATES`). They count in `ThrottleWindow` rows (`apps/accounts/throttling.py`): a sliding window read and written under a row lock in its own committed transaction, so a burst from one client gets exactly 10 through, across every worker. A refusal is 429 with `Retry-After`.
- **Client address:** the address limits use `REMOTE_ADDR`, never `X-Forwarded-For` directly. Behind a proxy, Waitress sets it from the proxies it trusts (above).
- **Housekeeping:** run `python manage.py clearsessions` daily (a cron job or scheduled task) so expired sessions don't pile up. Idle throttle rows delete themselves after a day.

## 7. Content-Security-Policy

`config/csp.py` sets a policy on every response Django builds. Static files come from WhiteNoise without one; they are the build's own files.

| Path | Policy, in short |
|---|---|
| The app (every page route) | Scripts from this origin only. Styles from this origin, plus inline `<style>` elements that carry the request's nonce. Images from this origin and `blob:` (the photo preview). Fonts from this origin and `data:`. Requests to this origin. No plugins, no `<base>`, never framed. |
| `/api/` | Nothing may load (`default-src 'none'`). |
| `/api/v1/docs/` (Swagger UI, admin-only) | Scripts and styles from `cdn.jsdelivr.net`, plus Swagger's inline style with the nonce. Its start-up script is served as a file. |
| `/media/` | Images only, sandboxed. |
| `/django-admin/` | Its own static files only. |

- No policy allows `'unsafe-inline'` or `'unsafe-eval'`.
- Two libraries add inline `<style>` elements at runtime: Radix dialogs (react-remove-scroll) and Radix Select. `spa_index` writes the nonce into `index.html`, and `src/lib/cspNonce.ts` hands it to both.
- Zod runs in `jitless` mode, so it never probes for `eval`.
- To try a policy change, set `DJANGO_CSP_REPORT_ONLY=true` and watch the browser console.
- There is no violation-report endpoint.

## 8. Smoke test after each deploy

1. `GET /api/v1/auth/session/` → 200 `{"user": null}` and a `csrftoken` cookie marked `Secure`.
2. `GET /admin/mobile/` and `/admin/products/12` → 200 HTML (the SPA), with a `Content-Security-Policy` header whose nonce matches the page's `csp-nonce` meta. `GET /static/assets/does-not-exist.js` → 404 text.
3. Sign in as an admin. A cashier opening `/admin` lands on `/403`, and `GET /api/v1/inventory/variants/` as a cashier → 403.
4. A product photo loads from `/media/…`, and is still there after restarting the server.

## 9. Known limits

- **Account lockouts can be triggered by anyone who knows the address.**
  - Five wrong admin sign-ins lock that account's `/django-admin/` access for 15 minutes; the POS sign-in is unaffected.
  - Five wrong PINs lock that approver's discount approvals for 15 minutes.
  - That's the trade-off of a per-account limit. Restrict `/django-admin/` at the proxy if it needn't be public.
- **Swagger UI depends on jsDelivr** being reachable. It's admin-only.
- **A photo opened directly** at its `/media/` URL shows unstyled. Chrome's built-in image viewer styles the page inline, and the media policy blocks that; the image itself shows.
- **Sessions** last 12 hours. There's no forced sign-out of other sessions when a password changes, beyond Django's default session invalidation.
- **Payments** are recorded, not processed. There's no payment gateway, so nothing is verified with a bank.
- **One database role** runs both the app and its migrations. A separate migration role would let the runtime role lose `CREATE` on the schema.
- **TLS, backups and monitoring** belong to the host; LoomDesk ships none of them.
- **Refunds are recorded, not paid out.** A UPI or card refund is entered with its reference after it has been made outside LoomDesk, and is labelled as not verified.
- **Held returns** (inspection hold) change no stock. When an item passes inspection, put it back with a stock adjustment.
- **Set-password links** are shown once to the admin who issues them, for handing over in person. LoomDesk sends no email. A lost link is replaced by issuing a new one, which invalidates the old.
- **Voids** are only for today's bills with no returns (store date). Anything else is a return.
- **Reports** are an operational view of LoomDesk's own records, not a GST filing or double-entry accounts. A report stops at 5,000 rows; choose fewer dates for the rest.
- **One register.** There's no per-till setup or cash-drawer reconciliation.
- **The audit trail** is append-only through the application. Someone with direct database access can still change it.

## 10. Render (prepared, not deployed)

`render.yaml` is a Render Blueprint for this guide's setup, validated against Render's published schema. **Applying it creates paid resources.** Nothing has been created yet.

| Resource | Setting |
|---|---|
| Web service `loomdesk` | Docker (`./Dockerfile`, context `.`), plan **Starter** (512 MB, 0.5 CPU), region **Singapore**, auto-deploy off |
| Pre-deploy command | `python manage.py migrate --noinput` |
| Health check | `/api/v1/auth/session/`. Render checks over plain HTTP, so it gets the 301 to HTTPS, which Render counts as healthy. |
| Disk `media` | 1 GB at `/var/data`. Photos go to `/var/data/media`. Snapshotted daily and kept 7 days. A disk means one instance, and a few seconds of downtime per deploy. |
| Database `loomdesk-db` | Render Postgres **Basic-256mb**, 1 GB storage, PostgreSQL 18, Singapore, database `loomdesk`, user `loomdesk_app`, no internet access (`ipAllowList: []`) |
| Environment | `DJANGO_SECRET_KEY` (pasted, at least 50 characters: Render's `generateValue` gives 44), `WAITRESS_TRUSTED_PROXY=*`, `DJANGO_SECURE_HSTS_SECONDS=3600` for the first deploy, `POSTGRES_HOST/PORT/DB/USER/PASSWORD` from the database. `DJANGO_ALLOWED_HOSTS` falls back to Render's `RENDER_EXTERNAL_HOSTNAME`. |

**Steps to a public URL**, once the price is approved:
1. Push the repository to a private GitHub repository; CI (`.github/workflows/ci.yml`) runs the tests and builds the image there.
2. In Render: **New → Blueprint**, connect the repository, review the two resources and their prices, and paste `DJANGO_SECRET_KEY` when asked. Make it with `python -c "import secrets; print(secrets.token_urlsafe(64))"`.
3. **Deploy** the web service by hand. The pre-deploy command creates the tables.
4. Open the service's **Shell** and set up the store:
   ```sh
   python manage.py setup_store --name "…" --code "…" --address "…" --state Kerala   # add --gstin for a real store
   sh /app/deploy/as_app.sh python manage.py fetch_seed_photos      # optional: the demo photos (Unsplash)
   sh /app/deploy/as_app.sh python manage.py load_demo_catalogue    # demo products, stock and suppliers; no accounts
   python manage.py create_staff --email … --name "…" --role admin   # prompts for the password
   ```
5. Run the smoke test (section 8) against `https://<service>.onrender.com`. Then raise `DJANGO_SECURE_HSTS_SECONDS` to `31536000`.

**Demo data and reviewer accounts:**
- `load_demo_catalogue` loads the demo products, variants, opening stock and suppliers. It creates no users, passwords or PINs, and it refuses a store that already has products, stock movements, suppliers, purchases or sales. It never replaces anything.
- `seed_demo` still refuses production settings: its accounts share a published password.
- Create each reviewer account with `create_staff`. It prompts for the password twice and rejects the demo password and weak ones.
  - An admin account and a cashier account show both sides of the app.
  - Give each its own long random password, and send credentials privately, never in the repository or the README.
  - Set an admin's discount-approval PIN on the Staff page, or with `--pin-env`.
- After the review, deactivate the reviewer accounts on the Staff page (history is kept), or change their passwords.

**Expected monthly cost** (published prices, October 2026; Render changed its prices in August 2026, so confirm on the Blueprint's review screen):

| Item | Price |
|---|---|
| Web service, Starter | $7 |
| Postgres Basic-256mb | $6 |
| Postgres storage, 1 GB | about $0.30 |
| Disk, 1 GB | about $0.25 |
| **Total** | **about $13.55 a month, plus tax** |

- **Likely extras:**
  - Outbound bandwidth beyond the workspace's included amount.
  - A paid workspace plan, if the account isn't on Hobby.
  - Growing the database or disk; storage can grow but not shrink.
- **Not needed:** Render cron jobs (expired sessions are cleared at each start) and Key Value (no cache is used).
- **Charges stop when the resources are deleted.** Deleting the database deletes its data and backups.

**Backups:**
- **Postgres:** point-in-time recovery for the last 3 days on the Hobby workspace (7 on Pro), and logical backups kept 7 days.
- **Photos:** the disk's daily snapshots.
- **Your own copy:** the image has no PostgreSQL client tools. Before a risky change, download a logical backup from the database's Recovery page in the dashboard.
  - Or allow your own address in the database's access control for a moment, and run `pg_dump -Fc` from Windows (`C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`) with the external connection string. Remove the address afterwards.
  - Test a restore into a separate database.
