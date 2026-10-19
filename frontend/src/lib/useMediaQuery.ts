import { useCallback, useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query currently matches, kept in sync as the viewport changes.
 * Use it only for behaviour (which component to mount); layout belongs in Tailwind variants.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

/** The same ranges as the `sm` (561px) and `md` (821px) breakpoints in tokens.css. */
export const MEDIA = {
  abovephone: '(width >= 35.0625rem)',
  rail: '(width >= 35.0625rem) and (width < 51.3125rem)',
} as const
