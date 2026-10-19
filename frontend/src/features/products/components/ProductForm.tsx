import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form'

import { ButtonLink } from '@/components/ui/ButtonLink'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Form, FormActions, FormGrid, FormSection } from '@/components/ui/Form'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Select, type SelectOption } from '@/components/ui/Select'
import { TextField } from '@/components/ui/TextField'
import { Textarea } from '@/components/ui/Textarea'
import { ApiError } from '@/lib/http'
import { formatMoney, parseRupees } from '@/lib/money'
import type { Category, ProductDetail, ProductWrite, TaxRule } from '@/types/domain'

import { productSchema, toFormField, toFormValues, toPayload, type ProductFormValues } from '../productForm'
import { ProductImageField, type ImageChange } from './ProductImageField'
import { VariantRows } from './VariantRows'

const DEFAULT_RULE = 'category'

interface ProductFormProps {
  product?: ProductDetail
  categories: Category[]
  taxRules: TaxRule[]
  submitLabel: string
  pendingLabel: string
  cancelTo: string
  /** Save the product, then apply the photo change. Throw an ApiError to show it on the form. */
  onSubmit: (payload: ProductWrite, image: ImageChange) => Promise<void>
}

export function ProductForm({ product, categories, taxRules, submitLabel, pendingLabel, cancelTo, onSubmit }: ProductFormProps) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: toFormValues(product),
    mode: 'onTouched',
  })
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = form
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' })
  const [formError, setFormError] = useState<string>()

  const [categoryId, taxRuleId, basePrice, costPrice] = useWatch({
    control,
    name: ['category', 'taxRule', 'basePrice', 'costPrice'],
  })
  const category = categories.find((c) => String(c.id) === categoryId)

  const submit = handleSubmit(async (values) => {
    setFormError(undefined)
    try {
      await onSubmit(toPayload(values), image)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      const entries = Object.entries(error.fields)
      entries.forEach(([path, messages], i) =>
        setError(toFormField(path) as FieldPath<ProductFormValues>, { message: messages[0] }, { shouldFocus: i === 0 }),
      )
      // Field errors explain themselves; anything else (network, permissions, races) goes on top.
      setFormError(
        entries.length
          ? `Check the highlighted ${entries.length === 1 ? 'field' : `${entries.length} fields`}. Nothing was saved.`
          : error.message,
      )
    }
  })

  const categoryOptions: SelectOption[] = categories.map((c) => ({ value: String(c.id), label: c.name }))
  const ruleOptions: SelectOption[] = [
    { value: DEFAULT_RULE, label: category ? `Category default: ${category.tax_rule.summary}` : 'Category default' },
    ...taxRules.map((r) => ({ value: String(r.id), label: `${r.name}` })),
  ]
  const appliedRule = taxRules.find((r) => String(r.id) === taxRuleId) ?? category?.tax_rule

  return (
    <FormProvider {...form}>
      <Form onSubmit={submit} aria-label={submitLabel}>
        {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

        <Card>
          <CardBody className="pt-5 sm:px-6 sm:pt-6 sm:pb-6">
            <FormSection title="Product information" description="How the product appears in the catalogue and on receipts.">
              <FormGrid>
                <TextField
                  label="Product name"
                  placeholder="Classic Cotton Shirt"
                  className="sm:col-span-2"
                  error={errors.name?.message}
                  {...register('name')}
                />
                <TextField
                  label="Product SKU"
                  placeholder="SH-CT-001"
                  autoCapitalize="characters"
                  hint="Style code shared by all variants."
                  error={errors.sku?.message}
                  {...register('sku')}
                />
                <Select
                  label="Category"
                  placeholder="Choose a category"
                  options={categoryOptions}
                  value={categoryId || undefined}
                  onValueChange={(v) => setValue('category', v, { shouldDirty: true, shouldValidate: true })}
                  error={errors.category?.message}
                />
                <Textarea
                  label="Description"
                  optional
                  className="sm:col-span-2"
                  error={errors.description?.message}
                  {...register('description')}
                />
                <div className="sm:col-span-2">
                  <ProductImageField
                    currentUrl={product?.image_url ?? null}
                    value={image}
                    onChange={setImage}
                    disabled={isSubmitting}
                  />
                </div>
              </FormGrid>
            </FormSection>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="pt-5 sm:px-6 sm:pt-6 sm:pb-6">
            <FormSection
              title="Pricing & tax"
              description="Prices are per unit. Past receipts keep the price and tax they were sold at."
            >
              <FormGrid>
                <TextField
                  label="Selling price"
                  inputMode="decimal"
                  leading="₹"
                  placeholder="1199"
                  error={errors.basePrice?.message}
                  {...register('basePrice')}
                />
                <TextField
                  label="Cost price"
                  optional
                  inputMode="decimal"
                  leading="₹"
                  placeholder="620"
                  hint={marginHint(basePrice, costPrice)}
                  error={errors.costPrice?.message}
                  {...register('costPrice')}
                />
                <Select
                  label="GST rule"
                  options={ruleOptions}
                  value={taxRuleId || DEFAULT_RULE}
                  onValueChange={(v) => setValue('taxRule', v === DEFAULT_RULE ? '' : v, { shouldDirty: true })}
                  hint={appliedRule ? `Applies ${appliedRule.summary}.` : 'Choose a category to see its GST rule.'}
                  error={errors.taxRule?.message}
                />
                <TextField
                  label="HSN code"
                  optional
                  inputMode="numeric"
                  hint={category ? `Blank uses the category’s ${category.hsn_code}.` : 'Blank uses the category’s code.'}
                  error={errors.hsnCode?.message}
                  {...register('hsnCode')}
                />
              </FormGrid>
            </FormSection>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="pt-5 sm:px-6 sm:pt-6 sm:pb-6">
            <FormSection
              title="Variants & inventory"
              description="Each size and colour is tracked separately. New variants can start with opening stock."
            >
              <VariantRows disabled={isSubmitting} />
            </FormSection>
          </CardBody>
        </Card>

        <FormActions>
          <ButtonLink to={cancelTo}>Cancel</ButtonLink>
          <Button type="submit" variant="primary" loading={isSubmitting} loadingLabel={pendingLabel}>
            {submitLabel}
          </Button>
        </FormActions>
      </Form>
    </FormProvider>
  )
}

function marginHint(basePrice: string, costPrice: string): string {
  const price = parseRupees(basePrice)
  const cost = parseRupees(costPrice)
  if (!price || cost === null || !costPrice.trim()) return 'Used for margin; only admins see it.'
  const margin = price - cost
  return `Margin ${formatMoney(margin)} (${Math.round((margin / price) * 100)}% of the selling price).`
}
