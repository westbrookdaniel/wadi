import { desktopBridge } from '@/lib/desktop'
import { create } from 'zustand'

const TOKEN_KEY = 'wadi.auth.token'
const PROFILE_KEY = 'wadi.auth.profile_id'

type AppStore = {
  authRevision: number
  token: string | null
  activeProfileId: string | null
  selectedListId: string | null
  setToken: (token: string | null) => void
  setActiveProfileId: (profileId: string | null) => void
  setSelectedListId: (listId: string | null) => void
}

function readStored(key: string) {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function persist(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch { /* Keep the current session usable when storage is blocked. */ }
}

export const useAppStore = create<AppStore>((set, get) => ({
  authRevision: 0,
  token: desktopBridge() ? null : readStored(TOKEN_KEY),
  activeProfileId: readStored(PROFILE_KEY),
  selectedListId: null,
  setToken: (token) => {
    persist(TOKEN_KEY, desktopBridge() ? null : token)
    if (!token) {
      persist(PROFILE_KEY, null)
      try { window.sessionStorage.removeItem("wadi.profile.selected_token") } catch { /* Storage may be blocked. */ }
    }
    set({ ...(token ? { token } : { token: null, activeProfileId: null, selectedListId: null }), authRevision: get().authRevision + 1 })
  },
  setActiveProfileId: (activeProfileId) => {
    persist(PROFILE_KEY, activeProfileId)
    set({ activeProfileId })
  },
  setSelectedListId: (selectedListId) => set({ selectedListId }),
}))

export function clearStoredToken() {
  useAppStore.getState().setToken(null)
}
