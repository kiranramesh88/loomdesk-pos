import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

import { cx } from '@/lib/cx'

import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles'

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  /** Icon shown after the label, e.g. an arrow on "Open billing". */
  trailingIcon?: ReactNode
  fullWidth?: boolean
}

/** Navigation that looks like a button. It's still a link, so it opens in new tabs and announces as one. */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cx(buttonClass(variant, size), fullWidth && 'w-full', className)} {...rest}>
      {icon}
      {children}
      {trailingIcon}
    </Link>
  )
}
