import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles'

export type { ButtonSize, ButtonVariant }

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
      className={cx(buttonClass(variant, size), 'disabled:cursor-not-allowed', fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden className="animate-spin" /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
})
