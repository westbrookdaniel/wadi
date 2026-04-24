import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { login, queryKeys, register } from '@/api/queries'
import { ApiError } from '@/api/client'
import { appBackground, inputClass, labelClass, primaryButton, textButton } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

type AuthMode = 'login' | 'register'

export function AuthPage({ mode, onModeChange }: { mode: AuthMode; onModeChange: (mode: AuthMode) => void }) {
  const queryClient = useQueryClient()
  const setToken = useAppStore((state) => state.setToken)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => (mode === 'login' ? login(email, password) : register(email, password)),
    onSuccess: async (data) => {
      setToken(data.token)
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (mode === 'register' && password !== confirmPassword) {
      setValidationError('Passwords do not match.')
      return
    }

    setValidationError(null)
    mutation.mutate()
  }

  const title = mode === 'login' ? 'Welcome back' : 'Create account'
  const body =
    mode === 'login'
      ? 'Sign in to browse your addons, lists, movies, and series.'
      : 'Create a Wadi account to start building your media library.'

  return (
    <main
      className={cn(
        'grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]',
        appBackground,
      )}
    >
      <div className="text-sm font-bold uppercase leading-none text-[hsl(240_6%_58%)]">Wadi</div>
      <form className="grid w-[min(640px,100%)] gap-7 border-0 bg-transparent p-0 shadow-none" onSubmit={onSubmit}>
        <div className="grid gap-4 text-center">
          <h1 className="m-0 text-[clamp(2rem,4vw,3.25rem)] leading-[0.95] tracking-normal">{title}</h1>
          <p className="w-[min(560px,100%)] justify-self-center text-[clamp(1rem,1.5vw,1.18rem)] text-[hsl(240_6%_66%)]">{body}</p>
        </div>

        <label className={cn(labelClass, 'w-[min(420px,100%)] justify-self-center')}>
          Email
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className={cn(labelClass, 'w-[min(420px,100%)] justify-self-center')}>
          Password
          <input
            className={inputClass}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>

        {mode === 'register' ? (
          <label className={cn(labelClass, 'w-[min(420px,100%)] justify-self-center')}>
            Repeat password
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                if (validationError) {
                  setValidationError(null)
                }
              }}
              minLength={8}
              required
            />
          </label>
        ) : null}

        {validationError ? <p className="w-[min(420px,100%)] justify-self-center text-[hsl(0_88%_76%)]">{validationError}</p> : null}
        {mutation.error ? <p className="w-[min(420px,100%)] justify-self-center text-[hsl(0_88%_76%)]">{authError(mutation.error)}</p> : null}

        <button className={cn(primaryButton, 'w-[min(420px,100%)] justify-self-center')} type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Working' : mode === 'login' ? 'Login' : 'Register'}
          <ArrowRight aria-hidden="true" />
        </button>

        <button
          className={cn(textButton, 'w-[min(420px,100%)] justify-self-center')}
          type="button"
          onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
        </button>
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
