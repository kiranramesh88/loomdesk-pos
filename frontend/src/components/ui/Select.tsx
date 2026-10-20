import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

import { cspNonce } from '@/lib/cspNonce'
import { cx } from '@/lib/cx'

import { controlBox } from './controlStyles'
import { Field } from './Field'

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  disabled?: boolean
}

export interface SelectProps<V extends string = string> {
  label: string
  /** Toolbar filters keep an accessible label but hide it visually. */
  hideLabel?: boolean
  options: readonly SelectOption<V>[]
  value: V | undefined
  onValueChange: (value: V) => void
  placeholder?: string
  hint?: string
  error?: string
  optional?: boolean
  disabled?: boolean
  name?: string
  className?: string
}

/** Single-choice select (Radix: keyboard, typeahead and screen-reader support). */
export function Select<V extends string = string>({
  label,
  hideLabel,
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  hint,
  error,
  optional,
  disabled,
  name,
  className,
}: SelectProps<V>) {
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} error={error} optional={optional} className={className}>
      {(control) => (
        <RadixSelect.Root value={value} onValueChange={(v) => onValueChange(v as V)} disabled={disabled} name={name}>
          <RadixSelect.Trigger
            {...control}
            className={cx(
              controlBox({ invalid: !!error, disabled }),
              'justify-between gap-2 pr-2.5 pl-3.5 text-left type-body text-ink-2 data-[placeholder]:text-muted',
            )}
          >
            <span className="truncate">
              <RadixSelect.Value placeholder={placeholder} />
            </span>
            <RadixSelect.Icon>
              <ChevronDown aria-hidden className="size-4 text-muted" />
            </RadixSelect.Icon>
          </RadixSelect.Trigger>
          <RadixSelect.Portal>
            <RadixSelect.Content
              position="popper"
              sideOffset={6}
              className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-control border border-line bg-surface shadow-overlay"
            >
              <RadixSelect.Viewport className="p-1" nonce={cspNonce()}>
                {options.map((option) => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="relative flex h-9 cursor-pointer items-center rounded-sm pr-3 pl-8 type-body text-ink-2 outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-disabled data-[highlighted]:bg-surface-muted data-[state=checked]:font-strong"
                  >
                    <RadixSelect.ItemIndicator className="absolute left-2.5 text-primary">
                      <Check aria-hidden className="size-4" />
                    </RadixSelect.ItemIndicator>
                    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  </RadixSelect.Item>
                ))}
              </RadixSelect.Viewport>
            </RadixSelect.Content>
          </RadixSelect.Portal>
        </RadixSelect.Root>
      )}
    </Field>
  )
}
