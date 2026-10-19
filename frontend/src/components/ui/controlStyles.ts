import { cx } from '@/lib/cx'

/** Box styles shared by text inputs, the select trigger and the search field. */
export function controlBox({ invalid, disabled }: { invalid?: boolean; disabled?: boolean } = {}) {
  return cx(
    'flex h-control w-full items-center rounded-control border bg-surface transition-control',
    invalid ? 'border-danger' : 'border-control-border hover:border-muted',
    // Disabled boxes are exempt from the 3:1 rule and stay light so they read as inactive.
    disabled && 'cursor-not-allowed border-line-strong bg-surface-muted hover:border-line-strong',
  )
}

export const CONTROL_TEXT = 'type-body text-ink-2 placeholder:text-muted disabled:text-ink-disabled'
