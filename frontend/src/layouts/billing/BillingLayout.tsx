import { LayoutDashboard, Store } from 'lucide-react'
import { Outlet } from 'react-router'

import { Brand, BrandMark } from '@/components/brand/Brand'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { useMe } from '@/features/auth/api'
import { useBillingSettings } from '@/features/billing/api'
import { accountLabel } from '@/layouts/admin/accountLabel'
import { Avatar } from '@/layouts/admin/Avatar'
import { UserMenu } from '@/layouts/admin/UserMenu'
import { ROLE_LABELS } from '@/types/domain'

/**
 * Billing portal shell (prototype .billing-topbar): brand, the store this till bills for, the
 * signed-in cashier, and a way back to the admin portal for admins only. No sidebar: billing
 * keeps the whole width for the catalogue and the bill.
 */
export function BillingLayout() {
  const me = useMe().data
  const settings = useBillingSettings()

  // RequireRole renders this only with a signed-in user.
  if (!me) return null

  return (
    <div className="flex min-h-dvh flex-col bg-bg print:bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-[60px] max-w-[1640px] items-center gap-3 px-3 sm:h-[68px] sm:gap-4 sm:px-5 lg:px-6">
          <div className="hidden sm:block">
            <Brand subtitle="Retail checkout" />
          </div>
          <BrandMark className="sm:hidden" />

          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:border-l sm:border-line sm:pl-4">
            <Store aria-hidden className="hidden size-4 shrink-0 text-muted sm:block" />
            {settings.data ? (
              <p className="min-w-0">
                <span className="block truncate text-small font-strong text-ink-2">{settings.data.store_name}</span>
                <span className="block truncate type-caption">Store {settings.data.store_code}</span>
              </p>
            ) : (
              // The store name is a nicety; billing works without it, so a failure stays quiet.
              <span className="truncate text-small font-strong text-ink-2">Billing</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {me.role === 'admin' && (
              <ButtonLink to="/admin" icon={<LayoutDashboard />} aria-label="Admin portal" className="max-sm:w-control max-sm:px-0">
                <span className="max-sm:hidden">Admin portal</span>
              </ButtonLink>
            )}
            <UserMenu
              me={me}
              trigger={
                <button
                  type="button"
                  aria-label={accountLabel(me)}
                  className="flex items-center gap-2.5 rounded-control p-1 text-left transition-control hover:bg-surface-muted"
                >
                  <Avatar me={me} className="size-[31px]" />
                  <span className="hidden max-w-[160px] min-w-0 md:block">
                    <span className="block truncate text-small font-strong text-ink-2">{me.full_name}</span>
                    <span className="mt-0.5 block truncate type-caption">{ROLE_LABELS[me.role]}</span>
                  </span>
                </button>
              }
            />
          </div>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
