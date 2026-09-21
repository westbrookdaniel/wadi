import { useState, type SetStateAction } from 'react'
import { create } from 'zustand'
import { useAppStore } from '@/store/app-store'
import { useDeviceStore } from '@/store/device-store'

// In-memory, profile-scoped browsing state. Never persists search text to disk.
const useBrowseMemory = create<{ values: Record<string, unknown>; save: (key: string, value: unknown) => void }>(set => ({
  values: {},
  save: (key, value) => set(state => ({ values: Object.fromEntries([...Object.entries(state.values).filter(([entry]) => entry !== key).slice(-127), [key, value]]) })),
}))

export function useTvPageState<T>(name: string, initial: T): [T, (next: SetStateAction<T>) => void] {
  const tvMode = useDeviceStore(state => state.tvMode)
  const profile = useAppStore(state => state.activeProfileId)
  const key = `${profile ?? 'guest'}:${name}`
  const remembered = useBrowseMemory(state => state.values[key]) as T | undefined
  const [local, setLocal] = useState(initial)
  const value = tvMode ? remembered ?? initial : local
  return [value, next => {
    if (tvMode) {
      const previous = (useBrowseMemory.getState().values[key] as T | undefined) ?? initial
      const result = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next
      useBrowseMemory.getState().save(key, result)
    } else setLocal(next)
  }]
}
