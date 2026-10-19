import { LogOut } from 'lucide-react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'

import { Menu } from '@/components/ui/Menu'
import { useToast } from '@/components/ui/toastContext'
import { useLogout } from '@/features/auth/api'
import { ApiError } from '@/lib/http'
import type { Me } from '@/types/domain'

/** The signed-in user's menu; the topbar chip and the sidebar profile both open it. */
export function UserMenu({ me, trigger, side }: { me: Me; trigger: ReactElement; side?: 'top' | 'bottom' }) {
  const logout = useLogout()
  const navigate = useNavigate()
  const { toast } = useToast()

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
      onError: (error) => {
        if (error instanceof ApiError && error.isUnauthenticated) navigate('/login', { replace: true })
        else toast({ tone: 'error', title: 'Couldn’t sign out', description: `${error.message} You’re still signed in.` })
      },
    })

  return (
    <Menu
      trigger={trigger}
      side={side}
      label={
        <>
          <span className="block truncate type-body font-strong text-ink-2">{me.full_name}</span>
          <span className="block truncate type-caption">{me.email}</span>
        </>
      }
      items={[{ label: 'Sign out', icon: <LogOut />, onSelect: signOut }]}
    />
  )
}
