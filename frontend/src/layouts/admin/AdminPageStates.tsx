import { FileQuestion, RotateCw, TriangleAlert } from 'lucide-react'
import { useRouteError } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { StatusScreen } from '@/components/feedback/StatusScreen'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

/** Shown in <main> while a page's code loads; the shell around it stays put. */
export function AdminPageSkeleton() {
  return (
    <div role="status" aria-label="Loading page">
      <div className="mb-6 grid gap-2.5">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <Card className="p-5">
        <SkeletonText lines={4} />
      </Card>
    </div>
  )
}

/** Browsers word a failed dynamic import differently; all mean the page's code didn't arrive. */
function isChunkLoadError(error: unknown) {
  return error instanceof Error && /dynamically imported module|importing a module script failed|failed to fetch/i.test(error.message)
}

const reload = () => window.location.reload()

/** errorElement for admin pages: the failure stays inside <main> and the navigation keeps working. */
export function AdminRouteError() {
  const error = useRouteError()
  const chunk = isChunkLoadError(error)
  return (
    <Card>
      <ErrorState
        title={chunk ? 'This page couldn’t load' : 'Something went wrong on this page'}
        message={
          chunk
            ? 'Part of LoomDesk didn’t download, often after an update or a dropped connection. Reload to try again.'
            : 'Reload the page to try again. Other pages are still available from the menu.'
        }
        onRetry={reload}
      />
    </Card>
  )
}

/** errorElement for the shell itself (e.g. its code failed to download): nothing else can render. */
export function AdminShellError() {
  return (
    <StatusScreen
      icon={<TriangleAlert className="size-6" />}
      title="LoomDesk couldn’t start"
      description="Part of the app didn’t load. Check the connection, then reload."
      actions={
        <Button variant="primary" icon={<RotateCw />} onClick={reload}>
          Reload
        </Button>
      }
    />
  )
}

/** Unknown /admin/... paths: a not-found state inside the shell, not a full-page 404. */
export function AdminNotFound() {
  return (
    <>
      <PageHeader title="Page not found" description="The address may be mistyped, or the page may have moved." />
      <Card>
        <EmptyState
          icon={<FileQuestion />}
          title="Nothing at this address"
          description="Use the menu to open a section, or go back to the overview."
          action={<ButtonLink to="/admin">Go to Overview</ButtonLink>}
        />
      </Card>
    </>
  )
}
