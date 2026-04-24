import { create } from 'zustand'

import type { Page } from '@/api/types'

const TOKEN_KEY = 'wadi.auth.token'
const pages = new Set<Page>(['home', 'search', 'watchlists', 'movies', 'series', 'settings'])

type AppStore = {
  token: string | null
  activePage: Page
  selectedListId: string | null
  setToken: (token: string | null) => void
  setActivePage: (page: Page) => void
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
  activePage: readInitialPage(),
  selectedListId: null,
  setToken: (token) => {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_KEY)
    }

    set({ token })
  },
  setActivePage: (activePage) => set({ activePage }),
  setSelectedListId: (selectedListId) => set({ selectedListId }),
}))

export function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_KEY)
  useAppStore.setState({ token: null })
}

function readInitialPage(): Page {
  if (typeof window === 'undefined') {
    return 'home'
  }

  const segment = window.location.pathname.replace(/^\//, '')
  return pages.has(segment as Page) ? (segment as Page) : 'home'
}
