import { LoaderCircle } from 'lucide-react'

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex items-center gap-2.5 type-page-desc">
        <LoaderCircle aria-hidden className="size-5 animate-spin text-primary" />
        {label}
      </div>
    </div>
  )
}
