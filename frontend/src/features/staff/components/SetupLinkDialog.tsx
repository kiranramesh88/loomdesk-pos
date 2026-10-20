import { Check, Copy } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { TextField } from '@/components/ui/TextField'
import type { SetupLink } from '@/types/domain'

import { formatWhen } from '../labels'

interface SetupLinkDialogProps {
  link: SetupLink | null
  name: string
  onDone: () => void
}

/**
 * The set-password link, shown this once (decision D5): the server keeps no copy. The admin hands it to the
 * person in the shop; it works once and for three days, and a newer link replaces it.
 */
export function SetupLinkDialog({ link, name, onDone }: SetupLinkDialogProps) {
  const url = link ? `${window.location.origin}${link.path}` : ''
  const field = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // No clipboard over plain http on the shop network: select the text so it can be copied by hand.
      field.current?.select()
    }
  }

  return (
    <Dialog
      open={link !== null}
      onOpenChange={(open) => !open && onDone()}
      title={`Set-password link for ${name}`}
      description="Give this link to them in person. They open it, choose their own password, and then sign in."
      footer={
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      }
    >
      <div className="grid gap-4">
        <InlineAlert tone="warning" title="Shown only now">
          LoomDesk doesn’t keep a copy. Anyone with the link can set this account’s password, so don’t post it in a group
          chat. If it’s lost, issue a new one: the old link stops working.
        </InlineAlert>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <TextField
            ref={field}
            label="Link"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1"
            spellCheck={false}
          />
          <Button icon={copied ? <Check /> : <Copy />} onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
        {link && <p className="type-helper">Works once, until {formatWhen(link.expires_at)}.</p>}
      </div>
    </Dialog>
  )
}
