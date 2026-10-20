import { StatusBadge } from '@/components/ui/StatusBadge'
import type { ReturnDisposition } from '@/types/domain'

import { DISPOSITION_LABELS } from '../labels'

/** Where a return's items went, as text badges. */
export function Dispositions({ values }: { values: readonly ReturnDisposition[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {values.map((d) => (
        <StatusBadge key={d} tone={DISPOSITION_LABELS[d].tone}>
          {DISPOSITION_LABELS[d].label}
        </StatusBadge>
      ))}
    </span>
  )
}
