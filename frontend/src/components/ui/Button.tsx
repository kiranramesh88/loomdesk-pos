import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** One `primary` per visual group; everything else is `secondary` or `ghost`. */
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Shown instead of children while loading, e.g. "Signing in…". */
  loadingLabel?: string
  icon?: ReactNode
  fullWidth?: boolean
}

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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    loadingLabel,
    icon,
    fullWidth = false,
    disabled,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-control border font-strong whitespace-nowrap transition-control disabled:cursor-not-allowed [&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden className="animate-spin" /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
})
