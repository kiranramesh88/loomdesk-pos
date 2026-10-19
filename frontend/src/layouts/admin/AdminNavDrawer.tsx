import * as RadixDialog from '@radix-ui/react-dialog'
import { Menu, ShoppingBag, Smartphone, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Brand } from '@/components/brand/Brand'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { IconButton } from '@/components/ui/IconButton'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'

import { AdminNavList } from './AdminNavList'
import { StoreCard } from './StoreCard'

/**
 * Phone navigation (≤560px): a navy slide-in drawer with the same items as the sidebar.
 * Radix Dialog supplies the focus trap, Escape and backdrop dismissal, inert background
 * (aria-hidden siblings, scroll lock) and focus return to the menu button.
 */
export function AdminNavDrawer() {
  const [open, setOpen] = useState(false)
  // Never leave the drawer open behind the sidebar if the window is widened.
  const abovePhone = useMediaQuery(MEDIA.abovephone)
  const close = () => setOpen(false)

  return (
    <RadixDialog.Root open={open && !abovePhone} onOpenChange={setOpen}>
      <RadixDialog.Trigger asChild>
        <IconButton label="Open navigation" icon={<Menu />} size="md" className="-ml-1 sm:hidden" />
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-backdrop data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col overflow-y-auto bg-navy px-3.5 pt-5 pb-[max(16px,env(safe-area-inset-bottom))] shadow-drawer focus-visible:outline-none data-[state=open]:animate-[slide-in-left_200ms_var(--ease-out)]"
        >
          <RadixDialog.Title className="sr-only">Navigation</RadixDialog.Title>
          <div className="flex items-center justify-between gap-3 pb-5 pl-3">
            <Brand tone="dark" />
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="Close navigation"
                className="grid size-control place-items-center rounded-control text-navy-text transition-control hover:bg-navy-3 hover:text-white"
              >
                <X aria-hidden className="size-5" />
              </button>
            </RadixDialog.Close>
          </div>

          <ButtonLink to="/admin/mobile/" variant="primary" size="lg" fullWidth icon={<Smartphone />} onClick={close}>
            Switch to mobile admin
          </ButtonLink>
          <p className="mt-2 px-1 type-caption text-navy-text">The admin tools, laid out for phones.</p>

          <div className="mt-5">
            <StoreCard />
          </div>

          <div className="mt-6">
            <AdminNavList onNavigate={close} />
          </div>

          <div className="mt-6 border-t border-navy-border pt-4">
            <Link
              to="/billing"
              onClick={close}
              className="flex h-10 items-center gap-3 rounded-control px-3 type-nav text-navy-text transition-control hover:bg-navy-3 hover:text-white"
            >
              <ShoppingBag aria-hidden className="size-[17px] shrink-0" />
              Open billing
            </Link>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
