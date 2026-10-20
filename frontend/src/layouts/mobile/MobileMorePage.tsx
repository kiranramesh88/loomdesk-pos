import { ChevronRight, Monitor, ShoppingCart, Tag, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { MOBILE_MORE } from './mobileNav'
import { MobilePageHeader, MobilePanel } from './MobilePage'

interface Destination {
  label: string
  description: string
  icon: LucideIcon
  to: string
}

const ELSEWHERE: readonly Destination[] = [
  { label: 'Products', description: 'Edit the catalogue, prices and photos in the full admin.', icon: Tag, to: '/admin/products' },
  { label: 'Full admin', description: 'The desktop layout, with every admin section.', icon: Monitor, to: '/admin' },
  { label: 'Open billing', description: 'The till, for making a sale.', icon: ShoppingCart, to: '/billing' },
]

function DestinationList({ label, items }: { label: string; items: readonly Destination[] }) {
  return (
    <ul aria-label={label} className="divide-y divide-line-soft border-t border-line-soft">
      {items.map((item) => (
        <li key={item.to}>
          <Link to={item.to} className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-control hover:bg-surface-muted">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-mark bg-primary-soft text-primary">
              <item.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block type-body font-strong text-ink-2">{item.label}</span>
              <span className="block type-helper">{item.description}</span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** `/admin/mobile/more`: the sections that don't have a bottom tab, and the way out to the full admin and the till. */
export function MobileMorePage() {
  return (
    <>
      <MobilePageHeader title="More" description="Suppliers, purchasing and stock history." />
      <div className="grid gap-4">
        <MobilePanel title="Sections">
          <DestinationList label="Sections" items={MOBILE_MORE} />
        </MobilePanel>
        <MobilePanel title="Elsewhere in LoomDesk">
          <DestinationList label="Elsewhere in LoomDesk" items={ELSEWHERE} />
        </MobilePanel>
        <p className="px-1 type-helper">
          Returns, staff accounts, reports and settings aren’t built yet, on desktop or mobile. They’ll be listed here when they are.
        </p>
      </div>
    </>
  )
}
