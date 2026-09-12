import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Device preferences intentionally never sync to a profile or another browser.
export const useDeviceStore = create(persist<{
  tvMode: boolean
  setTvMode: (enabled: boolean) => void
}>((set) => ({
  tvMode: false,
  setTvMode: (tvMode) => set({ tvMode }),
}), { name: 'wadi.device' }))
