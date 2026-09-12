import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Device preferences intentionally never sync to a profile or another browser.
export const useDeviceStore = create(persist<{
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  tvMode: boolean
  setTvMode: (enabled: boolean) => void
}>((set) => ({
  theme: 'system',
  setTheme: (theme) => set({ theme }),
  tvMode: false,
  setTvMode: (tvMode) => set({ tvMode }),
}), { name: 'wadi.device' }))
