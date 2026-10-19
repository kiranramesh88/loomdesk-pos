import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ErrorState } from '@/components/feedback/ErrorState'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/toastContext'
import { ApiError } from '@/lib/http'
import type { Category, ProductDetail, TaxRule } from '@/types/domain'

import {
  parseProductId,
  useCategories,
  useCreateProduct,
  useProduct,
  useProductImage,
  useTaxRules,
  useUpdateProduct,
} from '../api'
import type { ImageChange } from '../components/ProductImageField'
import { ProductForm } from '../components/ProductForm'
import { ProductMissing } from './ProductDetailPage'

const backLink = (to: string, label: string) => (
  <ButtonLink to={to} variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-3 mb-2">
    {label}
  </ButtonLink>
)

function FormSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading form" className="p-6">
      <SkeletonText lines={6} />
    </Card>
  )
}

/** The form needs categories and tax rules; each failure gets its own retry. */
function WithCatalogueOptions({ children }: { children: (categories: Category[], taxRules: TaxRule[]) => ReactNode }) {
  const categories = useCategories()
  const taxRules = useTaxRules()
  const failed = categories.error ?? taxRules.error
  if (failed) {
    return (
      <Card>
        <ErrorState
          title="The form couldn’t load"
          message={failed.message}
          onRetry={() => {
            if (categories.error) categories.refetch()
            if (taxRules.error) taxRules.refetch()
          }}
          retrying={categories.isRefetching || taxRules.isRefetching}
        />
      </Card>
    )
  }
  if (!categories.data || !taxRules.data) return <FormSkeleton />
  return <>{children(categories.data, taxRules.data)}</>
}

/** Apply the photo change after the product itself saved. Returns an error message, if any. */
async function applyImage(
  id: number,
  change: ImageChange,
  image: ReturnType<typeof useProductImage>,
): Promise<string | undefined> {
  try {
    if (change.kind === 'replace') await image.upload.mutateAsync({ id, file: change.file })
    if (change.kind === 'remove') await image.remove.mutateAsync(id)
  } catch (error) {
    return error instanceof ApiError ? (error.fields.image?.[0] ?? error.message) : 'The photo couldn’t be saved.'
  }
}

export function ProductCreatePage() {
  const create = useCreateProduct()
  const navigate = useNavigate()
  const { toast } = useToast()
  const image = useProductImage()

  return (
    <>
      {backLink('..', 'Products')}
      <PageHeader title="Add product" description="Add the details, prices and variants needed to sell it." />
      <WithCatalogueOptions>
        {(categories, taxRules) => (
          <ProductForm
            categories={categories}
            taxRules={taxRules}
            submitLabel="Add product"
            pendingLabel="Adding…"
            cancelTo=".."
            onSubmit={async (payload, change) => {
              const product = await create.mutateAsync(payload)
              const photoError = await applyImage(product.id, change, image)
              if (photoError) {
                toast({ tone: 'error', title: 'Product added, but the photo wasn’t saved', description: photoError })
                navigate(`../${product.id}/edit`, { replace: true })
                return
              }
              toast({ tone: 'success', title: 'Product added', description: product.name })
              navigate(`../${product.id}`, { replace: true })
            }}
          />
        )}
      </WithCatalogueOptions>
    </>
  )
}

function EditForm({ product }: { product: ProductDetail }) {
  const update = useUpdateProduct(product.id)
  const image = useProductImage()
  const navigate = useNavigate()
  const { toast } = useToast()
  return (
    <WithCatalogueOptions>
      {(categories, taxRules) => (
        <ProductForm
          product={product}
          categories={categories}
          taxRules={taxRules}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          cancelTo=".."
          onSubmit={async (payload, change) => {
            const saved = await update.mutateAsync(payload)
            const photoError = await applyImage(product.id, change, image)
            if (photoError) {
              toast({ tone: 'error', title: 'Changes saved, but the photo wasn’t', description: photoError })
              return
            }
            toast({ tone: 'success', title: 'Changes saved', description: saved.name })
            navigate('..', { replace: true })
          }}
        />
      )}
    </WithCatalogueOptions>
  )
}

export function ProductEditPage() {
  const id = parseProductId(useParams().productId)
  const product = useProduct(id)

  if (id === null || (product.error instanceof ApiError && product.error.status === 404)) return <ProductMissing />
  return (
    <>
      {backLink('..', product.data?.name ?? 'Product')}
      <PageHeader
        title={product.data ? `Edit ${product.data.name}` : 'Edit product'}
        description="Changes apply to future sales. Completed receipts keep their original values."
      />
      {product.error ? (
        <Card>
          <ErrorState message={product.error.message} onRetry={() => product.refetch()} retrying={product.isRefetching} />
        </Card>
      ) : product.data ? (
        // Keyed so a refetch after saving resets the form to the saved values.
        <EditForm key={product.data.updated_at} product={product.data} />
      ) : (
        <FormSkeleton />
      )}
    </>
  )
}
