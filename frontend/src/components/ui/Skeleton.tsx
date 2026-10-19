import { cx } from '@/lib/cx'

/** Placeholder block shaped like the content it stands in for. Purely decorative. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx('block animate-pulse rounded-sm bg-line-soft', className)} />
}

/** A few lines of text-shaped skeleton; the last line is shorter. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={cx('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx('h-3', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </span>
  )
}
