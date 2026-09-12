import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApiListResponse, BrowseLayout, CatalogEntry, ContinueWatchingItem, UserList } from '@/api/types'

import { HomePage } from './home-page'

const apiRequestMock = vi.fn()

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

const emptyCatalogs: ApiListResponse<CatalogEntry> = { items: [] }
const emptyContinueWatching: ApiListResponse<ContinueWatchingItem> = { items: [] }
const emptyLists: ApiListResponse<UserList> = { items: [] }
const emptyBrowseLayout: BrowseLayout = {
  pages: {
    home: { order: [], hidden: [] },
  },
}

function renderHomePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <HomePage onOpenMedia={() => {}} onOpenSettings={() => {}} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  apiRequestMock.mockReset()
})

describe('HomePage loading and state transitions', () => {
  it('shows home skeleton instead of text loading label while queries are loading', () => {
    apiRequestMock.mockImplementation(() => new Promise(() => {}))

    renderHomePage()

    expect(screen.getByLabelText('Loading home page')).toBeInTheDocument()
    expect(screen.queryByText(/^Loading$/i)).not.toBeInTheDocument()
  })

  it('shows error state when a home query fails', async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/catalogs') return Promise.reject(new Error('catalogs failed'))
      if (path === '/api/continue-watching?limit=12') return Promise.resolve(emptyContinueWatching)
      if (path === '/api/lists') return Promise.resolve(emptyLists)
      if (path === '/api/settings/browse-layout') return Promise.resolve(emptyBrowseLayout)
      return Promise.resolve({ responses: [] })
    })

    renderHomePage()

    await waitFor(() => {
      expect(screen.getByText('Unable to continue')).toBeInTheDocument()
      expect(screen.getByText('catalogs failed')).toBeInTheDocument()
    })
  })

  it('shows setup empty state when loading completes without content', async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/catalogs') return Promise.resolve(emptyCatalogs)
      if (path === '/api/continue-watching?limit=12') return Promise.resolve(emptyContinueWatching)
      if (path === '/api/lists') return Promise.resolve(emptyLists)
      if (path === '/api/settings/browse-layout') return Promise.resolve(emptyBrowseLayout)
      return Promise.resolve({ responses: [] })
    })

    renderHomePage()

    await waitFor(() => {
      expect(screen.getByText('Go to Settings to add addons')).toBeInTheDocument()
    })
  })

  it('does not show loading skeleton when some data is already available', async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/catalogs') return Promise.resolve(emptyCatalogs)
      if (path === '/api/continue-watching?limit=12') return Promise.resolve(emptyContinueWatching)
      if (path === '/api/lists') return new Promise(() => {})
      if (path === '/api/settings/browse-layout') return Promise.resolve(emptyBrowseLayout)
      return Promise.resolve({ responses: [] })
    })

    renderHomePage()

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading home page')).not.toBeInTheDocument()
    })
  })
})
