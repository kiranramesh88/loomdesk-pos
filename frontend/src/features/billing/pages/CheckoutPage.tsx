import { useQueryClient } from '@tanstack/react-query'
import { PackageSearch, ShoppingBag } from 'lucide-react'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { SearchInput } from '@/components/ui/SearchInput'
import { Skeleton } from '@/components/ui/Skeleton'
import { useMe } from '@/features/auth/api'
import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/money'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { Me, Sale, SellableProduct, SellableVariant } from '@/types/domain'

import { fetchProductsNow, useBillingCategories, useBillingSettings, useSellableProducts } from '../api'
import { billReducer, loadBill, saveBill, unitCount } from '../bill'
import { findExactVariant, variantLabel } from '../catalogue'
import { BillPanel } from '../components/BillPanel'
import { DiscountDialog } from '../components/DiscountDialog'
import { PaymentDialog } from '../components/PaymentDialog'
import { ProductCard } from '../components/ProductCard'
import { SaleCompleteDialog } from '../components/SaleCompleteDialog'
import { VariantDialog } from '../components/VariantDialog'
import { useBillQuote } from '../useBillQuote'

const SEARCH_DELAY_MS = 250

/** Billing workspace (plan §2 `/billing`, spec §5.9): find, choose, build the bill, pay. */
export function CheckoutPage() {
  const me = useMe().data
  useDocumentTitle('New sale')
  // BillingLayout renders pages only with a signed-in user.
  return me ? <Checkout me={me} /> : null
}

function Checkout({ me }: { me: Me }) {
  const client = useQueryClient()
  const split = useMediaQuery(MEDIA.split)
  const settings = useBillingSettings()

  const [bill, dispatch] = useReducer(billReducer, me.id, loadBill)
  useEffect(() => saveBill(me.id, bill), [me.id, bill])
  const billQuote = useBillQuote(bill)

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pendingSearch = useRef<number>(undefined)

  const [choosing, setChoosing] = useState<SellableProduct | null>(null)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [completed, setCompleted] = useState<Sale | null>(null)
  // Feedback for adds and scans, shown under the search box (toasts would cover the bill's total).
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const inBill = useCallback(
    (variantId: number) => bill.lines.find((line) => line.variantId === variantId)?.quantity ?? 0,
    [bill.lines],
  )

  // Typing searches after a short pause; Enter (or a scanner's Enter) searches at once.
  const typeSearch = (value: string) => {
    setSearch(value)
    setNotice(null)
    window.clearTimeout(pendingSearch.current)
    pendingSearch.current = window.setTimeout(() => setQuery(value), value ? SEARCH_DELAY_MS : 0)
  }
  useEffect(() => () => window.clearTimeout(pendingSearch.current), [])

  // "/" jumps to search from anywhere on the page, unless the cashier is typing or a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const products = useSellableProducts({ q: query, category })
  const categories = useBillingCategories()
  const items = products.data?.pages.flatMap((page) => page.results) ?? []
  const count = products.data?.pages[0]?.count ?? 0

  const addToBill = (product: SellableProduct, variant: SellableVariant, quantity: number) => {
    dispatch({ type: 'add', product, variant, quantity })
    setChoosing(null)
    setNotice({ tone: 'success', text: `Added ${quantity} × ${product.name} (${variantLabel(variant)}) to the bill.` })
  }

  const choose = (product: SellableProduct) => {
    const [only] = product.variants
    if (product.variants.length === 1 && only) {
      if (only.on_hand - inBill(only.id) <= 0) {
        setNotice({ tone: 'error', text: `No more ${product.name} in stock: all ${only.on_hand} are already on the bill.` })
      } else addToBill(product, only, 1)
      return
    }
    setChoosing(product)
  }

  // A barcode or variant SKU that names exactly one variant goes straight onto the bill.
  const searchNow = async () => {
    const code = search.trim()
    window.clearTimeout(pendingSearch.current)
    setQuery(search)
    if (!code) return
    try {
      const result = await fetchProductsNow(client, code)
      const match = findExactVariant(result.pages[0]?.results ?? [], code)
      if (!match) return
      if (match.variant.on_hand - inBill(match.variant.id) <= 0) {
        setNotice({ tone: 'error', text: `${match.product.name} (${variantLabel(match.variant)}) has no stock left to add.` })
        return
      }
      addToBill(match.product, match.variant, 1)
      typeSearch('')
    } catch {
      // The grid shows the search error itself.
    }
  }

  const openPayment = () => {
    setSheetOpen(false)
    setPaymentOpen(true)
  }

  const newSale = () => {
    setCompleted(null)
    setNotice(null)
    // After the dialog has closed and released its focus trap, ready for the next customer.
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }

  const panel = (
    <BillPanel
      bill={bill}
      dispatch={dispatch}
      billQuote={billQuote}
      onDiscount={() => setDiscountOpen(true)}
      onPay={openPayment}
      headingHidden={!split}
      className="h-full"
    />
  )
  const units = unitCount(bill)

  return (
    <div className="mx-auto grid w-full max-w-[1640px] flex-1 items-start gap-5 px-3 pt-4 pb-24 sm:px-5 sm:pt-5 md:grid-cols-[minmax(0,1fr)_340px] md:pb-6 lg:grid-cols-[minmax(0,1fr)_372px] lg:px-6">
      <section aria-labelledby="checkout-title" className="min-w-0">
        <div className="mb-4">
          <h1 id="checkout-title" className="type-page-title">
            New sale
          </h1>
          <p className="mt-1 type-page-desc">Find an item, choose the exact size and colour, then take payment.</p>
        </div>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            void searchNow()
          }}
        >
          <SearchInput
            ref={searchRef}
            label="Search products by name, SKU or barcode"
            placeholder="Search by name, SKU or scan a barcode…"
            value={search}
            onValueChange={typeSearch}
            size="lg"
            shortcutHint="/"
            autoComplete="off"
            enterKeyHint="search"
          />
        </form>
        <p
          role={notice?.tone === 'error' ? 'alert' : 'status'}
          className={cx('mt-1.5 min-h-[18px] truncate type-helper', notice?.tone === 'error' ? 'text-danger' : 'text-success')}
        >
          {notice?.text}
        </p>

        <div role="group" aria-label="Filter by category" className="-mx-3 mt-1.5 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {categories.isPending ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-control-sm w-20 shrink-0 rounded-control" />)
          ) : categories.data ? (
            [{ id: null, name: 'All' }, ...categories.data].map((option) => (
              <button
                key={option.id ?? 'all'}
                type="button"
                aria-pressed={category === option.id}
                onClick={() => setCategory(option.id)}
                className={cx(
                  'h-control-sm shrink-0 rounded-control border px-3 text-small font-strong whitespace-nowrap transition-control',
                  category === option.id
                    ? 'border-primary bg-primary text-white'
                    : 'border-line-strong bg-surface text-ink-3 hover:border-primary-border hover:bg-surface-muted',
                )}
              >
                {option.name}
              </button>
            ))
          ) : (
            // Categories are a shortcut; search still finds everything if they fail to load.
            <p className="type-helper">Categories couldn’t load. Search still covers every product.</p>
          )}
        </div>

        <div className="mt-4 mb-3 flex items-baseline justify-between gap-3">
          <h2 className="type-section">Products</h2>
          <p className="type-helper" aria-live="polite">
            {products.isPending ? 'Loading…' : products.isError && !products.data ? '' : `${count} ${count === 1 ? 'product' : 'products'}`}
          </p>
        </div>

        <ProductGrid
          state={products}
          items={items}
          query={query}
          onChoose={choose}
          onClear={() => {
            typeSearch('')
            setCategory(null)
          }}
        />
      </section>

      {split ? (
        <aside className="sticky top-[84px] h-[calc(100dvh-104px)] min-h-[440px] overflow-hidden rounded-panel border border-line shadow-panel">
          {panel}
        </aside>
      ) : (
        <>
          {/* Phone and tablet: the total and the way to pay stay on screen in a bottom bar. */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-md sm:px-5">
            <div className="mx-auto flex max-w-[1640px] items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="type-caption">{units ? `${units} ${units === 1 ? 'item' : 'items'} on the bill` : 'The bill is empty'}</p>
                <p className="tabular text-price font-bold text-ink">
                  {billQuote.quote ? formatMoney(billQuote.quote.total_paise) : units ? '—' : formatMoney(0)}
                </p>
              </div>
              <Button variant="primary" size="lg" icon={<ShoppingBag />} onClick={() => setSheetOpen(true)}>
                View bill
              </Button>
            </div>
          </div>
          <Dialog open={sheetOpen} onOpenChange={setSheetOpen} title="Current bill" flush>
            {panel}
          </Dialog>
        </>
      )}

      <VariantDialog product={choosing} inBill={inBill} onClose={() => setChoosing(null)} onAdd={addToBill} />
      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        current={bill.discount}
        subtotalPaise={billQuote.quote?.subtotal_paise}
        role={me.role}
        limitPct={settings.data?.cashier_discount_limit_pct}
        onApply={(discount) => {
          dispatch({ type: 'setDiscount', discount })
          setDiscountOpen(false)
        }}
      />
      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        bill={bill}
        dispatch={dispatch}
        quote={billQuote.quote}
        quoteCurrent={billQuote.current}
        onCompleted={(sale) => {
          dispatch({ type: 'clear' })
          setPaymentOpen(false)
          setCompleted(sale)
        }}
      />
      <SaleCompleteDialog sale={completed} onNewSale={newSale} />
    </div>
  )
}

function ProductGrid({
  state,
  items,
  query,
  onChoose,
  onClear,
}: {
  state: ReturnType<typeof useSellableProducts>
  items: SellableProduct[]
  query: string
  onChoose: (product: SellableProduct) => void
  onClear: () => void
}) {
  if (state.isPending) {
    return (
      <div role="status" aria-label="Loading products" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(184px,1fr))] sm:gap-3.5">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-line-strong bg-surface">
            <Skeleton className="h-[118px] rounded-none sm:h-[132px]" />
            <div className="grid gap-2 p-3">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (state.isError && !state.data) {
    return (
      <div className="rounded-panel border border-line bg-surface">
        <ErrorState title="Products couldn’t load" message={state.error.message} onRetry={() => void state.refetch()} retrying={state.isFetching} />
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="rounded-panel border border-line bg-surface">
        <EmptyState
          icon={<PackageSearch />}
          title={query.trim() ? `Nothing matches “${query.trim()}”` : 'No products in this category'}
          description="Check the spelling or code, or clear the filters to see everything that can be sold."
          action={<Button onClick={onClear}>Clear search and filters</Button>}
        />
      </div>
    )
  }
  return (
    <>
      <ul
        aria-label="Products"
        aria-busy={state.isFetching && !state.isFetchingNextPage}
        className={cx(
          'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 transition-opacity sm:grid-cols-[repeat(auto-fill,minmax(184px,1fr))] sm:gap-3.5',
          state.isPlaceholderData && 'opacity-60',
        )}
      >
        {items.map((product) => (
          <li key={product.id} className="flex min-w-0">
            <ProductCard product={product} onChoose={onChoose} />
          </li>
        ))}
      </ul>
      {state.isFetchNextPageError && (
        <p role="alert" className="mt-3 text-center type-helper text-danger">
          More products couldn’t load. {state.error?.message}
        </p>
      )}
      {state.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button onClick={() => void state.fetchNextPage()} loading={state.isFetchingNextPage} loadingLabel="Loading more…">
            Show more products
          </Button>
        </div>
      )}
    </>
  )
}
