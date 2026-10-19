import { cx } from '@/lib/cx'
import type { Me } from '@/types/domain'

export function Avatar({ me, className }: { me: Me; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid size-[33px] shrink-0 place-items-center rounded-full bg-primary-soft text-caption font-bold text-primary',
        className,
      )}
    >
      {me.initials}
    </span>
  )
}
