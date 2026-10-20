import { ImageOff, Plus } from 'lucide-react'
import { useState } from 'react'

import { cx } from '@/lib/cx'
import type { SellableProduct } from '@/types/domain'

import { priceLabel, productStock } from '../catalogue'

interface ProductCardProps {
  product: SellableProduct
  onChoose: (product: SellableProduct) => void
}

/**
 * One catalogue item (prototype .catalog-card): photo contained on white, name, price and stock in
 * words. The whole card is a single button; sold-out items stay visible but can't be chosen.
 */
export function ProductCard({ product, onChoose }: ProductCardProps) {
  const stock = productStock(product)
  const soldOut = stock.available === 0
  const options = product.variants.length > 1 ? `${product.variants.length} options` : null

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onChoose(product)}
      aria-label={`${product.name}, ${priceLabel(product)}, ${stock.label}${soldOut ? '' : options ? '. Choose an option' : '. Add to bill'}`}
      className={cx(
        'group flex w-full min-w-0 flex-col overflow-hidden rounded-card border border-line-strong bg-surface text-left shadow-card transition-control',
        soldOut ? 'cursor-not-allowed' : 'hover:border-primary-border hover:shadow-card-hover',
      )}
    >
      <ProductPhoto src={product.image_url} dimmed={soldOut} />
      <span className="flex flex-1 flex-col gap-1 px-3 pt-2.5 pb-3">
        <span className="truncate type-caption">
          {product.category.name}
          {options && ` · ${options}`}
        </span>
        <span className="line-clamp-2 min-h-10 text-body font-strong text-ink-2">{product.name}</span>
        <span className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="min-w-0">
            <span className="block tabular text-panel font-bold text-ink">{priceLabel(product)}</span>
            <span className={cx('block truncate text-caption font-strong', stock.textClass)}>{stock.label}</span>
          </span>
          {!soldOut && (
            <span
              aria-hidden
              className="grid size-control-sm shrink-0 place-items-center rounded-control bg-primary-soft text-primary transition-control group-hover:bg-primary group-hover:text-white [&_svg]:size-4"
            >
              <Plus />
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

function ProductPhoto({ src, dimmed }: { src: string | null; dimmed: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span aria-hidden className="flex h-[118px] items-center justify-center overflow-hidden border-b border-line-soft bg-surface sm:h-[132px]">
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(src)}
          className={cx('h-full w-full object-contain px-6 py-3', dimmed && 'opacity-50 grayscale')}
        />
      ) : (
        <ImageOff className="size-7 text-muted" />
      )}
    </span>
  )
}
