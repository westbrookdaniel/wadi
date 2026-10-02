import { createElement, type PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { queryKeys } from '@/api/queries'
import { usePlaybackResume } from './use-playback-resume'
import { savePlaybackPosition } from '../playback-session'
import type { WatchDataResponse } from '@/api/types'
const request = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ apiRequest: request, ApiError: Error }))
afterEach(() => { localStorage.clear(); vi.clearAllMocks() })
const target = { mediaType: 'movie', mediaId: 'film', videoId: null }
const data = (position: number, updatedAt: number): WatchDataResponse => ({ media_type: 'movie', media_id: 'film', items: [{ media_type: 'movie', media_id: 'film', video_id: null, watched: false, position_seconds: position, duration_seconds: 1000, updated_at: new Date(updatedAt).toISOString() }] })

it('waits for fresh server progress despite a fresh cache; background sync does not stop the decoder', async () => {
  const now = Date.now()
  savePlaybackPosition(target, 90, now - 20000)
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(queryKeys.watchData('movie', 'film'), data(90, now - 20000))
  const pending = Promise.withResolvers<WatchDataResponse>()
  request.mockReturnValue(pending.promise)
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children)
  const hook = renderHook(() => usePlaybackResume(target), { wrapper })
  expect(hook.result.current.ready).toBe(false)
  await act(async () => { pending.resolve(data(30, now - 10000)); await pending.promise })
  await waitFor(() => expect(hook.result.current.ready).toBe(true))
  expect(hook.result.current.savedPosition).toBe(30)
  const background = Promise.withResolvers<WatchDataResponse>()
  request.mockReturnValue(background.promise)
  act(() => { void client.invalidateQueries({ queryKey: queryKeys.watchData('movie', 'film') }) })
  expect(hook.result.current.ready).toBe(true)
  await act(async () => { background.resolve(data(35, now)); await background.promise })
  hook.unmount(); client.clear()
})
it('uses local progress after a failed fetch and preserves a recent unsynced rewind', async () => {
  savePlaybackPosition(target, 12)
  request.mockRejectedValue(new Error('offline'))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children)
  const hook = renderHook(() => usePlaybackResume(target), { wrapper })
  await waitFor(() => expect(hook.result.current.ready).toBe(true))
  expect(hook.result.current.savedPosition).toBe(12)
  hook.unmount(); client.clear()
})
