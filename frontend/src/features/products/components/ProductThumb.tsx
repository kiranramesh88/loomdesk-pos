import { ImageOff } from 'lucide-react'
import { useState } from 'react'

import { cx } from '@/lib/cx'

const SIZES = { sm: 'size-10', lg: 'size-24' } as const

/**
 * Product photo with the plan's one treatment (§6.5): contained on white, lazy-loaded, and the
 * ImageOff placeholder when there's no photo or it fails to load. Decorative: the name sits beside it.
 */
export function ProductThumb({ src, size = 'sm' }: { src: string | null; size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = src && failed !== src
  return (
    <span
      aria-hidden
      className={cx(
        'grid shrink-0 place-items-center overflow-hidden rounded-control border border-line-soft bg-surface text-muted',
        SIZES[size],
        size === 'sm' ? '[&_svg]:size-4' : '[&_svg]:size-8',
      )}
    >
      {showImage ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="size-full object-contain" />
      ) : (
        <ImageOff />
      )}
    </span>
  )
}
