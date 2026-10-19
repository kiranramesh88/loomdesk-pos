import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: icon-only buttons need an accessible name (also shown as a tooltip). */
  label: string
  icon: ReactNode
  /** `outline` matches the prototype's bordered topbar buttons; `ghost` sits inside other controls. */
  variant?: 'ghost' | 'outline'
  size?: 'sm' | 'md'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'sm', type = 'button', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'grid shrink-0 place-items-center rounded-control text-muted transition-control hover:text-primary disabled:cursor-not-allowed disabled:text-ink-disabled [&_svg]:size-4',
        size === 'sm' ? 'size-control-sm' : 'size-control',
        variant === 'outline'
          ? 'border border-line-strong bg-surface hover:border-primary-border hover:bg-surface-muted'
          : 'hover:bg-surface-muted',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  )
})
