import { StatusBadge } from '@/components/ui/StatusBadge'
import { mobilePath } from '@/layouts/mobile/mobileNav'
import { MobileList, MobileRow } from '@/layouts/mobile/MobilePage'
import { formatMoney } from '@/lib/money'
import type { PurchaseListItem } from '@/types/domain'

import { formatDay, PURCHASE_STATUS_LABELS, unitsLabel } from '../labels'

/** Purchase rows linking to the mobile purchase page. `showSupplier` names the supplier (the all-suppliers list). */
export function MobilePurchaseRows({ purchases, showSupplier }: { purchases: PurchaseListItem[]; showSupplier?: boolean }) {
  return (
    <MobileList label="Purchases">
      {purchases.map((p) => {
        const status = PURCHASE_STATUS_LABELS[p.status]
        return (
          <MobileRow
            key={p.id}
            to={mobilePath(`purchases/${p.number}`)}
            title={showSupplier ? p.supplier_name : <span className="tabular">{p.number}</span>}
            meta={
              <>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                {showSupplier && <span className="tabular">{p.number}</span>}
                <span>{formatDay(p.purchase_date)}</span>
                <span className="tabular">{unitsLabel(p.item_count)}</span>
              </>
            }
            aside={<span className="type-amount">{formatMoney(p.total_paise)}</span>}
          />
        )
      })}
    </MobileList>
  )
}
