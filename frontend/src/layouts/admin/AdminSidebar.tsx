import { ChevronsUpDown } from 'lucide-react'

import { Brand, BrandMark } from '@/components/brand/Brand'
import { cx } from '@/lib/cx'
import { MEDIA, useMediaQuery } from '@/lib/useMediaQuery'
import { ROLE_LABELS, type Me } from '@/types/domain'

import { AdminNavList } from './AdminNavList'
import { accountLabel } from './accountLabel'
import { Avatar } from './Avatar'
import { StoreCard } from './StoreCard'
import { UserMenu } from './UserMenu'

/**
 * Navy sidebar (prototype .sidebar): 238px, 215px at ≤1120 and a 70px icon rail at ≤820.
 * Hidden on phones, where AdminNavDrawer takes over.
 */
export function AdminSidebar({ me }: { me: Me }) {
  const rail = useMediaQuery(MEDIA.rail)

  return (
    <div className="sticky top-0 hidden h-dvh print:hidden w-[70px] shrink-0 flex-col overflow-y-auto bg-navy px-2 pt-5 pb-3.5 sm:flex md:w-[215px] md:px-3.5 md:pt-6 lg:w-[238px]">
      <div className={cx('pb-6', rail ? 'flex justify-center' : 'px-3')}>{rail ? <BrandMark /> : <Brand tone="dark" />}</div>

      <div className={cx('mb-6', !rail && 'mx-1.5')}>
        <StoreCard rail={rail} />
      </div>

      <AdminNavList rail={rail} />

      <div className="mt-auto border-t border-navy-border pt-3.5">
        <UserMenu
          me={me}
          side="top"
          trigger={
            <button
              type="button"
              aria-label={accountLabel(me)}
              title={rail ? me.full_name : undefined}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-control hover:bg-navy-3',
                rail && 'justify-center',
              )}
            >
              <Avatar me={me} />
              {!rail && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-strong text-white">{me.full_name}</span>
                    <span className="mt-0.5 block truncate type-caption text-navy-text">{ROLE_LABELS[me.role]}</span>
                  </span>
                  <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-navy-text" />
                </>
              )}
            </button>
          }
        />
      </div>
    </div>
  )
}
