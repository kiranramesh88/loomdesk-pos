# LoomDesk: one image with the built React app and the Django backend, served by Waitress.
# Build from the repository root:  docker build -t loomdesk .
# Runtime configuration comes only from the environment (docs/deployment.md §1); the image holds no secrets.

# --- 1. Frontend: type-check and build the SPA into frontend/dist ---
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Backend ---
FROM python:3.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    DJANGO_STATIC_ROOT=/app/backend/staticfiles \
    DJANGO_MEDIA_ROOT=/var/data/media
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY deploy/start.sh deploy/as_app.sh /app/deploy/

# Collect the SPA and admin assets into the image. Production settings refuse to load without these
# variables, so placeholders are given for this one step: collectstatic opens no database connection,
# and none of these values exist at runtime.
RUN DJANGO_SECRET_KEY=build-time-placeholder-not-used-at-runtime-0123456789abcdef \
    DJANGO_ALLOWED_HOSTS=build.invalid \
    POSTGRES_DB=build POSTGRES_USER=build POSTGRES_PASSWORD=build POSTGRES_HOST=build.invalid \
    python manage.py collectstatic --noinput

# The server runs as an unprivileged user. seed/photos/ is writable for fetch_seed_photos; the media
# disk is mounted at run time, so start.sh fixes its ownership then drops to this user.
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin loomdesk \
    && mkdir -p seed/photos /var/data/media \
    && chown -R loomdesk:loomdesk seed /var/data

EXPOSE 8000
CMD ["sh", "/app/deploy/start.sh"]
