import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const DJANGO = 'http://127.0.0.1:8000'

export default defineConfig(({ command }) => ({
  // The production build is served by Django: index.html from the SPA fallback, and the hashed
  // assets as Django static files under /static/ (STATICFILES_DIRS). The dev server stays at /.
  base: command === 'build' ? '/static/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same-origin in dev so Django's session + CSRF cookies work without CORS.
    proxy: {
      '/api': DJANGO,
      '/media': DJANGO,
      '/django-admin': DJANGO,
      '/static': DJANGO,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}))
