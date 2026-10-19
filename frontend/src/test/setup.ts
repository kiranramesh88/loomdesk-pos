import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'

// jsdom lacks a few DOM APIs that Radix primitives call; no-op versions are enough for tests.
const isDom = typeof Element !== 'undefined'
if (isDom && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
if (isDom && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

afterEach(() => {
  cleanup()
})
