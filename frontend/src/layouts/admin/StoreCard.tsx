import { RotateCw, Store as StoreIcon } from 'lucide-react'

import { useStore } from '@/features/store/api'
import { cx } from '@/lib/cx'

/** The sidebar's store identity (prototype .store-selector, without the switcher: one store). */
export function StoreCard({ rail = false }: { rail?: boolean }) {
  const store = useStore()

  return (
    <div
      className={cx(
        'flex items-center gap-2.5 rounded-control border border-navy-border bg-navy-2',
        rail ? 'justify-center p-2' : 'p-2.5',
      )}
    >
      <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-sm bg-navy-icon text-white">
        <StoreIcon className="size-4" />
      </span>
      <div className={rail ? 'sr-only' : 'min-w-0 flex-1'}>
        {store.isPending ? (
          <div role="status" aria-label="Loading store details" className="grid gap-1.5">
            <span className="block h-2.5 w-24 animate-pulse rounded-sm bg-navy-3" />
            <span className="block h-2 w-16 animate-pulse rounded-sm bg-navy-3" />
          </div>
        ) : store.isError ? (
          <div className="flex items-center justify-between gap-2">
            <p role="alert" className="type-caption text-navy-text">
              Store details unavailable
            </p>
            <button
              type="button"
              onClick={() => store.refetch()}
              disabled={store.isFetching}
              aria-label="Retry loading store details"
              title="Retry"
              className="grid size-7 shrink-0 place-items-center rounded-sm text-navy-text transition-control hover:bg-navy-3 hover:text-white disabled:opacity-60"
            >
              <RotateCw aria-hidden className={cx('size-3.5', store.isFetching && 'animate-spin')} />
            </button>
          </div>
        ) : (
          <>
            <p className="truncate text-small font-strong text-white">{store.data.name}</p>
            <p className="mt-0.5 truncate type-caption text-navy-text">
              {store.data.code} · {store.data.state}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
