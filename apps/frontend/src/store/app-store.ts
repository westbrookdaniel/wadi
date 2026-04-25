import { create } from 'zustand'

const TOKEN_KEY = 'wadi.auth.token'

type AppStore = {
  token: string | null
  selectedListId: string | null
  setToken: (token: string | null) => void
  setSelectedListId: (listId: string | null) => void
}

const readStoredToken = () => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(TOKEN_KEY)
}

export const useAppStore = create<AppStore>((set) => ({
  token: readStoredToken(),
  selectedListId: null,
  setToken: (token) => {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_KEY)
    }

    set({ token })
  },
  setSelectedListId: (selectedListId) => set({ selectedListId }),
}))

export function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_KEY)
  useAppStore.setState({ token: null })
}
