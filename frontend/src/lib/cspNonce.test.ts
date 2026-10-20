import { afterEach, describe, expect, it } from 'vitest'

import { applyCspNonce, cspNonce } from './cspNonce'

const holder = globalThis as { __webpack_nonce__?: string }

describe('applyCspNonce', () => {
  afterEach(() => {
    delete holder.__webpack_nonce__
    document.head.querySelector('meta[name="csp-nonce"]')?.remove()
  })

  it('hands the server’s nonce to injected styles', () => {
    const meta = document.createElement('meta')
    meta.name = 'csp-nonce'
    meta.content = 'abc123'
    document.head.append(meta)
    expect(applyCspNonce()).toBe('abc123')
    expect(holder.__webpack_nonce__).toBe('abc123')
    expect(cspNonce()).toBe('abc123')
  })

  it('does nothing on a page without one (the Vite dev server)', () => {
    expect(applyCspNonce()).toBeUndefined()
    expect(holder.__webpack_nonce__).toBeUndefined()
  })
})
