import { Monitor } from 'lucide-react'

import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { useCategories, useTaxRules } from '@/features/products/api'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileFact, MobileFacts, MobilePageHeader, MobilePanel } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'

import { useStoreSettings } from '../api'

/** `/admin/mobile/settings`: the store details, pricing rules and GST rules, read-only. Changes are made in the full admin. */
export function MobileSettingsPage() {
  const settings = useStoreSettings()
  const rules = useTaxRules()
  const categories = useCategories()
  const s = settings.data
  const rulesError = rules.error ?? categories.error
  return (
    <>
      <MobilePageHeader
        title="Settings"
        description="What receipts print and how bills are priced."
        back={{ to: mobilePath('more'), label: 'More' }}
        actions={
          <ButtonLink to="/admin/settings" size="lg" icon={<Monitor />}>
            Edit in full admin
          </ButtonLink>
        }
      />
      <div className="grid gap-4">
        {settings.isError ? (
          <MobilePanel title="Store details">
            <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} retrying={settings.isFetching} />
          </MobilePanel>
        ) : !s ? (
          <MobilePanel title="Store details">
            <MobileRowsSkeleton rows={3} label="Loading settings" />
          </MobilePanel>
        ) : (
          <>
            <MobilePanel title="Store details" description="Printed on receipts from the next bill.">
              <MobileFacts>
                <MobileFact label="Store name">{s.name}</MobileFact>
                <MobileFact label="Store code">
                  <span className="tabular">{s.code}</span>
                </MobileFact>
                <MobileFact label="Address">{s.address}</MobileFact>
                <MobileFact label="State">{s.state}</MobileFact>
                <MobileFact label="GSTIN">{s.gstin ? <span className="tabular">{s.gstin}</span> : 'Not recorded'}</MobileFact>
              </MobileFacts>
            </MobilePanel>
            <MobilePanel title="Pricing and discounts" description="Applied to every bill priced from now on.">
              <MobileFacts>
                <MobileFact label="Catalogue prices">{s.prices_include_tax ? 'Include GST (MRP)' : 'Exclude GST; added at checkout'}</MobileFact>
                <MobileFact label="Cashier discount limit">{s.cashier_discount_limit_pct}% of the bill</MobileFact>
              </MobileFacts>
              <p className="border-t border-line-soft px-4 py-3 type-helper">Above the limit, a Senior cashier or Admin enters their approval PIN.</p>
            </MobilePanel>
          </>
        )}
        <MobilePanel title="GST rules" description="Each category uses one rule. Read-only.">
          {rulesError ? (
            <ErrorState
              message={rulesError.message}
              onRetry={() => {
                void rules.refetch()
                void categories.refetch()
              }}
            />
          ) : !rules.data || !categories.data ? (
            <MobileRowsSkeleton rows={2} label="Loading GST rules" />
          ) : (
            <ul aria-label="GST rules" className="divide-y divide-line-soft border-t border-line-soft">
              {rules.data.map((rule) => {
                const used = categories.data.filter((c) => c.tax_rule?.id === rule.id).map((c) => c.name)
                return (
                  <li key={rule.id} className="grid gap-1 px-4 py-3">
                    <span className="type-body font-strong break-words text-ink-2">{rule.name}</span>
                    <span className="type-body">{rule.summary}</span>
                    <span className="type-helper break-words">{used.length ? used.join(', ') : 'No categories'}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </MobilePanel>
      </div>
    </>
  )
}
