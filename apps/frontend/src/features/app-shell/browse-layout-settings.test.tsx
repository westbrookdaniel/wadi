import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApiListResponse, BrowseLayout, CatalogEntry, UserList } from '@/api/types'

import { BrowseLayoutSettings } from './browse-layout-settings'

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

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowseLayoutSettings />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  apiRequestMock.mockReset()
})

describe('BrowseLayoutSettings', () => {
  it('toggles row visibility and saves browse layout', async () => {
    const catalogs: ApiListResponse<CatalogEntry> = {
      items: [
        {
          addon_id: 'addon-1',
          addon_name: 'Addon 1',
          catalog: { type: 'movie', id: 'popular', name: 'Popular' },
        },
      ],
    }
    const lists: ApiListResponse<UserList> = {
      items: [
        {
          id: 'list-1',
          name: 'Saved',
          is_default: true,
          description: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }
    const layout: BrowseLayout = {
      pages: {
        home: { order: [], hidden: [] },
        movies: { order: [], hidden: [] },
        series: { order: [], hidden: [] },
      },
    }

    apiRequestMock.mockImplementation((path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/api/catalogs') return Promise.resolve(catalogs)
      if (path === '/api/lists') return Promise.resolve(lists)
      if (path === '/api/settings/browse-layout' && (!options || !options.method)) return Promise.resolve(layout)
      if (path === '/api/settings/browse-layout' && options?.method === 'PUT') return Promise.resolve(options.body)
      return Promise.resolve({ items: [] })
    })

    renderSettings()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hide Continue Watching' })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Hide Continue Watching' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save layout' }))

    await waitFor(() => {
      const putCall = apiRequestMock.mock.calls.find(
        (call) => call[0] === '/api/settings/browse-layout' && call[1]?.method === 'PUT',
      )
      expect(putCall).toBeTruthy()
      expect(putCall?.[1]?.body).toMatchObject({
        pages: {
          home: {
            hidden: ['continue_watching'],
          },
        },
      })
    })
  })
})
