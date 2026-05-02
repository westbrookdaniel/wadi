import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ApiListResponse, ListItem, MediaPreview, UserList } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WatchlistAddButton } from './watchlist-add-button'

const openDialogMock = vi.hoisted(() => vi.fn())
const apiRequestMock = vi.fn()

vi.mock('@/components/dialogs', () => ({
  useDialogManager: () => ({
    openDialog: openDialogMock,
  }),
}))

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

function renderButton(media: MediaPreview) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WatchlistAddButton media={media} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('WatchlistAddButton', () => {
  it('creates a new list via global dialog and adds the selected media', async () => {
    const user = userEvent.setup()
    openDialogMock.mockResolvedValue({ action: 'confirm', name: 'Queue Picks' })

    const lists: ApiListResponse<UserList> = {
      items: [
        {
          id: 'saved-list',
          name: 'Saved',
          is_default: true,
          description: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'list-1',
          name: 'Sci-Fi',
          is_default: false,
          description: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    }

    const emptyItems: ApiListResponse<ListItem> = { items: [] }

    apiRequestMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/api/lists' && !options?.method) return Promise.resolve(lists)
      if (path === '/api/lists/saved-list/items') return Promise.resolve(emptyItems)
      if (path === '/api/lists/list-1/items') return Promise.resolve(emptyItems)
      if (path === '/api/lists' && options?.method === 'POST') {
        return Promise.resolve({
          id: 'list-new',
          name: 'Queue Picks',
          is_default: false,
          description: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        })
      }
      if (path === '/api/lists/list-new/items' && options?.method === 'POST') {
        return Promise.resolve({ id: 'new-item' })
      }
      return Promise.resolve({ items: [] })
    })

    renderButton({ id: 'tt123', type: 'movie', name: 'Arrival', raw: { id: 'tt123', type: 'movie' } })

    await user.click(await screen.findByRole('combobox', { name: 'Add to watchlist' }))
    await user.click(await screen.findByRole('option', { name: 'New list' }))

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledWith('watchlistCreate', {})
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/lists',
        expect.objectContaining({ method: 'POST', body: { name: 'Queue Picks', description: null } }),
      )
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/lists/list-new/items',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
