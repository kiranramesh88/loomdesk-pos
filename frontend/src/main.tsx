import '@fontsource-variable/manrope'
import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'

import { App } from './app/App'
import { applyCspNonce } from './lib/cspNonce'

applyCspNonce()
// The production CSP forbids eval. Without this, zod probes `new Function` and the browser reports a violation.
z.config({ jitless: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
