import { ErrorState } from '@/components/feedback/ErrorState'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileList, MobilePageHeader, MobilePanel, MobileRow } from '@/layouts/mobile/MobilePage'
import { MobileRowsSkeleton } from '@/layouts/mobile/MobilePageStates'

import { useReportLibrary } from '../api'

/** `/admin/mobile/reports`: the same reports as the full admin, read on a phone. */
export function MobileReportsPage() {
  const library = useReportLibrary()
  return (
    <>
      <MobilePageHeader
        title="Reports"
        description="Sales, refunds, tax, stock and activity from LoomDesk’s own records."
        back={{ to: mobilePath('more'), label: 'More' }}
      />
      <MobilePanel title="Reports">
        {library.isError ? (
          <ErrorState message={library.error.message} onRetry={() => void library.refetch()} retrying={library.isFetching} />
        ) : !library.data ? (
          <MobileRowsSkeleton rows={5} label="Loading reports" />
        ) : (
          <MobileList label="Reports">
            {library.data.map((r) => (
              <MobileRow key={r.key} to={mobilePath(`reports/${r.key}`)} title={r.title} meta={<span>{r.description}</span>} />
            ))}
          </MobileList>
        )}
      </MobilePanel>
    </>
  )
}
