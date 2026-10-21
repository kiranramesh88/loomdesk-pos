#!/bin/sh
# Start LoomDesk in the container: checks, housekeeping, then Waitress. See docs/deployment.md §6.
# Migrations are not run here; run `python manage.py migrate` once per release (Render's pre-deploy command).
set -eu
cd /app/backend

# On Render the service's own hostname is known; anything else must set DJANGO_ALLOWED_HOSTS.
if [ -z "${DJANGO_ALLOWED_HOSTS:-}" ] && [ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]; then
  export DJANGO_ALLOWED_HOSTS="$RENDER_EXTERNAL_HOSTNAME"
fi

# Which proxy may set X-Forwarded-For and X-Forwarded-Proto. Without it Django never sees HTTPS
# (an endless redirect) and every user shares the proxy's address and sign-in limit. "*" is right
# only when the platform's router is the sole way in, as on Render.
: "${WAITRESS_TRUSTED_PROXY:?Set WAITRESS_TRUSTED_PROXY to the proxy address, or * behind a platform router (docs/deployment.md 6)}"

# The media disk is mounted at run time, often owned by root: give it to the app user.
media="${DJANGO_MEDIA_ROOT:-/var/data/media}"
if [ "$(id -u)" = 0 ]; then
  mkdir -p "$media"
  chown -R loomdesk:loomdesk "$media"
fi

# Fails on errors only, such as a missing build (loomdesk.E001, E002) or a missing setting.
python manage.py check --deploy --fail-level ERROR

# Hosts with no release step (Render's free plan has no pre-deploy command or shell) migrate here.
# Only for a single instance: with several, migrate once per release instead (docs/deployment.md §2).
if [ "${LOOMDESK_MIGRATE_ON_START:-false}" = true ]; then
  python manage.py migrate --noinput
fi

# Expired sessions are deleted at each start; schedule it daily on a long-running server.
python manage.py clearsessions || echo "start.sh: clearsessions failed; continuing" >&2

# A hosted demo store, set up without a shell. Each step only adds what's missing:
# the store record and GST rules, the demo catalogue if the store is empty, and the demo photos
# that a restart on a host without a disk removed.
if [ "${LOOMDESK_DEMO_STORE:-false}" = true ]; then
  python manage.py setup_store
  sh /app/deploy/as_app.sh python manage.py load_demo_catalogue --if-empty
  sh /app/deploy/as_app.sh python manage.py restore_demo_photos
fi

# A first admin account, for a host without a shell. Skipped once the account exists, which is never
# changed. Remove LOOMDESK_ADMIN_PASSWORD from the host once you've signed in; make other accounts
# from the Staff page.
if [ -n "${LOOMDESK_ADMIN_EMAIL:-}" ] && [ -n "${LOOMDESK_ADMIN_PASSWORD:-}" ]; then
  python manage.py create_staff --email "$LOOMDESK_ADMIN_EMAIL" --name "${LOOMDESK_ADMIN_NAME:-Store admin}" \
    --role admin --password-env LOOMDESK_ADMIN_PASSWORD --skip-existing
fi
unset LOOMDESK_ADMIN_PASSWORD  # the server never needs it

exec sh /app/deploy/as_app.sh waitress-serve \
  --listen="0.0.0.0:${PORT:-8000}" \
  --threads="${WAITRESS_THREADS:-8}" \
  --trusted-proxy="$WAITRESS_TRUSTED_PROXY" \
  --trusted-proxy-count=1 \
  --trusted-proxy-headers="x-forwarded-proto x-forwarded-for" \
  config.wsgi:application
