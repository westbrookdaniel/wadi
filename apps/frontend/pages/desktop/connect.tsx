import { useState } from 'react'
import { useRouter } from 'next/router'
import { z } from 'zod'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthPage } from '@/features/auth/auth-pages'
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
  if (!input.success) return <main className="p-12">Open sign-in from the Wadi desktop app.</main>
  if (!token) return <AuthPage mode={mode} onModeChange={setMode} />
  const authorize = async () => {
    setBusy(true)
    try {
      const { code } = z.object({ code: z.string() }).parse(await apiRequest('/api/auth/desktop/authorize', { method: 'POST', body: { challenge: input.data.challenge } }))
      const callback = new URL(`http://127.0.0.1:${input.data.port}/callback`)
      callback.searchParams.set('code', code)
      callback.searchParams.set('state', input.data.state)
      window.location.assign(callback.href)
    } catch { setError('Could not connect. Return to the desktop app and try again.'); setBusy(false) }
  }
  return <main className="grid min-h-screen place-content-center gap-5 p-8"><h1 className="text-2xl">Connect Wadi desktop</h1><p>Allow the desktop app you just opened to use your account.</p><button className="rounded-lg bg-white px-5 py-3 text-black" disabled={busy} onClick={() => void authorize()}>{busy ? 'Connecting…' : 'Connect desktop app'}</button><p role="alert">{error}</p></main>
}
export default function DesktopConnect() {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}><Connect /></QueryClientProvider>
}
