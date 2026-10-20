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

# Expired sessions are deleted at each start; schedule it daily on a long-running server.
python manage.py clearsessions || echo "start.sh: clearsessions failed; continuing" >&2

exec sh /app/deploy/as_app.sh waitress-serve \
  --listen="0.0.0.0:${PORT:-8000}" \
  --threads="${WAITRESS_THREADS:-8}" \
  --trusted-proxy="$WAITRESS_TRUSTED_PROXY" \
  --trusted-proxy-count=1 \
  --trusted-proxy-headers="x-forwarded-proto x-forwarded-for" \
  config.wsgi:application
