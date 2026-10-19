import { ImagePlus, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'

import { ProductThumb } from './ProductThumb'

export type ImageChange = { kind: 'keep' } | { kind: 'replace'; file: File } | { kind: 'remove' }

const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

interface ProductImageFieldProps {
  currentUrl: string | null
  value: ImageChange
  onChange: (change: ImageChange) => void
  /** Server message from a failed upload, shown under the field. */
  error?: string
  disabled?: boolean
}

/** Photo picker. The change is applied when the form saves, so Cancel really cancels it. */
export function ProductImageField({ currentUrl, value, onChange, error, disabled }: ProductImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const messageId = useId()
  const [localError, setLocalError] = useState<string>()
  const file = value.kind === 'replace' ? value.file : null
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  // Release the preview's memory when it's replaced or the form unmounts.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const shown = value.kind === 'replace' ? preview : value.kind === 'remove' ? null : currentUrl
  const message = localError ?? error
  const status =
    value.kind === 'replace'
      ? `New photo selected: ${value.file.name}. It's uploaded when you save.`
      : value.kind === 'remove'
        ? 'The photo will be removed when you save.'
        : currentUrl
          ? 'JPEG, PNG or WebP, up to 5 MB.'
          : 'No photo yet. JPEG, PNG or WebP, up to 5 MB.'

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!TYPES.includes(file.type)) return setLocalError('Choose a JPEG, PNG or WebP photo.')
    if (file.size > MAX_BYTES) return setLocalError('Choose a photo under 5 MB.')
    setLocalError(undefined)
    onChange({ kind: 'replace', file })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-label">
        Photo <span className="font-regular text-muted">(optional)</span>
      </span>
      <div className="flex flex-wrap items-center gap-4">
        <ProductThumb src={shown} size="lg" />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<ImagePlus />}
              disabled={disabled}
              aria-describedby={messageId}
              onClick={() => inputRef.current?.click()}
            >
              {shown ? 'Replace photo' : 'Choose photo'}
            </Button>
            {value.kind !== 'keep' ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Undo2 />}
                disabled={disabled}
                onClick={() => {
                  setLocalError(undefined)
                  onChange({ kind: 'keep' })
                }}
              >
                Undo
              </Button>
            ) : (
              currentUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 />}
                  disabled={disabled}
                  onClick={() => onChange({ kind: 'remove' })}
                >
                  Remove photo
                </Button>
              )
            )}
          </div>
          <p id={messageId} className={message ? 'type-helper text-danger' : 'type-helper'} aria-live="polite">
            {message ?? status}
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-label="Product photo file"
        onChange={(event) => {
          pick(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </div>
  )
}
