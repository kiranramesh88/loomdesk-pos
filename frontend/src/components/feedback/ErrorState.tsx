import { CloudOff, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cx } from '@/lib/cx'

export interface ErrorStateProps {
  title?: string
  /** A readable message, usually ApiError.message. */
  message: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}

/** Local failure state: one panel fails, the rest of the page keeps working (spec §5.1). */
export function ErrorState({
  title = 'This section couldn’t load',
  message,
  onRetry,
  retrying,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cx('flex flex-col items-center px-5 py-10 text-center', className)}>
      <span aria-hidden className="mb-3 grid size-10 place-items-center rounded-control bg-danger-bg text-danger [&_svg]:size-5">
        <CloudOff />
      </span>
      <p className="type-section">{title}</p>
      <p className="mt-1 max-w-[360px] type-helper">{message}</p>
      {onRetry && (
        <Button size="sm" className="mt-4" icon={<RotateCw />} onClick={onRetry} loading={retrying} loadingLabel="Retrying…">
          Try again
        </Button>
      )}
    </div>
  )
}
