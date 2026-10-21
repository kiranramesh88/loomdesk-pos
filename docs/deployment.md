# Deploying LoomDesk

LoomDesk is one Django process that serves the API, the built React app and uploaded photos, backed by PostgreSQL. It needs no other services. This guide is host-agnostic: any Linux or Windows host, VM or platform that can run Python 3.13 and reach PostgreSQL will do. The repository's `Dockerfile` builds a ready image (section 2), and section 10 is the configuration prepared for Render's free plan.

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
| `LOOMDESK_MIGRATE_ON_START` | no | `true` runs `migrate` at each start. Use it only on a single instance with no release step, such as Render's free plan. |
| `LOOMDESK_DEMO_STORE` | no | `true` sets up a demo store at each start: `setup_store`, the demo catalogue if the store is empty, and the demo photos put back. Never set it for a real store. |
| `LOOMDESK_ADMIN_EMAIL`, `LOOMDESK_ADMIN_NAME`, `LOOMDESK_ADMIN_PASSWORD` | no | Creates this admin at start if the account doesn't exist yet, and never changes it afterwards. For a host without a shell. Delete the password variable after the first sign-in. |

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

`python deploy/smoke_test.py <url>` checks items 1 and 2 and the 403 in item 3. With `--admin-email`, it also signs in and checks that the products and photos load. It uses only the standard library and prints no secrets.

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

## 10. Render, free plan (prepared, not deployed)

`render.yaml` is a Render Blueprint for **Render's free plan**, validated against Render's published schema. It costs nothing, but the free plan has hard limits, and the start-up script works around the ones that matter.

**Free-plan limits, and what LoomDesk does about each:**

| Limit (Render's free plan) | Effect | What LoomDesk does |
|---|---|---|
| The service sleeps after 15 minutes without traffic | The first visit after a pause waits about a minute | Nothing to fix. Tell reviewers to expect it. |
| No persistent disk | Files written at runtime are lost on every restart, redeploy or sleep | The demo photos are built into the image, and `restore_demo_photos` puts them back at each start. **Photos uploaded on the site are lost at the next restart.** |
| No Shell, one-off jobs or pre-deploy step | Setup commands can't be typed in | `deploy/start.sh` migrates (`LOOMDESK_MIGRATE_ON_START`), sets up the demo store (`LOOMDESK_DEMO_STORE`) and creates the first admin from environment variables |
| **The free database expires 30 days after creation.** Render deletes it, with all its data, 14 days after that. | Sales, stock changes and accounts made on the site are gone | Note the creation date. Before it expires, upgrade the database to a paid plan, or accept a fresh start: a new free database sets itself up again on the next boot. |
| The free database has no backups | Nothing can be restored | Treat the hosted store as a demo, not a real shop's records |
| 750 free instance hours a month per workspace | Enough for one service that's always on | Don't run a second free service in the same workspace |

**Configuration in `render.yaml`:**
- **Web service `loomdesk`:** Docker (`./Dockerfile`, context `.`), plan **free**, region **Singapore**, auto-deploy off.
  - **Health check:** `/api/v1/auth/session/`. Render checks over plain HTTP, so it gets the 301 to HTTPS, which Render counts as healthy.
- **Database `loomdesk-db`:** Render Postgres **free** (1 GB), PostgreSQL 18, Singapore, database `loomdesk`, user `loomdesk_app`, no internet access (`ipAllowList: []`).
- **Fixed environment:** `WAITRESS_TRUSTED_PROXY=*`, `DJANGO_SECURE_HSTS_SECONDS=3600` for the first deploy, `LOOMDESK_MIGRATE_ON_START=true`, `LOOMDESK_DEMO_STORE=true`, and `POSTGRES_HOST/PORT/DB/USER/PASSWORD` taken from the database. `DJANGO_ALLOWED_HOSTS` falls back to Render's `RENDER_EXTERNAL_HOSTNAME`.
- **Entered by you** on the Blueprint's review screen (`sync: false`, so never in the repository):
  - `DJANGO_SECRET_KEY`: at least 50 characters. Render's `generateValue` gives 44, which is too short.
  - `LOOMDESK_ADMIN_EMAIL`, `LOOMDESK_ADMIN_NAME` and `LOOMDESK_ADMIN_PASSWORD`: the first admin account.

**What each start does** (`deploy/start.sh`):
1. Gives the media folder to the app user.
2. Runs `check --deploy`.
3. Migrates.
4. Clears expired sessions.
5. Runs `setup_store`.
6. Runs `load_demo_catalogue --if-empty`. It loads the demo products, stock and suppliers into an empty store only, and creates no accounts.
7. Runs `restore_demo_photos`.
8. Runs `create_staff --skip-existing` for the first admin. It creates the account once and never changes it afterwards.
9. Starts Waitress as the unprivileged user. The admin password is removed from the environment first, so the server never holds it.

CI runs this start-up twice against PostgreSQL, the second time with no media, and runs the smoke test after each.

**Steps to a public URL:**
1. Make a secret key, and a long, unique admin password, on your machine:
   ```sh
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```
   Keep both in a password manager. Never put them in the repository or a chat.
2. In Render: **New → Blueprint**, connect the GitHub repository (giving Render access to this one only), branch `master`.
3. On the review screen, check that both resources say **Free**. Enter `DJANGO_SECRET_KEY`, `LOOMDESK_ADMIN_EMAIL`, `LOOMDESK_ADMIN_NAME` and `LOOMDESK_ADMIN_PASSWORD`. Then **Apply**.
4. **Deploy** the web service if it doesn't start on its own. The first build takes several minutes; the log shows "Demo catalogue loaded" and "Created Admin account".
5. Sign in at `https://<service>.onrender.com/login`. Then **delete `LOOMDESK_ADMIN_PASSWORD`** from the service's Environment page: the account keeps its password, and the next start skips it.
6. Run the smoke test from your machine. The first form is read-only. The second also signs in, and reads the password from the environment variable you name, never from the command line:
   ```sh
   python deploy/smoke_test.py https://<service>.onrender.com
   read -rs SMOKE_ADMIN_PASSWORD && export SMOKE_ADMIN_PASSWORD
   python deploy/smoke_test.py https://<service>.onrender.com --admin-email <admin email>      --admin-password-env SMOKE_ADMIN_PASSWORD --min-products 9 --min-photos 1
   ```
7. Once HTTPS works, raise `DJANGO_SECURE_HSTS_SECONDS` to `31536000`.

**Reviewer accounts:**
- On the **Staff** page, add an admin and a cashier for reviewers. Each gets a one-time set-password link, valid 3 days. Open the link yourself to set a long random password, or send the link privately.
- Send credentials privately, never in the repository or the README. After the review, deactivate those accounts on the Staff page (history is kept).
- `seed_demo` still refuses production settings: its accounts share a published password.

**Moving to a paid plan later:**
- **Disk:** change the web service to **Starter** and add a disk (`mountPath: /var/data`, 1 GB). Uploaded photos then survive restarts.
- **Database:** upgrade it to **Basic-256mb** before the free one expires, which keeps its data.
- **Release step:** optionally, move `migrate` to the pre-deploy command and set `LOOMDESK_MIGRATE_ON_START=false`.
- **Cost:** about $13.55 a month in October 2026 ($7 + $6 + about $0.55 of storage). Render changes prices, so check the review screen.
