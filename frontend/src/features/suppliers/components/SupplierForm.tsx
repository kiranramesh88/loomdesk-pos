import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'

import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardBody } from '@/components/ui/Card'
import { Form, FormActions, FormGrid, FormSection } from '@/components/ui/Form'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Textarea } from '@/components/ui/Textarea'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/lib/http'
import type { SupplierDetail, SupplierWrite } from '@/types/domain'

import { supplierSchema, toSupplierPayload, toSupplierValues, type SupplierFormValues } from '../supplierForm'

interface SupplierFormProps {
  supplier?: SupplierDetail
  submitLabel: string
  pendingLabel: string
  cancelTo: string
  /** Save; throw an ApiError to show it on the form. */
  onSubmit: (payload: SupplierWrite) => Promise<void>
}

/** Contact and business details only: there is no balance field (plan B10). */
export function SupplierForm({ supplier, submitLabel, pendingLabel, cancelTo, onSubmit }: SupplierFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: toSupplierValues(supplier),
    mode: 'onTouched',
  })
  const [formError, setFormError] = useState<string>()

  const submit = handleSubmit(async (values) => {
    setFormError(undefined)
    try {
      await onSubmit(toSupplierPayload(values))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      const entries = Object.entries(error.fields)
      entries.forEach(([path, messages], i) =>
        setError(path as FieldPath<SupplierFormValues>, { message: messages[0] }, { shouldFocus: i === 0 }),
      )
      setFormError(
        entries.length
          ? `Check the highlighted ${entries.length === 1 ? 'field' : `${entries.length} fields`}. Nothing was saved.`
          : error.message,
      )
    }
  })

  return (
    <Form onSubmit={submit} aria-label={submitLabel}>
      {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}
      <Card>
        <CardBody className="pt-5 sm:px-6 sm:pt-6 sm:pb-6">
          <FormSection title="Supplier" description="Who they are and what they supply.">
            <FormGrid>
              <TextField label="Supplier name" placeholder="Malabar Textile House" error={errors.name?.message} {...register('name')} />
              <TextField label="Category" placeholder="Apparel & fabric" error={errors.category?.message} {...register('category')} />
              <TextField
                label="GSTIN"
                optional
                autoCapitalize="characters"
                placeholder="32ABCDE1234F1Z5"
                error={errors.gstin?.message}
                {...register('gstin')}
              />
              <TextField label="State" optional placeholder="Kerala" error={errors.state?.message} {...register('state')} />
            </FormGrid>
          </FormSection>
          <FormSection title="Contact" description="How to reach them about orders and payments.">
            <FormGrid>
              <TextField label="Contact person" optional error={errors.contact_name?.message} {...register('contact_name')} />
              <TextField label="Phone" optional type="tel" placeholder="+91 98765 12001" error={errors.phone?.message} {...register('phone')} />
              <TextField
                label="Email"
                optional
                type="email"
                className="sm:col-span-2"
                placeholder="orders@example.com"
                error={errors.email?.message}
                {...register('email')}
              />
              <Textarea label="Address" optional rows={2} className="sm:col-span-2" error={errors.address?.message} {...register('address')} />
              <Textarea
                label="Notes"
                optional
                rows={2}
                className="sm:col-span-2"
                hint="For example: delivery days or payment terms."
                error={errors.notes?.message}
                {...register('notes')}
              />
            </FormGrid>
          </FormSection>
        </CardBody>
      </Card>
      <p className="type-helper">The balance isn’t typed in here. It comes from received purchases and recorded payments.</p>
      <FormActions>
        <ButtonLink to={cancelTo}>Cancel</ButtonLink>
        <Button type="submit" variant="primary" loading={isSubmitting} loadingLabel={pendingLabel}>
          {submitLabel}
        </Button>
      </FormActions>
    </Form>
  )
}
