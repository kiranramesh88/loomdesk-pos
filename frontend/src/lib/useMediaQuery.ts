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

/** The same ranges as the `sm` (561px), `md` (821px) and `lg` (1121px) breakpoints in tokens.css. */
export const MEDIA = {
  abovephone: '(width >= 35.0625rem)',
  rail: '(width >= 35.0625rem) and (width < 51.3125rem)',
  /** From `md` (821px): billing shows the catalogue and the bill side by side. */
  split: '(width >= 51.3125rem)',
  /** From `lg` (1121px): wide tables fit beside the full sidebar without scrolling sideways. */
  wide: '(width >= 70.0625rem)',
} as const
