import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApiListResponse, ApiResponses, CatalogEntry, MediaPreview } from '@/api/types'

import { SearchPage } from './search-page'

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

function renderSearchPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SearchPage onOpenMedia={() => {}} />
    </QueryClientProvider>,
  )
}

function catalogEntry(id: string): CatalogEntry {
  return {
    addon_id: `addon-${id}`,
    addon_name: `Addon ${id}`,
    catalog: {
      type: 'movie',
      id,
      extra: [{ name: 'search' }],
    },
  }
}

function media(name: string, id: string): MediaPreview {
  return { id, type: 'movie', name, raw: {} }
}

afterEach(() => {
  apiRequestMock.mockReset()
})

describe('SearchPage fuzzy ranking', () => {
  it('re-ranks merged catalog results by fuzzy relevance', async () => {
    const catalogs: ApiListResponse<CatalogEntry> = { items: [catalogEntry('a'), catalogEntry('b')] }
    const catalogA: ApiResponses<{ metas?: unknown[] }> = {
      responses: [{ addon_id: 'addon-a', response: { metas: [media('Zoolander', 'z1')] } }],
    }
    const catalogB: ApiResponses<{ metas?: unknown[] }> = {
      responses: [{ addon_id: 'addon-b', response: { metas: [media('Interstellar', 'i1')] } }],
    }

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/catalogs') return Promise.resolve(catalogs)
      if (path.includes('/api/catalog/movie/a')) return Promise.resolve(catalogA)
      if (path.includes('/api/catalog/movie/b')) return Promise.resolve(catalogB)
      return Promise.resolve({ responses: [] })
    })

    renderSearchPage()
    await userEvent.type(screen.getByPlaceholderText('Search'), 'interstllr')

    await waitFor(() => {
      const titles = screen.getAllByRole('heading', { level: 3 })
      expect(titles[0]).toHaveTextContent('Interstellar')
      expect(screen.queryByText('No results found')).not.toBeInTheDocument()
    })
  })

  it('keeps unmatched results visible after matched results', async () => {
    const catalogs: ApiListResponse<CatalogEntry> = { items: [catalogEntry('a')] }
    const catalogA: ApiResponses<{ metas?: unknown[] }> = {
      responses: [{ addon_id: 'addon-a', response: { metas: [media('Interstellar', 'i1')] } }],
    }

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/catalogs') return Promise.resolve(catalogs)
      if (path.includes('/api/catalog/movie/a')) return Promise.resolve(catalogA)
      return Promise.resolve({ responses: [] })
    })

    renderSearchPage()
    await userEvent.type(screen.getByPlaceholderText('Search'), 'zzzzzzzz')

    await waitFor(() => {
      expect(screen.getByText('Interstellar')).toBeInTheDocument()
      expect(screen.queryByText('No results found')).not.toBeInTheDocument()
    })
  })

  it('preserves loading and error states', async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/catalogs') return Promise.reject(new Error('network error'))
      return Promise.resolve({ responses: [] })
    })

    renderSearchPage()

    expect(screen.getByLabelText('Loading searchable catalogs')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Unable to continue')).toBeInTheDocument()
      expect(screen.getByText('network error')).toBeInTheDocument()
    })
  })
})
