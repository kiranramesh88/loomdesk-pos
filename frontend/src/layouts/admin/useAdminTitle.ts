import { useMatches } from 'react-router'

import type { AdminRouteHandle } from './adminNav'

/** Title of the deepest matched admin route (see the route table's `handle`). */
export function useAdminTitle(): string {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]!.handle as Partial<AdminRouteHandle> | undefined
    if (handle?.title) return handle.title
  }
  return 'Workspace'
}
