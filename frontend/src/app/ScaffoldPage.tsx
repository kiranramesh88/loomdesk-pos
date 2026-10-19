import { Construction, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'

import { StatusScreen } from '@/components/feedback/StatusScreen'
import { Button } from '@/components/ui/Button'
import { useLogout, useMe } from '@/features/auth/api'
import { ROLE_LABELS } from '@/types/domain'

/** Temporary stand-in for areas not built yet. Each one is replaced in the phase named. */
export function ScaffoldPage({ area, phase }: { area: string; phase: number }) {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()

  return (
    <StatusScreen
      icon={<Construction className="size-6" />}
      title={area}
      description={
        <>
          <p>This area is built in Phase {phase} of the implementation plan.</p>
          {me.data && (
            <p className="mt-3 text-ink-3">
              Signed in as <strong className="font-strong">{me.data.full_name}</strong> · {ROLE_LABELS[me.data.role]}
            </p>
          )}
        </>
      }
      actions={
        <Button
          icon={<LogOut className="size-4" />}
          loading={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
        >
          Sign out
        </Button>
      }
    />
  )
}
