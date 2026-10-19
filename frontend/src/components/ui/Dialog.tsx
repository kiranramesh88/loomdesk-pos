import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

import { IconButton } from './IconButton'

const WIDTHS = { sm: 'sm:max-w-[420px]', md: 'sm:max-w-[520px]', lg: 'sm:max-w-[720px]' } as const

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Buttons, Cancel first and the single primary action last. */
  footer?: ReactNode
  size?: keyof typeof WIDTHS
  /**
   * Set false while a request is pending, or for destructive confirmations, so Escape
   * and outside clicks can't dismiss the dialog mid-action.
   */
  dismissible?: boolean
}

/**
 * Focused task dialog (Radix: focus trap, Escape, focus returns to the trigger).
 * Centred on larger screens; a full-screen sheet on phones (spec §4 "Drawers and dialogs").
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', dismissible = true }: DialogProps) {
  const block = (event: Event) => {
    if (!dismissible) event.preventDefault()
  }

  // Radix only restores focus to its own <Dialog.Trigger>; these dialogs are opened by
  // ordinary buttons and menu items, so remember what had focus and return to it.
  // (Layout effect: runs before Radix moves focus into the dialog.)
  const returnFocusTo = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) returnFocusTo.current = document.activeElement as HTMLElement | null
  }, [open])
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    const target = returnFocusTo.current
    if (target?.isConnected) target.focus()
  }

  // Start on the first field of the body rather than the header's close button;
  // with no fields, the footer's first button (Cancel) is the safe default.
  const bodyRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const focusFirst = (event: Event) => {
    const target = firstFocusable(bodyRef.current) ?? firstFocusable(footerRef.current)
    if (target) {
      event.preventDefault()
      target.focus()
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => (next || dismissible ? onOpenChange(next) : undefined)}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-backdrop backdrop-blur-[3px] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <RadixDialog.Content
          onEscapeKeyDown={block}
          onOpenAutoFocus={focusFirst}
          onCloseAutoFocus={restoreFocus}
          onPointerDownOutside={block}
          onInteractOutside={block}
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cx(
            'fixed z-50 flex flex-col bg-surface shadow-overlay focus-visible:outline-none',
            // Phone: full-screen sheet. Larger: centred card capped at 90vh.
            'inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[90vh] sm:w-[calc(100%-36px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-panel sm:border sm:border-line',
            'data-[state=open]:animate-[rise-in_180ms_var(--ease-out)]',
            WIDTHS[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 pt-5 pb-4 sm:px-[22px]">
            <div className="min-w-0">
              <RadixDialog.Title className="text-title font-bold tracking-[-0.3px] text-ink">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 type-helper">{description}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="Close" icon={<X />} disabled={!dismissible} className="-mt-1 -mr-1.5" />
            </RadixDialog.Close>
          </div>
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-[22px]">
            {children}
          </div>
          {footer && (
            <div
              ref={footerRef}
              className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-surface-tint px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:rounded-b-panel sm:px-[22px]">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function firstFocusable(container: HTMLElement | null): HTMLElement | null {
  return container?.querySelector<HTMLElement>(FOCUSABLE) ?? null
}
