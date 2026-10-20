import { Link } from 'react-router'

import { StatusBadge } from '@/components/ui/StatusBadge'
import { cx } from '@/lib/cx'
import type { InventoryMovement } from '@/types/domain'

import { formatDelta, formatWhen, MOVEMENT_LABELS, referencePath } from '../labels'

/**
 * Stock movements as stacked rows: change and balance on the right, reason, who and when below.
 * `showVariant` names the item, for the ledger across all variants.
 */
export function MobileMovementRows({ movements, showVariant }: { movements: InventoryMovement[]; showVariant?: boolean }) {
  return (
    <ul aria-label="Stock movements" className="divide-y divide-line-soft border-t border-line-soft">
      {movements.map((m) => {
        const type = MOVEMENT_LABELS[m.type]
        const path = m.reference ? referencePath(m.reference, true) : null
        return (
          <li key={m.id} className="flex items-start gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {showVariant && (
                <span className="type-body font-strong break-words text-ink-2">
                  {m.variant.product_name} · {m.variant.size} / {m.variant.colour}
                </span>
              )}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <StatusBadge tone={type.tone}>{type.label}</StatusBadge>
                {m.reference &&
                  (path ? (
                    <Link to={path} className="inline-flex min-h-8 items-center type-helper font-strong tabular text-primary hover:underline">
                      {m.reference}
                    </Link>
                  ) : (
                    <span className="type-helper tabular">{m.reference}</span>
                  ))}
              </div>
              {m.reason && <p className="type-helper break-words text-ink-3">{m.reason}</p>}
              <p className="type-caption">
                {formatWhen(m.created_at)} · {m.actor_name ?? 'System'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className={cx('text-price font-bold tabular', m.quantity_delta < 0 ? 'text-danger' : 'text-ink')}>
                {formatDelta(m.quantity_delta)}
              </div>
              <div className="type-caption tabular">Balance {m.balance_after}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
