import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from './app-store'
import { defaultAutoPlayback, useAutoPlayback } from './auto-playback'
import { usePlaybackDefaults } from './use-playback-defaults'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ apiRequest: request }))
afterEach(() => { useAppStore.setState({ activeProfileId: null }); useAutoPlayback.getState().reset(); request.mockReset() })

it('loads separate profile defaults without leaking cached values and ignores late saves from a different profile', async () => {
  useAppStore.setState({ activeProfileId: 'alice' })
  const aliceSave = Promise.withResolvers<unknown>()
  const bobFetch = Promise.withResolvers<unknown>()
  request.mockImplementation((path: string, options: { method?: string }) => {
    if (options.method === 'PUT') return aliceSave.promise
    return path.includes('/alice/') ? { settings: { ...defaultAutoPlayback, preferredResolution: 720 } } : bobFetch.promise
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const hook = renderHook(() => usePlaybackDefaults(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  await waitFor(() => expect(hook.result.current.settings.preferredResolution).toBe(720))
  act(() => hook.result.current.save.mutate({ ...defaultAutoPlayback, preferredResolution: 480 }))
  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/profiles/alice/playback-settings', expect.objectContaining({ method: 'PUT' })))
  act(() => useAppStore.setState({ activeProfileId: 'bob' }))
  expect(hook.result.current.ready).toBe(false)
  expect(hook.result.current.settings.preferredResolution).toBe(1080)
  await act(async () => aliceSave.resolve({ settings: { ...defaultAutoPlayback, preferredResolution: 480 } }))
  expect(hook.result.current.ready).toBe(false)
  expect(hook.result.current.settings.preferredResolution).toBe(1080)
  await act(async () => bobFetch.resolve({ settings: { ...defaultAutoPlayback, preferredResolution: 2160 } }))
  await waitFor(() => expect(hook.result.current.settings.preferredResolution).toBe(2160))
  expect(hook.result.current.settings.preferredResolution).not.toBe(480)
  hook.unmount(); client.clear()
})

it('inherits existing device settings until explicit profile save and supports clearing the override', async () => {
  useAppStore.setState({ activeProfileId: 'alice' })
  useAutoPlayback.getState().update({ preferredResolution: 720 })
  request.mockImplementation((_path: string, options: { method?: string; body?: unknown }) => ({ settings: options.method === 'PUT' ? options.body : null }))
  const client = new QueryClient()
  const hook = renderHook(() => usePlaybackDefaults(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  await waitFor(() => expect(hook.result.current.ready).toBe(true))
  expect(hook.result.current.settings.preferredResolution).toBe(720)
  await act(async () => hook.result.current.save.mutateAsync({ ...defaultAutoPlayback, preferredResolution: 2160 }))
  await waitFor(() => expect(hook.result.current.settings.preferredResolution).toBe(2160))
  expect(useAutoPlayback.getState().settings.preferredResolution).toBe(720)
  await act(async () => hook.result.current.save.mutateAsync(null))
  await waitFor(() => expect(hook.result.current.settings.preferredResolution).toBe(720))
  hook.unmount(); client.clear()
})
