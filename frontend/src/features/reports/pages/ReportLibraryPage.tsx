import {
  ArrowLeftRight,
  Ban,
  Boxes,
  ChartLine,
  ChevronRight,
  FileText,
  History,
  Landmark,
  Package,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import { ErrorState } from '@/components/feedback/ErrorState'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'

import { useReportLibrary } from '../api'

const ICONS: Record<string, LucideIcon> = {
  'sales-summary': ChartLine,
  'sales-by-product': Package,
  'sales-by-staff': Users,
  'payment-methods': Wallet,
  returns: ArrowLeftRight,
  voids: Ban,
  'tax-summary': Landmark,
  'inventory-valuation': Boxes,
  'low-stock': TriangleAlert,
  activity: History,
}

/** `/admin/reports`: only the reports the server implements, each opening its workspace. */
export function ReportLibraryPage() {
  const library = useReportLibrary()
  return (
    <>
      <PageHeader
        title="Reports & insights"
        description="Sales, refunds, tax, stock and activity from LoomDesk’s own records. Each report says how its figures are worked out."
      />
      {library.isError ? (
        <Card>
          <ErrorState title="Reports couldn’t load" message={library.error.message} onRetry={() => void library.refetch()} retrying={library.isFetching} />
        </Card>
      ) : (
        <ul aria-label="Reports" aria-busy={library.isPending || undefined} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {library.isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="rounded-card border border-line bg-surface p-4 shadow-card">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="mt-3 h-3 w-4/5" />
                </li>
              ))
            : library.data.map((report) => {
                const Icon = ICONS[report.key] ?? FileText
                return (
                  <li key={report.key}>
                    <Link
                      to={report.key}
                      className="group flex h-full items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-control hover:border-primary-border"
                    >
                      <span aria-hidden className="grid size-[33px] shrink-0 place-items-center rounded-mark bg-primary-soft text-primary">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="type-label text-ink-2 group-hover:text-primary">{report.title}</span>
                        <span className="type-helper">{report.description}</span>
                        <span className="type-caption">{report.uses_dates ? 'Choose dates' : 'Stock as it is now'}</span>
                      </span>
                      <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                )
              })}
        </ul>
      )}
    </>
  )
}
