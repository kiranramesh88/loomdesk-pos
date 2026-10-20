# Deploying LoomDesk

LoomDesk is one Django process that serves the API, the built React app and uploaded photos, backed by PostgreSQL. It needs no other services. This guide is host-agnostic: any Linux or Windows host, VM or platform that can run Python 3.13 and reach PostgreSQL will do.

```
browser ──HTTPS──▶ TLS proxy / platform router ──HTTP──▶ Waitress ─▶ Django
                   (sets X-Forwarded-Proto)               ├─ /api/v1/…    API (session + CSRF)
                                                          ├─ /static/…    WhiteNoise: SPA assets, Django admin assets
                                                          ├─ /media/…     uploaded product photos (MEDIA_ROOT)
                                                          └─ everything else → index.html (React routes)
                                                         PostgreSQL ◀─ two connections: requests (atomic), cache (autocommit)
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

Never set `DB_ENGINE` in production (the settings refuse `sqlite`), and never set `SEED_DEMO_PASSWORD`.

## 2. Build and release

From a clean checkout of the release commit:

```sh
cd frontend && npm ci && npm run build && cd ..          # frontend/dist (hashed assets under /static/)
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt   # .venv\Scripts\ on Windows
.venv/bin/python manage.py collectstatic --noinput        # SPA + admin assets → STATIC_ROOT (compressed)
.venv/bin/python manage.py migrate                        # application tables, default connection
.venv/bin/python manage.py createcachetable --database cache   # shared cache table (idempotent)
.venv/bin/python manage.py check --deploy                 # must report no errors
```

`check --deploy` includes LoomDesk's own checks: the frontend build and collected assets exist (E001, E002), and the cache is shared across workers but outside the request transaction (E003, E004).

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
- **Workers and instances:** login throttling (10 attempts a minute per client) and the approval-PIN lockout (5 wrong PINs lock that approver for 15 minutes) are kept in the shared database cache. They hold across threads, processes and instances. The cache has its own autocommitting connection: on the request's connection, the rollback of an error response would erase the very attempts being counted.
- Limits of the counters: two wrong PINs submitted at the same instant can both be counted from the same starting value, so the lockout can allow a 6th attempt in a race. Login throttling is per client IP, so behind a proxy configure `--trusted-proxy` correctly or every user shares the proxy's address.

## 7. Smoke test after each deploy

1. `GET /api/v1/auth/session/` → 200 `{"user": null}` and a `csrftoken` cookie marked `Secure`.
2. `GET /admin/mobile/` and `/admin/products/12` → 200 HTML (the SPA). `GET /static/assets/does-not-exist.js` → 404 text.
3. Sign in as an admin. A cashier opening `/admin` lands on `/403`, and `GET /api/v1/inventory/variants/` as a cashier → 403.
4. A product photo loads from `/media/…`, and is still there after restarting the server.

## 8. Known limits

- **No Content-Security-Policy yet.** The app loads no third-party scripts (Swagger UI, admin-only, uses a CDN). A CSP is the next hardening step.
- **The Django admin login** isn't rate-limited like the API login. Restrict `/django-admin/` at the proxy, or don't create superusers.
- **Sessions** last 12 hours. There's no forced sign-out of other sessions when a password changes, beyond Django's default session invalidation.
- **Payments** are recorded, not processed. There's no payment gateway, so nothing is verified with a bank.
- **One database role** runs both the app and its migrations. A separate migration role would let the runtime role lose `CREATE` on the schema.
- **TLS, backups and monitoring** belong to the host; LoomDesk ships none of them.
