import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Device preferences intentionally never sync to a profile or another browser.
export const useDeviceStore = create(persist<{
  tvMode: boolean
  conversion: boolean
  setTvMode: (enabled: boolean) => void
  setConversion: (enabled: boolean) => void
}>((set) => ({
  tvMode: false,
  conversion: false,
  setTvMode: (tvMode) => set({ tvMode }),
  setConversion: (conversion) => set({ conversion }),
}), { name: 'wadi.device' }))
