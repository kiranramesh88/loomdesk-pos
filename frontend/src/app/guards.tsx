import { CloudOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { PageLoader } from '@/components/feedback/PageLoader'
import { StatusScreen } from '@/components/feedback/StatusScreen'
import { Button } from '@/components/ui/Button'
import { homePathFor, useMe } from '@/features/auth/api'
import type { Me, Role } from '@/types/domain'

/** Resolves the session once; renders children with the user, or redirects to /login. */
function WithSession({ children }: { children: (me: Me) => ReactNode }) {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return <PageLoader />
  if (me.isError) {
    return (
      <StatusScreen
        icon={<CloudOff className="size-6" />}
        title="Can’t reach LoomDesk"
        description={me.error.message}
        actions={<Button variant="primary" onClick={() => me.refetch()} loading={me.isFetching}>Try again</Button>}
      />
    )
  }
  if (!me.data) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children(me.data)}</>
}

/** UI convenience only — every gated endpoint has a matching DRF permission (plan §6.2). */
export function RequireRole({ roles }: { roles: readonly Role[] }) {
  return <WithSession>{(me) => (roles.includes(me.role) ? <Outlet /> : <Navigate to="/403" replace />)}</WithSession>
}

export function HomeRedirect() {
  return <WithSession>{(me) => <Navigate to={homePathFor(me.role)} replace />}</WithSession>
}
