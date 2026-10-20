import { FileQuestion } from 'lucide-react'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ButtonLink } from '@/components/ui/ButtonLink'

export function BillingNotFound() {
  return (
    <div className="mx-auto mt-10 w-full max-w-[460px] rounded-panel border border-line bg-surface px-3">
      <EmptyState
        icon={<FileQuestion />}
        title="Page not found"
        description="This billing page doesn’t exist."
        action={<ButtonLink to="/billing">Back to billing</ButtonLink>}
      />
    </div>
  )
}
