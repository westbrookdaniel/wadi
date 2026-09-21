import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useTvPageState } from './use-tv-page-state'
import { useDeviceStore } from '@/store/device-store'
import { useAppStore } from '@/store/app-store'
afterEach(() => { cleanup(); useDeviceStore.setState({ tvMode: false }); useAppStore.setState({ activeProfileId: null }) })
it('restores TV browsing state after unmount without leaking it to another profile or desktop mode', () => {
  useDeviceStore.setState({ tvMode: true })
  useAppStore.setState({ activeProfileId: 'tv-state-a' })
  const first = renderHook(() => useTvPageState('query-test', ''))
  act(() => first.result.current[1]('coast'))
  first.unmount()
  const second = renderHook(() => useTvPageState('query-test', ''))
  expect(second.result.current[0]).toBe('coast')
  act(() => useAppStore.setState({ activeProfileId: 'tv-state-b' }))
  expect(second.result.current[0]).toBe('')
  act(() => useAppStore.setState({ activeProfileId: 'tv-state-a' }))
  expect(second.result.current[0]).toBe('coast')
  act(() => useDeviceStore.setState({ tvMode: false }))
  expect(second.result.current[0]).toBe('')
})
