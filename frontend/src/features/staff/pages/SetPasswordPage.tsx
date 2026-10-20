import { CircleCheck, Eye, EyeOff, LinkIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { Brand } from '@/components/brand/Brand'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { SkeletonText } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/lib/http'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import type { SetPasswordLink } from '@/types/domain'

import { useSetPassword, useSetPasswordLink } from '../api'

const signInLink = (
  <Link to="/login" className="font-strong text-primary hover:underline">
    Go to sign in
  </Link>
)

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex justify-center">
          <Brand />
        </div>
        <section aria-labelledby="set-password-title" className="rounded-panel border border-line bg-surface p-6 shadow-panel sm:p-7">
          <h1 id="set-password-title" className="type-page-title">
            {title}
          </h1>
          {children}
        </section>
      </div>
    </main>
  )
}

/**
 * `/set-password/:uid/:token`: a staff member chooses their own password from the one-time link an admin
 * gave them (decision D5). Public, like sign-in; the server checks the link, CSRF and the rate limit.
 */
export function SetPasswordPage() {
  useDocumentTitle('Set your password')
  const { uid = '', token = '' } = useParams()
  const link = useSetPasswordLink(uid, token)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <Frame title="Password set">
        <div className="mt-4 flex items-start gap-3">
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
          <p className="type-body">You can now sign in with your email and the password you chose. This link no longer works.</p>
        </div>
        <div className="mt-5">{signInLink}</div>
      </Frame>
    )
  }
  if (link.isPending) {
    return (
      <Frame title="Set your password">
        <div role="status" aria-label="Checking the link" className="mt-5">
          <SkeletonText lines={3} />
        </div>
      </Frame>
    )
  }
  if (link.isError) {
    const invalid = link.error instanceof ApiError && link.error.status === 400
    return (
      <Frame title={invalid ? 'This link doesn’t work' : 'The link couldn’t be checked'}>
        <div className="mt-4 flex items-start gap-3">
          <LinkIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
          <p className="type-body">
            {invalid
              ? 'It may have expired (links last three days), been used already, or been replaced by a newer link. Ask a store admin for a new one.'
              : link.error instanceof ApiError && link.error.status === 429
                ? link.error.message
                : 'Check the connection and reload the page.'}
          </p>
        </div>
        <div className="mt-5">{signInLink}</div>
      </Frame>
    )
  }
  return <PasswordForm uid={uid} token={token} account={link.data} onDone={() => setDone(true)} />
}

function PasswordForm({ uid, token, account, onDone }: { uid: string; token: string; account: SetPasswordLink; onDone: () => void }) {
  const save = useSetPassword()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [problem, setProblem] = useState<string>()

  const submit = () => {
    const found: typeof errors = {}
    if (password.length < 8) found.password = 'Use at least 8 characters.'
    else if (password !== confirm) found.confirm = 'The two passwords don’t match.'
    setErrors(found)
    setProblem(undefined)
    if (Object.keys(found).length) return
    save.mutate(
      { uid, token, password },
      {
        onSuccess: onDone,
        onError: (error) => {
          const fieldMessages = error instanceof ApiError ? error.fields.password : undefined
          if (fieldMessages?.length) setErrors({ password: fieldMessages.join(' ') })
          else if (error instanceof ApiError && error.status === 0) setProblem('The server couldn’t be reached. Check the connection and try again.')
          else setProblem(error.message)
        },
      },
    )
  }

  const toggle = (
    <IconButton
      label={show ? 'Hide passwords' : 'Show passwords'}
      icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      onClick={() => setShow((v) => !v)}
    />
  )

  return (
    <Frame title="Set your password">
      <p className="mt-1 type-page-desc">
        For {account.full_name} ({account.email}). Only you will know it; the store admin can’t see it.
      </p>
      {problem && (
        <InlineAlert tone="danger" className="mt-5">
          {problem}
        </InlineAlert>
      )}
      <form
        noValidate
        className="mt-5 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {/* Lets password managers save the new password against the right account. */}
        <input type="email" name="username" autoComplete="username" value={account.email} readOnly hidden />
        <TextField
          label="New password"
          size="lg"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 8 characters. Not all numbers, not a common password, and not close to your name or email."
          trailing={toggle}
        />
        <TextField
          label="Type it again"
          size="lg"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={save.isPending} loadingLabel="Saving…" className="mt-1">
          Set password
        </Button>
      </form>
    </Frame>
  )
}
