import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useExternalLaunch } from './use-external-launch'
const stream = { url: 'https://example.test/movie' }
it('clears old messages on player change and ignores the previous launch finishing late', async () => {
  const { result } = renderHook(useExternalLaunch)
  let reject!: (error: Error) => void
  act(() => result.current.setFailure({ stream, message: 'VLC could not open' }))
  act(() => result.current.clearMessage())
  expect(result.current.failure?.message).toBe('')
  act(() => result.current.launch(stream, () => new Promise((_resolve, fail) => { reject = fail }), true))
  act(() => result.current.clearMessage())
  await act(async () => reject(new Error('Old player failed')))
  expect(result.current.failure?.message).toBe('')
  act(() => result.current.launch(stream, () => Promise.reject(new Error('IINA failed')), true))
  await waitFor(() => expect(result.current.failure?.message).toBe('IINA failed'))
  act(() => result.current.launch(stream, () => Promise.resolve(), true))
  expect(result.current.failure?.message).toBe('')
  await waitFor(() => expect(result.current.failure).toBeNull())
})
