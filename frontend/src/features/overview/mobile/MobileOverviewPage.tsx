import { Boxes, IndianRupee, PackageCheck, PackageX, ReceiptText, Search, ShoppingCart, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useMe } from '@/features/auth/api'
import { useInventory, useInventorySummary } from '@/features/inventory/api'
import { STOCK_LABELS, variantName } from '@/features/inventory/labels'
import { useStore } from '@/features/store/api'
import { useAllPurchases } from '@/features/suppliers/api'
import { formatDay } from '@/features/suppliers/labels'
import { useRecentSales, useSalesSummary } from '@/features/transactions/api'
import { billsLabel, formatSaleTime, PAYMENT_LABELS } from '@/features/transactions/labels'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileList, MobilePageHeader, MobilePanel, MobileRow } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'
import { formatMoney } from '@/lib/money'

const RECENT_BILLS = 4
const ALERT_ROWS = 5

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** A KPI card that opens the list behind the figure. */
function KpiLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="block rounded-card transition-control hover:brightness-[0.98]">
      {children}
    </Link>
  )
}

function TodayFigures() {
  const store = useStore()
  const today = store.data?.today ?? ''
  // Store dates, from the server: the phone's own date can differ from the shop's.
  const sales = useSalesSummary({ q: '', from: today, to: today, cashier: '', method: '', page: 1 }, { enabled: !!today })
  const stock = useInventorySummary()
  const salesLoading = !today ? store.isPending : sales.isPending
  const salesFailed = store.isError || sales.isError
  return (
    <section aria-label="Today at a glance" className="grid grid-cols-2 gap-2.5">
      <KpiLink to={mobilePath(`bills${today ? `?from=${today}&to=${today}` : ''}`)}>
        <KpiCard
          label="Sales today"
          icon={IndianRupee}
          isLoading={salesLoading}
          value={salesFailed ? '—' : formatMoney(sales.data?.total_paise ?? 0)}
          footnote={salesFailed ? 'Couldn’t load' : 'Saved bill totals, GST incl.'}
        />
      </KpiLink>
      <KpiLink to={mobilePath(`bills${today ? `?from=${today}&to=${today}` : ''}`)}>
        <KpiCard
          label="Bills today"
          icon={ReceiptText}
          isLoading={salesLoading}
          value={salesFailed ? '—' : (sales.data?.sale_count ?? 0).toLocaleString('en-IN')}
          footnote={salesFailed ? 'Couldn’t load' : 'Completed sales'}
        />
      </KpiLink>
      <KpiLink to={mobilePath('inventory?state=low_stock&status=active')}>
        <KpiCard
          label="Low stock"
          icon={TriangleAlert}
          isLoading={stock.isPending}
          value={stock.isError ? '—' : stock.data?.low_stock.toLocaleString('en-IN')}
          footnote={stock.isError ? 'Couldn’t load' : 'At or below reorder level'}
        />
      </KpiLink>
      <KpiLink to={mobilePath('inventory?state=out_of_stock&status=active')}>
        <KpiCard
          label="Out of stock"
          icon={PackageX}
          isLoading={stock.isPending}
          value={stock.isError ? '—' : stock.data?.out_of_stock.toLocaleString('en-IN')}
          footnote={stock.isError ? 'Couldn’t load' : 'On sale, none on hand'}
        />
      </KpiLink>
      {(salesFailed || stock.isError) && (
        <p role="alert" className="col-span-2 type-helper text-danger">
          Some figures couldn’t load.{' '}
          <button
            type="button"
            className="min-h-11 font-strong text-primary underline"
            onClick={() => {
              if (store.isError) void store.refetch()
              if (sales.isError) void sales.refetch()
              if (stock.isError) void stock.refetch()
            }}
          >
            Try again
          </button>
        </p>
      )}
    </section>
  )
}

const QUICK_ACTIONS: { label: string; icon: LucideIcon; to: string }[] = [
  { label: 'Receive goods', icon: PackageCheck, to: mobilePath('purchases') },
  { label: 'Check stock', icon: Boxes, to: mobilePath('inventory') },
  { label: 'Find a bill', icon: Search, to: mobilePath('bills') },
  { label: 'Open billing', icon: ShoppingCart, to: '/billing' },
]

function QuickActions() {
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2.5">
      {QUICK_ACTIONS.map((action) => (
        <Link
          key={action.label}
          to={action.to}
          className="flex min-h-12 items-center gap-2.5 rounded-control border border-line bg-surface px-3.5 type-body font-strong text-ink-2 shadow-card transition-control hover:border-primary-border"
        >
          <action.icon aria-hidden className="size-[18px] shrink-0 text-primary" />
          {action.label}
        </Link>
      ))}
    </nav>
  )
}

function AwaitingGoods() {
  const purchases = useAllPurchases({ q: '', status: 'ordered', page: 1 })
  const rows = purchases.data?.results.slice(0, 3)
  const count = purchases.data?.count ?? 0
  return (
    <MobilePanel
      title="Awaiting goods"
      description={purchases.data ? (count ? `${count} purchase${count === 1 ? '' : 's'} to receive.` : 'Nothing to receive.') : undefined}
      action={count > 3 ? { to: mobilePath('purchases'), label: 'View all' } : undefined}
    >
      {purchases.isError ? (
        <ErrorState message={purchases.error.message} onRetry={() => void purchases.refetch()} retrying={purchases.isRefetching} />
      ) : !rows ? (
        <MobileRowsSkeleton rows={2} label="Loading purchases" />
      ) : rows.length === 0 ? (
        <p className="border-t border-line-soft px-4 py-3.5 type-helper">Recorded purchases appear here until their goods are received.</p>
      ) : (
        <MobileList label="Purchases awaiting goods">
          {rows.map((p) => (
            <MobileRow
              key={p.id}
              to={mobilePath(`purchases/${p.number}`)}
              title={p.supplier_name}
              meta={
                <>
                  <span className="tabular">{p.number}</span>
                  <span>{formatDay(p.purchase_date)}</span>
                  <span className="tabular">{p.item_count} units</span>
                </>
              }
              aside={<span className="type-amount">{formatMoney(p.total_paise)}</span>}
            />
          ))}
        </MobileList>
      )}
    </MobilePanel>
  )
}

function RecentBills() {
  const sales = useRecentSales(RECENT_BILLS)
  const rows = sales.data?.results
  return (
    <MobilePanel title="Recent bills" action={{ to: mobilePath('bills'), label: 'View all' }}>
      {sales.isError ? (
        <ErrorState message={sales.error.message} onRetry={() => void sales.refetch()} retrying={sales.isRefetching} />
      ) : !rows ? (
        <MobileRowsSkeleton label="Loading recent bills" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ReceiptText />} title="No bills yet" description="Completed sales from the till appear here." />
      ) : (
        <MobileList label="Recent bills">
          {rows.map((s) => (
            <MobileRow
              key={s.invoice_no}
              to={mobilePath(`bills/${s.invoice_no}`)}
              title={<span className="tabular">{s.invoice_no}</span>}
              meta={
                <>
                  <span>{formatSaleTime(s.created_at)}</span>
                  <span>{PAYMENT_LABELS[s.payment_method]}</span>
                </>
              }
              aside={<span className="type-amount">{formatMoney(s.total_paise)}</span>}
            />
          ))}
        </MobileList>
      )}
      {sales.data && sales.data.count > 0 && (
        <p className="border-t border-line-soft px-4 py-2.5 type-caption">{billsLabel(sales.data.count)} in total</p>
      )}
    </MobilePanel>
  )
}

function StockAlerts() {
  // Lowest stock first among items on sale; the first rows that need attention.
  const lowest = useInventory({ q: '', category: '', state: '', status: 'active', sort: 'stock', page: 1 })
  const rows = lowest.data?.results.filter((v) => v.stock_state !== 'in_stock').slice(0, ALERT_ROWS)
  return (
    <MobilePanel
      title="Needs restocking"
      description="Out of stock first, then low."
      action={{ to: mobilePath('inventory?sort=stock&status=active'), label: 'View all' }}
    >
      {lowest.isError ? (
        <ErrorState message={lowest.error.message} onRetry={() => void lowest.refetch()} retrying={lowest.isRefetching} />
      ) : !rows ? (
        <MobileRowsSkeleton label="Loading stock alerts" />
      ) : rows.length === 0 ? (
        <p className="border-t border-line-soft px-4 py-3.5 type-helper">Every item on sale is above its reorder level.</p>
      ) : (
        <MobileList label="Items that need restocking">
          {rows.map((v) => {
            const state = STOCK_LABELS[v.stock_state]
            return (
              <MobileRow
                key={v.id}
                to={mobilePath(`inventory/${v.id}`)}
                title={variantName(v)}
                meta={<span className="tabular">{v.sku}</span>}
                aside={
                  <div className="flex flex-col items-end gap-1">
                    <span className="type-amount">{v.on_hand} left</span>
                    <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                  </div>
                }
              />
            )
          })}
        </MobileList>
      )}
    </MobilePanel>
  )
}

/** `/admin/mobile/`: today's sales, stock alerts, goods to receive and recent bills, all from the API. */
export function MobileOverviewPage() {
  const { data: me } = useMe()
  const firstName = me?.full_name.split(' ')[0]
  return (
    <>
      <MobilePageHeader
        title={`${greeting(new Date().getHours())}${firstName ? `, ${firstName}` : ''}`}
        description="Your store at a glance."
      />
      <div className="grid gap-4">
        <TodayFigures />
        <QuickActions />
        <AwaitingGoods />
        <StockAlerts />
        <RecentBills />
      </div>
    </>
  )
}

