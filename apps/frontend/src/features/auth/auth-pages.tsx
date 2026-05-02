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

export function AuthPage({ mode, onModeChange }: { mode: AuthMode; onModeChange: (mode: AuthMode) => void }) {
  const queryClient = useQueryClient()
  const setToken = useAppStore((state) => state.setToken)
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId)

  const mutation = useMutation({
    mutationFn: (value: z.infer<typeof authSchema>) =>
      mode === 'login' ? login(value.email, value.password) : register(value.email, value.password),
    onSuccess: async (data) => {
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
      onSubmit: authSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  })

  const title = mode === 'login' ? 'Welcome back' : 'Create account'
  const body =
    mode === 'login'
      ? 'Sign in to browse your addons, lists, movies, and series.'
      : 'Create a Wadi account to start building your media library.'

  return (
    <main
      className={cn(
        'grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]',
        'dark',
        authBackground,
      )}
    >
      <div className="text-sm font-bold uppercase leading-none text-muted-foreground">Wadi</div>
      <form
        className="grid w-[min(640px,100%)] gap-7 border-0 bg-transparent p-0 shadow-none"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="grid gap-4 text-center">
          <h1 className="m-0 text-[clamp(2rem,4vw,3.25rem)] leading-[0.95] tracking-normal">{title}</h1>
          <p className="w-[min(560px,100%)] justify-self-center text-[clamp(1rem,1.5vw,1.18rem)] text-muted-foreground">{body}</p>
        </div>

        <form.Field name="email">
          {(field) => (
            <div className="grid w-[min(420px,100%)] justify-self-center gap-2">
              <Label htmlFor={field.name}>Email</Label>
              <Input
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
            <div className="grid w-[min(420px,100%)] justify-self-center gap-2">
              <Label htmlFor={field.name}>Password</Label>
              <Input
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
              <div className="grid w-[min(420px,100%)] justify-self-center gap-2">
                <Label htmlFor={field.name}>Repeat password</Label>
                <Input
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

        {mutation.error ? <p className="w-[min(420px,100%)] justify-self-center text-destructive">{authError(mutation.error)}</p> : null}

        <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
          {(state) => (
            <Button className="w-[min(420px,100%)] justify-self-center" type="submit" disabled={!canSubmitForm(state, mutation.isPending)}>
              {mutation.isPending ? 'Working' : mode === 'login' ? 'Login' : 'Register'}
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </form.Subscribe>

        <Button
          className="w-[min(420px,100%)] justify-self-center"
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
