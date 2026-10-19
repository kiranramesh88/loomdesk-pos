import { ChevronLeft, ChevronRight, PackageSearch, Pencil, Plus } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatMoney } from '@/lib/money'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import type { ProductListItem } from '@/types/domain'

import { useCategories, useProducts } from '../api'
import { PAGE_SIZE, hasFilters, readParams, writeParams, type CatalogueParams } from '../catalogueParams'
import { CatalogueToolbar } from '../components/CatalogueToolbar'
import { ProductThumb } from '../components/ProductThumb'
import { STATUS_LABELS, STOCK_LABELS, unitsLabel, variantsLabel } from '../labels'

const priceLabel = (p: ProductListItem) =>
  p.min_price_paise === p.max_price_paise
    ? formatMoney(p.min_price_paise)
    : `${formatMoney(p.min_price_paise)} – ${formatMoney(p.max_price_paise)}`

function ProductName({ product }: { product: ProductListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductThumb src={product.image_url} />
      <div className="min-w-0">
        <Link
          to={String(product.id)}
          className="font-strong break-words text-ink-2 hover:text-primary hover:underline"
        >
          {product.name}
        </Link>
        <div className="type-helper">{variantsLabel(product.variant_count)}</div>
      </div>
    </div>
  )
}

function StockCell({ product }: { product: ProductListItem }) {
  const stock = STOCK_LABELS[product.stock_state]
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="tabular font-strong text-ink-2">{unitsLabel(product.total_on_hand)}</span>
      <StatusBadge tone={stock.tone}>{stock.label}</StatusBadge>
    </div>
  )
}

const COLUMNS: Column<ProductListItem>[] = [
  { id: 'product', header: 'Product', cell: (p) => <ProductName product={p} /> },
  { id: 'sku', header: 'SKU', width: '130px', cell: (p) => <span className="tabular">{p.sku}</span> },
  { id: 'category', header: 'Category', width: '130px', cell: (p) => p.category.name },
  {
    id: 'price',
    header: 'Price',
    align: 'right',
    width: '150px',
    cell: (p) => <span className="type-amount">{priceLabel(p)}</span>,
  },
  { id: 'stock', header: 'Stock', align: 'right', width: '120px', cell: (p) => <StockCell product={p} /> },
  {
    id: 'status',
    header: 'Status',
    width: '100px',
    cell: (p) => <StatusBadge tone={STATUS_LABELS[p.status].tone}>{STATUS_LABELS[p.status].label}</StatusBadge>,
  },
  {
    id: 'actions',
    header: 'Actions',
    hideHeader: true,
    align: 'right',
    width: '90px',
    cell: (p) => (
      <ButtonLink to={`${p.id}/edit`} size="sm" variant="ghost" icon={<Pencil />} aria-label={`Edit ${p.name}`}>
        Edit
      </ButtonLink>
    ),
  },
]

/** Phone layout: one card per product, with the detail page holding the rest (spec §4 "Data tables"). */
function ProductCards({ rows }: { rows: ProductListItem[] }) {
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {rows.map((p) => {
        const stock = STOCK_LABELS[p.stock_state]
        return (
          <li key={p.id} className="flex flex-col gap-2.5 px-4 py-3.5">
            <ProductName product={p} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 type-helper">
              <span className="tabular">{p.sku}</span>
              <span>{p.category.name}</span>
              <span className="type-amount">{priceLabel(p)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular type-body font-strong text-ink-2">{unitsLabel(p.total_on_hand)}</span>
              <StatusBadge tone={stock.tone}>{stock.label}</StatusBadge>
              <StatusBadge tone={STATUS_LABELS[p.status].tone}>{STATUS_LABELS[p.status].label}</StatusBadge>
              <ButtonLink
                to={`${p.id}/edit`}
                size="sm"
                variant="ghost"
                icon={<Pencil />}
                aria-label={`Edit ${p.name}`}
                className="ml-auto"
              >
                Edit
              </ButtonLink>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function CardsSkeleton() {
  return (
    <div aria-hidden className="divide-y divide-line-soft border-t border-line-soft">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="size-10 rounded-control" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ProductListPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const products = useProducts(params)
  const categories = useCategories()
  const wide = useMediaQuery(MEDIA.abovephone)

  const update = useCallback(
    (next: Partial<CatalogueParams>) =>
      setSearch((current) => writeParams({ ...readParams(current), page: 1, ...next }), { replace: true }),
    [setSearch],
  )
  const clear = useCallback(() => setSearch(new URLSearchParams(), { replace: true }), [setSearch])

  const data = products.data
  const filtered = hasFilters(params)
  const empty = filtered ? (
    <EmptyState
      icon={<PackageSearch />}
      title="No products match"
      description="Try another search, or clear the filters to see the whole catalogue."
      action={<Button onClick={clear}>Clear filters</Button>}
    />
  ) : (
    <EmptyState
      icon={<PackageSearch />}
      title="No products yet"
      description="Add your first product with its sizes, colours and opening stock."
      action={
        <ButtonLink to="new" variant="primary" icon={<Plus />}>
          Add product
        </ButtonLink>
      }
    />
  )
  // A page number past the end (e.g. after filtering elsewhere) comes back as a 404.
  const pageMissing = products.error && 'status' in products.error && products.error.status === 404

  return (
    <>
      <PageHeader
        title="Products"
        description="Manage your catalogue, variants, pricing and tax details."
        actions={
          <ButtonLink to="new" variant="primary" icon={<Plus />}>
            Add product
          </ButtonLink>
        }
      />
      <Card aria-label="Catalogue">
        <CatalogueToolbar params={params} categories={categories.data} onChange={update} onClear={clear} />
        {pageMissing ? (
          <EmptyState
            icon={<PackageSearch />}
            title="That page doesn’t exist"
            description="The catalogue has fewer pages now."
            action={<Button onClick={() => update({})}>Go to the first page</Button>}
          />
        ) : wide ? (
          <DataTable
            caption="Products"
            columns={COLUMNS}
            rows={data?.results}
            getRowId={(p) => p.id}
            isLoading={products.isPending}
            error={products.error}
            onRetry={() => products.refetch()}
            retrying={products.isRefetching}
            empty={empty}
            minWidth="860px"
          />
        ) : products.error ? (
          <ErrorState
            message={products.error.message}
            onRetry={() => products.refetch()}
            retrying={products.isRefetching}
          />
        ) : !data ? (
          <CardsSkeleton />
        ) : data.results.length === 0 ? (
          empty
        ) : (
          <ProductCards rows={data.results} />
        )}
        {data && data.count > 0 && !products.error && (
          <Pagination
            page={params.page}
            count={data.count}
            busy={products.isPlaceholderData}
            onPage={(page) => update({ page })}
          />
        )}
      </Card>
    </>
  )
}

function Pagination({
  page,
  count,
  busy,
  onPage,
}: {
  page: number
  count: number
  busy: boolean
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const first = (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, count)
  return (
    <nav
      aria-label="Catalogue pages"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3 sm:px-5"
    >
      <p className="type-helper tabular" aria-live="polite">
        {busy ? 'Loading…' : `Showing ${first}–${last} of ${count.toLocaleString('en-IN')} products`}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <span className="type-helper tabular">
            Page {page} of {pages}
          </span>
          <Button size="sm" icon={<ChevronLeft />} disabled={page <= 1 || busy} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" disabled={page >= pages || busy} onClick={() => onPage(page + 1)}>
            Next
            <ChevronRight />
          </Button>
        </div>
      )}
    </nav>
  )
}
