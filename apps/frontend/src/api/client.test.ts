import { afterEach, expect, it, vi } from 'vitest'
import { apiRequest } from './client'
import { useAppStore } from '@/store/app-store'
afterEach(() => { vi.unstubAllGlobals(); useAppStore.getState().setToken(null) })
it('does not sign out a new session when an old request returns unauthorized', async () => {
  let finish: (response: Response) => void = () => { throw new Error('Request was not started') }
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  useAppStore.getState().setToken('old-session')
  const pending=apiRequest('/api/auth/me')
  useAppStore.getState().setToken('new-session')
  finish(new Response(JSON.stringify({error:'Session expired'}),{status:401}))
  await expect(pending).rejects.toThrow('Session expired')
  expect(useAppStore.getState().token).toBe('new-session')
})
it('retains login on network failure and clears it on current-session expiry', async () => {
  useAppStore.getState().setToken('session')
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')))
  await expect(apiRequest('/api/auth/me')).rejects.toThrow()
  expect(useAppStore.getState().token).toBe('session')
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:401})))
  await expect(apiRequest('/api/auth/me')).rejects.toThrow()
  expect(useAppStore.getState().token).toBeNull()
})
