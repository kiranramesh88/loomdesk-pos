import { useState, type ReactNode } from 'react'

import { Button } from './Button'
import { Dialog } from './Dialog'
import { InlineAlert } from './InlineAlert'
import { Textarea } from './Textarea'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** State the consequence plainly, e.g. what happens to stock or the invoice. */
  description: ReactNode
  confirmLabel: string
  /** In-progress label for the confirm button, e.g. "Voiding…". */
  pendingLabel?: string
  tone?: 'primary' | 'danger'
  /** When set, a reason is required and passed to onConfirm (voids, stock removals). */
  reasonLabel?: string
  /**
   * Run the action. Resolve to close the dialog; throw to keep it open and show
   * the error inside it (e.g. an ApiError message).
   */
  onConfirm: (reason: string) => Promise<void> | void
}

/** Confirmation for destructive or financially significant actions (spec §4 "Forms"). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = 'primary',
  reasonLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  const reset = () => {
    setReason('')
    setReasonError(undefined)
    setError(undefined)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const confirm = async () => {
    if (reasonLabel && !reason.trim()) {
      setReasonError('A reason is required.')
      return
    }
    setPending(true)
    setError(undefined)
    try {
      await onConfirm(reason.trim())
      handleOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      size="sm"
      dismissible={!pending}
      footer={
        <>
          <Button onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant={tone} onClick={confirm} loading={pending} loadingLabel={pendingLabel}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="type-body">{description}</div>
        {reasonLabel && (
          <Textarea
            label={reasonLabel}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              if (reasonError) setReasonError(undefined)
            }}
            error={reasonError}
            rows={2}
          />
        )}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      </div>
    </Dialog>
  )
}
