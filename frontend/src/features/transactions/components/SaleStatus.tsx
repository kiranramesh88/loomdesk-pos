import { StatusBadge } from '@/components/ui/StatusBadge'
import type { ReturnState, SaleStatus } from '@/types/domain'

import { RETURN_STATE_LABELS, SALE_STATUS_LABELS } from '../labels'

/** The sale's own status, plus its derived return state when goods came back. Text as well as colour. */
export function SaleStatusBadges({ status, returnState }: { status: SaleStatus; returnState: ReturnState }) {
  const own = SALE_STATUS_LABELS[status]
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge tone={own.tone}>{own.label}</StatusBadge>
      {returnState !== 'none' && (
        <StatusBadge tone={RETURN_STATE_LABELS[returnState].tone}>{RETURN_STATE_LABELS[returnState].label}</StatusBadge>
      )}
    </span>
  )
}
