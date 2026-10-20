import { FileQuestion } from 'lucide-react'
import { useRouteError } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

import { mobilePath } from './mobileNav'
import { MobilePageHeader } from './MobilePage'

/** Shown while a page's code loads; the header and bottom nav stay put. */
export function MobilePageSkeleton() {
  return (
    <div role="status" aria-label="Loading page">
      <div className="mb-4 grid gap-2.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-60 max-w-full" />
      </div>
      <Card className="p-4">
        <SkeletonText lines={4} />
      </Card>
    </div>
  )
}

/** A few placeholder rows inside a panel while its list loads. */
export function MobileRowsSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line-soft border-t border-line-soft">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

const isChunkLoadError = (error: unknown) =>
  error instanceof Error && /dynamically imported module|importing a module script failed|failed to fetch/i.test(error.message)

/** errorElement for mobile pages: the failure stays inside <main> and the bottom nav keeps working. */
export function MobileRouteError() {
  const chunk = isChunkLoadError(useRouteError())
  return (
    <Card>
      <ErrorState
        title={chunk ? 'This page couldn’t load' : 'Something went wrong on this page'}
        message={
          chunk
            ? 'Part of LoomDesk didn’t download, often after an update or a dropped connection. Reload to try again.'
            : 'Reload the page to try again. The other tabs still work.'
        }
        onRetry={() => window.location.reload()}
      />
    </Card>
  )
}

export function MobileNotFound() {
  return (
    <>
      <MobilePageHeader title="Page not found" description="The address may be mistyped, or the page may have moved." />
      <Card>
        <EmptyState
          icon={<FileQuestion />}
          title="Nothing at this address"
          description="Use the tabs below, or go back to the overview."
          action={<ButtonLink to={mobilePath()}>Go to Overview</ButtonLink>}
        />
      </Card>
    </>
  )
}
