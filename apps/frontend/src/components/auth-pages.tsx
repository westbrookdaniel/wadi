import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { login, queryKeys, register } from '@/api/queries'
import { ApiError } from '@/api/client'
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
    <main className="auth-screen">
      <div className="auth-brand">Wadi</div>
      <form className="auth-panel" onSubmit={onSubmit}>
        <div className="auth-copy">
          <h1>{title}</h1>
          <p>{body}</p>
        </div>

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>

        {mode === 'register' ? (
          <label>
            Repeat password
            <input
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

        {validationError ? <p className="form-error">{validationError}</p> : null}
        {mutation.error ? <p className="form-error">{authError(mutation.error)}</p> : null}

        <button className="primary-button" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Working' : mode === 'login' ? 'Login' : 'Register'}
          <ArrowRight aria-hidden="true" />
        </button>

        <button
          className="text-button"
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
