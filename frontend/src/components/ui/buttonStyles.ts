import { cx } from '@/lib/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'border-primary bg-primary text-white shadow-primary hover:border-primary-hover hover:bg-primary-hover disabled:border-primary-disabled disabled:bg-primary-disabled disabled:shadow-none',
  secondary:
    'border-line-strong bg-surface text-ink-3 hover:border-primary-border hover:bg-surface-muted disabled:bg-surface disabled:text-ink-disabled',
  ghost: 'border-transparent bg-transparent text-ink-3 hover:bg-surface-muted disabled:text-ink-disabled',
  danger: 'border-danger bg-danger text-white hover:brightness-95 disabled:opacity-60',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-control-sm px-3 text-small gap-1.5 [&_svg]:size-3.5',
  md: 'h-control px-3.5 text-body gap-2 [&_svg]:size-4',
  lg: 'h-control-lg px-4 text-body gap-2 [&_svg]:size-4',
}

/** Shared by Button and ButtonLink so a navigation link can look like a button. */
export function buttonClass(variant: ButtonVariant, size: ButtonSize) {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-control border font-strong whitespace-nowrap transition-control [&_svg]:shrink-0',
    VARIANTS[variant],
    SIZES[size],
  )
}
