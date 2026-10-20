import { ArrowLeft, SearchX } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/toastContext'
import { ApiError } from '@/lib/http'
import type { SupplierDetail } from '@/types/domain'

import { useCreateSupplier, useSupplier, useUpdateSupplier } from '../api'
import { SupplierForm } from '../components/SupplierForm'
import { parseSupplierId } from '../supplierParams'

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <ButtonLink to={to} variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-3 mb-2">
      {label}
    </ButtonLink>
  )
}

export function SupplierMissing() {
  return (
    <>
      <BackLink to="/admin/suppliers" label="Suppliers" />
      <Card>
        <EmptyState
          icon={<SearchX />}
          title="This supplier doesn’t exist"
          description="Check the address. Suppliers are deactivated, never deleted, so it should be in the list."
          action={<ButtonLink to="/admin/suppliers">Back to suppliers</ButtonLink>}
        />
      </Card>
    </>
  )
}

/** Loads the supplier in the URL and renders its loading, missing and error states. */
export function WithSupplier({ back, children }: { back: (s?: SupplierDetail) => React.ReactNode; children: (s: SupplierDetail) => React.ReactNode }) {
  const id = parseSupplierId(useParams().supplierId)
  const supplier = useSupplier(id)
  if (id === null || (supplier.error instanceof ApiError && supplier.error.status === 404)) return <SupplierMissing />
  if (supplier.error) {
    return (
      <>
        {back()}
        <Card>
          <ErrorState message={supplier.error.message} onRetry={() => void supplier.refetch()} retrying={supplier.isRefetching} />
        </Card>
      </>
    )
  }
  if (!supplier.data) {
    return (
      <>
        {back()}
        <Card aria-busy="true" aria-label="Loading supplier" className="p-6">
          <SkeletonText lines={5} />
        </Card>
      </>
    )
  }
  return <>{children(supplier.data)}</>
}

export function SupplierCreatePage() {
  const create = useCreateSupplier()
  const navigate = useNavigate()
  const { toast } = useToast()
  return (
    <>
      <BackLink to=".." label="Suppliers" />
      <PageHeader title="Add supplier" description="Contact and business details. Purchases and payments are recorded on its profile." />
      <SupplierForm
        submitLabel="Add supplier"
        pendingLabel="Adding…"
        cancelTo=".."
        onSubmit={async (payload) => {
          const supplier = await create.mutateAsync(payload)
          toast({ tone: 'success', title: 'Supplier added', description: supplier.name })
          navigate(`../${supplier.id}`, { replace: true })
        }}
      />
    </>
  )
}

function EditForm({ supplier }: { supplier: SupplierDetail }) {
  const update = useUpdateSupplier(supplier.id)
  const navigate = useNavigate()
  const { toast } = useToast()
  return (
    <>
      <BackLink to=".." label={supplier.name} />
      <PageHeader title="Edit supplier" description={supplier.name} />
      <SupplierForm
        supplier={supplier}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelTo=".."
        onSubmit={async (payload) => {
          await update.mutateAsync(payload)
          toast({ tone: 'success', title: 'Supplier saved', description: payload.name })
          navigate('..', { replace: true })
        }}
      />
    </>
  )
}

export function SupplierEditPage() {
  return <WithSupplier back={() => <BackLink to=".." label="Supplier" />}>{(supplier) => <EditForm supplier={supplier} />}</WithSupplier>
}
