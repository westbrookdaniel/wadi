import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSubtitleTrack } from './use-subtitle-track'
vi.mock('../stream-playback', () => ({ buildSubtitleProxyUrl: async (url: string) => url }))
afterEach(() => vi.unstubAllGlobals())
const subtitle = (text: string) => ({ ok: true, text: async () => `1\n00:00:00,000 --> 00:02:00,000\n${text}\n` })
it('changes language, clears old captions immediately, rejects late responses and handles off/on', async () => {
  let old!: (value: unknown) => void
  const fetcher = vi.fn().mockResolvedValueOnce(subtitle('English')).mockImplementationOnce(() => new Promise(resolve => { old = resolve })).mockResolvedValue(subtitle('Spanish'))
  vi.stubGlobal('fetch', fetcher)
  const view = renderHook(({ url }) => useSubtitleTrack(url), { initialProps: { url: 'english' as string | undefined } })
  await waitFor(() => expect(view.result.current.cues[0]?.text).toBe('English'))
  view.rerender({ url: 'delayed' })
  expect(view.result.current.cues).toEqual([])
  await waitFor(() => expect(old).toBeDefined())
  view.rerender({ url: 'spanish' })
  await waitFor(() => expect(view.result.current.cues[0]?.text).toBe('Spanish'))
  await act(async () => old(subtitle('Stale')))
  expect(view.result.current.cues[0]?.text).toBe('Spanish')
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true)
  view.rerender({ url: undefined }); expect(view.result.current.cues).toEqual([])
  view.rerender({ url: 'english' })
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4))
})
it('exposes load failures without exposing private URLs', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private URL should never be shown')))
  const view = renderHook(() => useSubtitleTrack('https://example.invalid/caption?token=synthetic'))
  await waitFor(() => expect(view.result.current.error).toContain('Could not load subtitles'))
  expect(view.result.current.error).not.toContain('token')
})
