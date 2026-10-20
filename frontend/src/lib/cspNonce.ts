/**
 * The page's Content-Security-Policy allows inline `<style>` elements only with the nonce Django puts in
 * `<meta name="csp-nonce">`. Two libraries add such elements:
 * - Radix dialogs, through react-remove-scroll. It reads the nonce from get-nonce, and get-nonce falls back
 *   to the `__webpack_nonce__` global, so setting that global is enough without depending on get-nonce.
 * - Radix Select's viewport, which takes the nonce as a prop (`cspNonce()` in `components/ui/Select`).
 * The Vite dev server's page has no meta and no policy.
 */
const holder = globalThis as { __webpack_nonce__?: string }

export function applyCspNonce(doc: Document = document): string | undefined {
  const nonce = doc.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content || undefined
  if (nonce) holder.__webpack_nonce__ = nonce
  return nonce
}

export function cspNonce(): string | undefined {
  return holder.__webpack_nonce__
}
