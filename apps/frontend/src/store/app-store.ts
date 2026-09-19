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

const readStoredToken = () => {
  if (typeof window === 'undefined') {
    return null
  }

  return desktopBridge() ? null : window.localStorage.getItem(TOKEN_KEY)
}

export const useAppStore = create<AppStore>((set, get) => ({
  authRevision: 0,
  token: readStoredToken(),
  activeProfileId: typeof window === 'undefined' ? null : window.localStorage.getItem(PROFILE_KEY),
  selectedListId: null,
  setToken: (token) => {
    if (desktopBridge()) {
      window.localStorage.removeItem(TOKEN_KEY)
    } else if (token) {
      window.localStorage.setItem(TOKEN_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_KEY)
      window.localStorage.removeItem(PROFILE_KEY)
    }

    if (!token) {
      window.localStorage.removeItem(PROFILE_KEY)
      window.sessionStorage.removeItem("wadi.profile.selected_token")
    }
    set({ ...(token ? { token } : { token: null, activeProfileId: null, selectedListId: null }), authRevision: get().authRevision + 1 })
  },
  setActiveProfileId: (activeProfileId) => {
    if (activeProfileId) {
      window.localStorage.setItem(PROFILE_KEY, activeProfileId)
    } else {
      window.localStorage.removeItem(PROFILE_KEY)
    }
    set({ activeProfileId })
  },
  setSelectedListId: (selectedListId) => set({ selectedListId }),
}))

export function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(PROFILE_KEY)
  useAppStore.setState({ token: null, activeProfileId: null })
}
