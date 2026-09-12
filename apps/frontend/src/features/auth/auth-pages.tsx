import { useRef, useState, useEffect, type ReactNode } from 'react'
import { desktopBridge } from '@/lib/desktop'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { ArrowRight } from 'lucide-react'
import { z } from 'zod'

import { login, queryKeys, register } from '@/api/queries'
import { ApiError, apiRequest } from '@/api/client'
import type { AuthResponse, VerificationRequired } from '@/api/types'
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
  const [pendingVerification, setPendingVerification] = useState<VerificationRequired | null>(null)
  const queryClient = useQueryClient()
  const setToken = useAppStore((state) => state.setToken)
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId)

  const mutation = useMutation({
    mutationFn: (value: z.infer<typeof authSchema>) =>
      mode === 'login' ? login(value.email, value.password) : register(value.email, value.password),
    onSuccess: async (data) => {
      if ('verification_required' in data) { setPendingVerification(data); return }
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

  if (pendingVerification) return <VerifyEmailForm key={pendingVerification.challenge} pending={pendingVerification} resend={() => mutation.mutate(form.state.values)} resending={mutation.isPending} resendError={mutation.error} back={() => { setPendingVerification(null); mutation.reset() }} onVerified={async data => {
    queryClient.clear(); setToken(data.token); setActiveProfileId(data.active_profile_id ?? data.user.active_profile_id)
    await queryClient.invalidateQueries({ queryKey: queryKeys.me })
  }} />

  const title = mode === 'login' ? 'Welcome back' : 'Create account'
  const body =
    mode === 'login'
      ? 'Your films, shows, and saved moments.'
      : 'Make a little room for everything you love to watch.'

  return (
    <main
      className={cn(
        'auth-screen grid min-h-dvh content-center justify-items-center px-5 py-12',
        authBackground,
      )}
    >
      <form
        className="auth-form grid min-w-0 w-full max-w-[420px] gap-5 rounded-2xl border border-border bg-card/60 p-7 shadow-2xl sm:p-9"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="mb-2 grid gap-3 text-left">
          <img src="/favicon.svg" alt="Wadi" className="mb-3 size-14" />
          <h1 className="m-0 text-[28px] font-medium leading-tight tracking-tight">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>

        <form.Field name="email">
          {(field) => (
            <div className="grid w-full justify-self-center gap-2">
              <Label htmlFor={field.name}>Email</Label>
              <Input
                className="h-11 rounded-lg border border-border bg-background/70 px-3 text-base"
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
                className="h-11 rounded-lg border border-border bg-background/70 px-3 text-base"
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
                className="h-11 rounded-lg border border-border bg-background/70 px-3 text-base"
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
        <p className="text-xs leading-relaxed text-muted-foreground">{mode === 'register' ? 'By creating an account, you agree to the ' : ''}<a href="/terms" className="underline underline-offset-4">Terms of service</a>{mode === 'register' ? '. Read our ' : ' · '}<a href="/privacy" className="underline underline-offset-4">Privacy policy</a>.</p>
      </form>
    </main>
  )
}

function VerifyEmailForm({ pending, resend, resending, resendError, back, onVerified }: { pending: VerificationRequired; resend: () => void; resending: boolean; resendError: unknown; back: () => void; onVerified: (data: AuthResponse) => Promise<void> }) {
  const [code, setCode] = useState('')
  const [remaining, setRemaining] = useState(60)
  useEffect(() => { const timer = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000); return () => clearInterval(timer) }, [])
  const verify = useMutation({ mutationFn: () => apiRequest<AuthResponse>('/api/auth/verify-email', { method: 'POST', body: { challenge: pending.challenge, code }, token: null }), onSuccess: onVerified })
  return <AuthShell title="Check your email" body={`Enter the 8-digit code sent to ${pending.email}. It expires in 15 minutes.`}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); verify.mutate() }}>
      <Label htmlFor="verification-code">Verification code</Label>
      <Input id="verification-code" autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className="h-12 border border-border bg-background text-center text-xl tracking-[0.35em]" />
      {(verify.error || resendError) ? <p role="alert" className="text-sm text-destructive">{authError(verify.error || resendError)}</p> : null}
      <Button type="submit" disabled={code.length !== 8 || verify.isPending}>{verify.isPending ? 'Verifying…' : 'Verify email'}</Button>
      <Button type="button" variant="ghost" disabled={remaining > 0 || resending} onClick={resend}>{resending ? 'Sending…' : remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}</Button>
      <Button type="button" variant="link" onClick={back}>Use a different email</Button>
    </form>
  </AuthShell>
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
export function AuthShell({ title, body, children, showLogo = true }: { title: string; body: string; children: ReactNode; showLogo?: boolean }) {
  return <main className={cn('auth-screen grid min-h-dvh content-center justify-items-center px-5 py-12', authBackground)}>
    <section className="grid min-w-0 w-full max-w-[420px] gap-5 rounded-2xl border border-border bg-card/60 p-7 shadow-2xl sm:p-9">
      <div className="mb-2 grid gap-3 text-left">
        {showLogo && <img src="/favicon.svg" alt="Wadi" className="mb-3 size-14" />}
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
    {busy ? <div className="grid gap-3">
      <Button className="h-11 w-full rounded-lg" disabled>Waiting for connection…</Button>
      <Button variant="ghost" size="sm" className="justify-self-center text-muted-foreground" onClick={() => void connect()}>Restart sign-in</Button>
    </div> : <Button className="h-11 w-full rounded-lg" onClick={() => void connect()}>{error ? 'Try again' : 'Sign in with Wadi'}<ArrowRight aria-hidden="true" /></Button>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Waiting for your browser. If the connection expired or the tab closed, choose Restart sign-in.</p>}
    {error && <p role="alert" className="min-w-0 break-words text-sm text-destructive">{error}</p>}
  </AuthShell>
}
