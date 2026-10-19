import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { IconButton } from '@/components/ui/IconButton'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { TextField } from '@/components/ui/TextField'

import { emptyVariant, suggestVariantSku, type ProductFormValues } from '../productForm'
import { unitsLabel } from '../labels'

/**
 * Size/colour variants, each its own stock-tracked record. Existing stock is read-only here:
 * it changes only through stock movements (opening stock for new variants, Inventory afterwards).
 */
export function VariantRows({ disabled }: { disabled?: boolean }) {
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<ProductFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'variants', keyName: 'key' })
  const rows = useWatch({ control, name: 'variants' })
  const listError = errors.variants?.root?.message ?? errors.variants?.message

  // Offer a SKU in the house style once size and colour are known, without overwriting typed ones.
  const fillSku = (index: number) => {
    const row = getValues(`variants.${index}`)
    if (row.sku.trim()) return
    const suggestion = suggestVariantSku(getValues('sku'), row.size, row.colour)
    if (suggestion) setValue(`variants.${index}.sku`, suggestion, { shouldDirty: true })
  }

  return (
    <div className="flex flex-col gap-3">
      {listError && <InlineAlert tone="danger">{listError}</InlineAlert>}
      <ol className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const row = rows?.[index] ?? field
          const rowErrors = errors.variants?.[index]
          const isNew = field.id === undefined
          const title = [row.size, row.colour].filter((s) => s.trim()).join(' / ') || 'New variant'
          return (
            <li key={field.key} className="rounded-card border border-line bg-surface p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="type-label font-semibold text-ink-2">
                    Variant {index + 1}: <span className="break-words">{title}</span>
                  </h3>
                  {!isNew && (
                    <p className="type-helper">
                      {unitsLabel(field.onHand)} on hand · change stock in Inventory
                    </p>
                  )}
                </div>
                {!field.hasHistory && fields.length > 1 && (
                  <IconButton
                    label={`Remove variant ${index + 1}`}
                    icon={<Trash2 />}
                    disabled={disabled}
                    onClick={() => remove(index)}
                  />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextField
                  label="Size"
                  placeholder="M"
                  readOnly={field.hasHistory}
                  hint={field.hasHistory ? 'Fixed: this variant has stock history.' : undefined}
                  error={rowErrors?.size?.message}
                  {...register(`variants.${index}.size`, { onBlur: () => fillSku(index) })}
                />
                <TextField
                  label="Colour"
                  placeholder="Blue"
                  readOnly={field.hasHistory}
                  hint={field.hasHistory ? 'Fixed: this variant has stock history.' : undefined}
                  error={rowErrors?.colour?.message}
                  {...register(`variants.${index}.colour`, { onBlur: () => fillSku(index) })}
                />
                <TextField
                  label="Variant SKU"
                  placeholder="SH-CT-001-M-BLU"
                  autoCapitalize="characters"
                  error={rowErrors?.sku?.message}
                  {...register(`variants.${index}.sku`)}
                />
                <TextField
                  label="Barcode"
                  optional
                  placeholder="Scan or type"
                  inputMode="text"
                  error={rowErrors?.barcode?.message}
                  {...register(`variants.${index}.barcode`)}
                />
                <TextField
                  label="Price"
                  optional
                  inputMode="decimal"
                  leading="₹"
                  hint="Blank uses the product price."
                  error={rowErrors?.price?.message}
                  {...register(`variants.${index}.price`)}
                />
                <TextField
                  label="Reorder at"
                  inputMode="numeric"
                  hint="Low stock at or below this."
                  error={rowErrors?.reorderLevel?.message}
                  {...register(`variants.${index}.reorderLevel`)}
                />
                {isNew ? (
                  <TextField
                    label="Opening stock"
                    inputMode="numeric"
                    hint="Recorded as an opening stock movement."
                    error={rowErrors?.openingStock?.message}
                    {...register(`variants.${index}.openingStock`)}
                  />
                ) : (
                  <div className="hidden lg:block" />
                )}
                <Checkbox
                  label="Available to sell"
                  hint="Unchecked variants are hidden from billing."
                  className="self-center"
                  disabled={disabled}
                  {...register(`variants.${index}.isActive`)}
                />
              </div>
            </li>
          )
        })}
      </ol>
      <div>
        <Button icon={<Plus />} disabled={disabled} onClick={() => append(emptyVariant(), { shouldFocus: true })}>
          Add variant
        </Button>
      </div>
    </div>
  )
}
