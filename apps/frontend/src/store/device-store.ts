import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Device preferences intentionally never sync to a profile or another browser.
export const useDeviceStore = create(persist<{
  askForProfile: boolean
  setAskForProfile: (enabled: boolean) => void
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  conversionEnabled: boolean
  setConversionEnabled: (enabled: boolean) => void
  tvMode: boolean
  setTvMode: (enabled: boolean) => void
}>((set) => ({
  askForProfile: false,
  setAskForProfile: (askForProfile) => set({ askForProfile }),
  theme: 'system',
  setTheme: (theme) => set({ theme }),
  conversionEnabled: true,
  setConversionEnabled: (conversionEnabled) => set({ conversionEnabled }),
  tvMode: false,
  setTvMode: (tvMode) => set({ tvMode }),
}), { name: 'wadi.device' }))
