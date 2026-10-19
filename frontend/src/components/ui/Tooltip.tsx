import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactElement, ReactNode } from 'react'

export interface TooltipProps {
  content: ReactNode
  /** A single focusable element; the tooltip opens on its hover and keyboard focus. */
  children: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Render the child alone, e.g. when the label is already visible next to the icon. */
  disabled?: boolean
}

/**
 * Short supplementary label (Radix: opens on hover and focus, closes on Escape, wired with
 * aria-describedby). Never the only way to learn what a control does: the trigger still
 * needs its own accessible name. Requires a <TooltipProvider> ancestor; it lives in the
 * layouts that use tooltips (AdminLayout) to keep Radix's positioning code out of the main bundle.
 */
export function Tooltip({ content, children, side = 'right', disabled = false }: TooltipProps) {
  if (disabled) return children
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={10}
          collisionPadding={8}
          className="z-50 rounded-sm border border-navy-border bg-navy-2 px-2.5 py-1.5 text-small font-strong text-white shadow-overlay data-[state=delayed-open]:animate-[fade-in_120ms_ease-out]"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}

export const TooltipProvider = RadixTooltip.Provider
