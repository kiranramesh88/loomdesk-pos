import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/feedback/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import type { AdminNavItem } from '@/layouts/admin/adminNav'

/** Stand-in for an admin module that isn't built yet. Each phase replaces its route's element. */
export function AdminPlaceholderPage({ item }: { item: AdminNavItem }) {
  const Icon = item.icon
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <Card>
        <EmptyState
          icon={<Icon />}
          title={`${item.label} isn’t available yet`}
          description={
            item.phase
              ? `This module is built in Phase ${item.phase} of the implementation plan.`
              : 'This module is scheduled for a later phase of the implementation plan.'
          }
        />
      </Card>
    </>
  )
}
