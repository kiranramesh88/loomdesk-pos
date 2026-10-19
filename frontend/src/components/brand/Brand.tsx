import { cx } from '@/lib/cx'

/** The LoomDesk woven mark from the reference prototype (brand asset, not an icon-library glyph). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid size-[34px] shrink-0 place-items-center rounded-mark bg-linear-145 from-brand-from to-primary shadow-brand',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[19px] fill-none stroke-white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7 8 4l4 3 4-3 4 3v10l-4 3-4-3-4 3-4-3z" />
        <path d="M8 4v13m4-10v9m4-12v13" />
      </svg>
    </span>
  )
}

interface BrandProps {
  subtitle?: string
  tone?: 'light' | 'dark'
}

export function Brand({ subtitle = 'Retail operations', tone = 'light' }: BrandProps) {
  return (
    <div className="flex items-center gap-[11px]">
      <BrandMark />
      <div>
        <div className={cx('text-brand font-brand', tone === 'dark' ? 'text-white' : 'text-ink')}>loomdesk</div>
        <div className={cx('mt-0.5 type-caption font-medium', tone === 'dark' && 'text-navy-text')}>
          {subtitle}
        </div>
      </div>
    </div>
  )
}
