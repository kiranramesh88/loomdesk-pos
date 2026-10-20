import { ArrowRight, Smartphone } from 'lucide-react'

import { ButtonLink } from '@/components/ui/ButtonLink'
import { useStore } from '@/features/store/api'
import { ROLE_LABELS, type Me } from '@/types/domain'

import { AdminNavDrawer } from './AdminNavDrawer'
import { accountLabel } from './accountLabel'
import { Avatar } from './Avatar'
import { UserMenu } from './UserMenu'

/**
 * Sticky topbar (prototype .topbar): page context on the left, workspace switches and the
 * signed-in user on the right. The section name is plain text; each page's PageHeader owns the <h1>.
 */
export function AdminTopbar({ me, title }: { me: Me; title: string }) {
  const store = useStore()

  return (
    <header className="sticky top-0 z-30 flex print:hidden h-[62px] shrink-0 items-center gap-2.5 border-b border-line bg-surface/95 px-3 backdrop-blur-md sm:h-[68px] sm:gap-3.5 sm:px-[15px] md:h-[76px] md:px-[22px] lg:gap-[18px] lg:px-[29px]">
      <AdminNavDrawer />

      <div className="min-w-0 flex-1">
        <p className="hidden truncate type-caption sm:block">
          {store.data ? `${store.data.name} / Workspace` : 'Workspace'}
        </p>
        <p className="truncate text-panel font-semibold tracking-[-0.3px] text-ink sm:mt-0.5 sm:text-title">{title}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-2 sm:flex">
          <ButtonLink to="/admin/mobile/" icon={<Smartphone />}>
            Mobile view
          </ButtonLink>
          <ButtonLink to="/billing" variant="primary" trailingIcon={<ArrowRight />}>
            Open billing
          </ButtonLink>
          <span aria-hidden className="mx-1 h-7 w-px bg-line" />
        </div>

        <UserMenu
          me={me}
          trigger={
            <button
              type="button"
              aria-label={accountLabel(me)}
              className="flex items-center gap-2.5 rounded-control p-1 text-left transition-control hover:bg-surface-muted"
            >
              <Avatar me={me} className="size-[31px]" />
              <span className="hidden max-w-[150px] min-w-0 lg:block">
                <span className="block truncate text-small font-strong text-ink-2">{me.full_name}</span>
                <span className="mt-0.5 block truncate type-caption">{ROLE_LABELS[me.role]}</span>
              </span>
            </button>
          }
        />
      </div>
    </header>
  )
}
