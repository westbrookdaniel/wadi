import { useRef, useState, type ReactNode } from 'react'
import { desktopBridge } from '@/lib/desktop'
import { RevealedImage } from '@/components/revealed-image'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { ArrowRight } from 'lucide-react'
import { z } from 'zod'

import { login, queryKeys, register } from '@/api/queries'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authBackground } from '@/lib/styles'
import { canSubmitForm, fieldError, fieldErrorClass } from '@/lib/form'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

type AuthMode = 'login' | 'register'

const authSchema = z
  .object({
    email: z.email('Enter a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((value) => !value.confirmPassword || value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

function WebAuthPage({ mode, onModeChange }: { mode: AuthMode; onModeChange: (mode: AuthMode) => void }) {
  const queryClient = useQueryClient()
  const setToken = useAppStore((state) => state.setToken)
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId)

  const mutation = useMutation({
    mutationFn: (value: z.infer<typeof authSchema>) =>
      mode === 'login' ? login(value.email, value.password) : register(value.email, value.password),
    onSuccess: async (data) => {
      queryClient.clear()
      setToken(data.token)
      setActiveProfileId(data.active_profile_id ?? data.user.active_profile_id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
    },
  })

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
    validators: {
      onSubmit: mode === 'register' ? authSchema.refine(value => value.confirmPassword === value.password, { message: 'Repeat your password.', path: ['confirmPassword'] }) : authSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  })

  const title = mode === 'login' ? 'Welcome back' : 'Create account'
  const body =
    mode === 'login'
      ? 'Your films, shows, and saved moments.'
      : 'Make a little room for everything you love to watch.'

  return (
    <main
      className={cn(
        'auth-screen grid min-h-dvh content-center justify-items-center px-5 py-12',
        'dark',
        authBackground,
      )}
    >
      <form
        className="auth-form grid min-w-0 w-full max-w-[420px] gap-5 rounded-2xl border border-white/8 bg-card/60 p-7 shadow-2xl sm:p-9"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="mb-2 grid gap-3 text-left">
          <RevealedImage src="/favicon.svg" alt="Wadi" className="mb-3 size-14" />
          <h1 className="m-0 text-[28px] font-medium leading-tight tracking-tight">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>

        <form.Field name="email">
          {(field) => (
            <div className="grid w-full justify-self-center gap-2">
              <Label htmlFor={field.name}>Email</Label>
              <Input
                className="h-11 rounded-lg border border-white/8 bg-background/70 px-3 text-base"
                id={field.name}
                type="email"
                autoComplete="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length ? true : undefined}
              />
              {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
            </div>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="grid w-full justify-self-center gap-2">
              <Label htmlFor={field.name}>Password</Label>
              <Input
                className="h-11 rounded-lg border border-white/8 bg-background/70 px-3 text-base"
                id={field.name}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length ? true : undefined}
              />
              {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
            </div>
          )}
        </form.Field>

        {mode === 'register' ? (
          <form.Field name="confirmPassword">
            {(field) => (
              <div className="grid w-full justify-self-center gap-2">
                <Label htmlFor={field.name}>Repeat password</Label>
                <Input
                className="h-11 rounded-lg border border-white/8 bg-background/70 px-3 text-base"
                  id={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length ? true : undefined}
                />
                {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
              </div>
            )}
          </form.Field>
        ) : null}

        {mutation.error ? <p className="min-w-0 w-full break-words text-sm text-destructive">{authError(mutation.error)}</p> : null}

        <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
          {(state) => (
            <Button className="mt-1 h-11 w-full justify-self-center rounded-lg font-medium" type="submit" disabled={!canSubmitForm(state, mutation.isPending)}>
              {mutation.isPending ? 'Working' : mode === 'login' ? 'Login' : 'Register'}
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </form.Subscribe>

        <Button
          className="w-full justify-self-center"
          variant="link"
          type="button"
          onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
        </Button>
      </form>
    </main>
  )
}

function authError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return 'Email or password is incorrect.'
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to continue.'
}

export function AuthPage(props: Parameters<typeof WebAuthPage>[0]) {
  return desktopBridge() ? <DesktopLogin /> : <WebAuthPage {...props} />
}
export function AuthShell({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return <main className={cn('auth-screen dark grid min-h-dvh content-center justify-items-center px-5 py-12', authBackground)}>
    <section className="grid min-w-0 w-full max-w-[420px] gap-5 rounded-2xl border border-white/8 bg-card/60 p-7 shadow-2xl sm:p-9">
      <div className="mb-2 grid gap-3 text-left">
        <RevealedImage src="/favicon.svg" alt="Wadi" className="mb-3 size-14" />
        <h1 className="m-0 text-[28px] font-medium leading-tight tracking-tight">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {children}
    </section>
  </main>
}
function DesktopLogin() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef(0)
  const connect = async () => {
    const current = ++attempt.current
    setBusy(true); setError('')
    try { if (await desktopBridge()?.signIn()) useAppStore.getState().setToken('desktop-session') }
    catch { if (current === attempt.current) setError('Could not finish signing in. Please try again to open a fresh connection in your browser.') }
    finally { if (current === attempt.current) setBusy(false) }
  }
  return <AuthShell title="Welcome to Wadi" body="Your films, shows, and saved moments. Sign in through your browser to bring them here.">
    <Button className="h-11 w-full rounded-lg" onClick={() => void connect()}>{busy ? 'Restart sign-in' : error ? 'Try again' : 'Sign in with Wadi'}<ArrowRight aria-hidden="true" /></Button>
    {busy && <p role="status" className="text-sm text-muted-foreground">Waiting for your browser. If the connection expired or the tab closed, restart sign-in above.</p>}
    {error && <p role="alert" className="min-w-0 break-words text-sm text-destructive">{error}</p>}
  </AuthShell>
}
