import { useState } from 'react'
import { useRouter } from 'next/router'
import { z } from 'zod'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { AuthPage, AuthShell } from '@/features/auth/auth-pages'
import { useAppStore } from '@/store/app-store'
import { apiRequest } from '@/api/client'
const params = z.object({ challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), state: z.string().regex(/^[A-Za-z0-9_-]{43}$/), port: z.coerce.number().int().min(1024).max(65535) })
function Connect() {
  const router = useRouter()
  const token = useAppStore(state => state.token)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!router.isReady) return null
  const input = params.safeParse(router.query)
  if (!input.success) return <AuthShell title="Connect Wadi desktop" body="This connection link is missing or invalid."><p className="text-sm text-muted-foreground">Return to Wadi desktop and choose Sign in or Restart sign-in to open a fresh link.</p></AuthShell>
  if (!token) return <AuthPage mode={mode} onModeChange={setMode} />
  const authorize = async () => {
    setBusy(true)
    setError('')
    try {
      const { code } = z.object({ code: z.string() }).parse(await apiRequest('/api/auth/desktop/authorize', { method: 'POST', body: { challenge: input.data.challenge } }))
      const callback = new URL(`http://127.0.0.1:${input.data.port}/callback`)
      callback.searchParams.set('code', code)
      callback.searchParams.set('state', input.data.state)
      window.location.assign(callback.href)
    } catch { setError('Wadi could not connect right now. Try again, or restart sign-in from the desktop app for a fresh link.'); setBusy(false) }
  }
  return <AuthShell title="Connect Wadi desktop" body="Bring your library, profiles, and saved moments to the desktop app you just opened.">
    <Button className="h-11 w-full rounded-lg" disabled={busy} onClick={() => void authorize()}>{busy ? 'Connecting…' : error ? 'Try again' : 'Connect desktop app'}</Button>
    {error && <p role="alert" className="min-w-0 break-words text-sm text-destructive">{error}</p>}
    <p className="text-xs leading-relaxed text-muted-foreground">Only continue if you started this request in Wadi desktop.</p>
  </AuthShell>
}
export default function DesktopConnect() {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}><Connect /></QueryClientProvider>
}
