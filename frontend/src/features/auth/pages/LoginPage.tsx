import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'

import { Brand } from '@/components/brand/Brand'
import { PageLoader } from '@/components/feedback/PageLoader'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/lib/http'

import { homePathFor, safeNextPath, useLogin, useMe } from '../api'

const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const me = useMe()
  const login = useLogin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  if (me.isPending) return <PageLoader />
  if (me.data) return <Navigate to={safeNextPath(params.get('next')) ?? homePathFor(me.data.role)} replace />

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: (user) => navigate(safeNextPath(params.get('next')) ?? homePathFor(user.role), { replace: true }),
      onError: (error) => {
        if (error instanceof ApiError) {
          for (const [field, messages] of Object.entries(error.fields)) {
            if (field === 'email' || field === 'password') setError(field, { message: messages[0] })
          }
        }
      },
    }),
  )

  const formError = login.error && !(login.error instanceof ApiError && Object.keys(login.error.fields).length)
    ? login.error.message
    : null

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex justify-center">
          <Brand />
        </div>

        <section
          aria-labelledby="login-title"
          className="rounded-panel border border-line bg-surface p-6 shadow-panel sm:p-7"
        >
          <h1 id="login-title" className="type-page-title">
            Sign in
          </h1>
          <p className="mt-1 type-page-desc">Use your store account to continue.</p>

          {formError && (
            <InlineAlert tone="danger" className="mt-5">
              {formError}
            </InlineAlert>
          )}

          <form noValidate onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
            <TextField
              label="Email address"
              size="lg"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              error={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Password"
              size="lg"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              error={errors.password?.message}
              trailing={
                <IconButton
                  label={showPassword ? 'Hide password' : 'Show password'}
                  icon={showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  onClick={() => setShowPassword((v) => !v)}
                />
              }
              {...register('password')}
            />
            <Button type="submit" variant="primary" size="lg" fullWidth loading={login.isPending} loadingLabel="Signing in…" className="mt-1">
              Sign in
            </Button>
          </form>
        </section>

        <p className="mt-5 text-center type-helper">
          Forgot your password? Ask a store administrator to reset it.
        </p>
      </div>
    </main>
  )
}
