import type { StatusTone } from '@/components/ui/StatusBadge'
import type { ReturnDisposition, ReturnReason } from '@/types/domain'

export { formatSaleTime, PAYMENT_LABELS, isManuallyRecorded, itemsLabel } from '@/features/transactions/labels'

export const REASON_LABELS: Record<ReturnReason, string> = {
  size_fit: 'Size or fit',
  defect: 'Damaged or defective',
  not_as_expected: 'Not as expected',
  wrong_item: 'Wrong item',
  other: 'Other',
}

export const REASONS: readonly ReturnReason[] = ['size_fit', 'defect', 'not_as_expected', 'wrong_item', 'other']

/**
 * Where returned units go. Only "Back to stock" changes stock. Inspection holds are the cases someone still
 * has to look at, so they get the one attention tone (spec §5.5: distinct without alarming every row).
 */
export const DISPOSITION_LABELS: Record<ReturnDisposition, { label: string; tone: StatusTone; effect: string }> = {
  sellable: { label: 'Back to stock', tone: 'success', effect: 'goes back into stock' },
  damaged: { label: 'Damaged', tone: 'neutral', effect: 'is written off as damaged; stock doesn’t change' },
  inspection: { label: 'Inspection hold', tone: 'warning', effect: 'is held for inspection; stock doesn’t change' },
}

export const unitsLabel = (count: number) => `${count.toLocaleString('en-IN')} ${count === 1 ? 'unit' : 'units'}`
