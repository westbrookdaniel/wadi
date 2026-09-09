import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ApiListResponse, ListItem, UserList } from '@/api/types'
import { useAppStore } from '@/store/app-store'
import { WatchlistsPage } from './watchlists-page'

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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <WatchlistsPage onOpenMedia={() => {}} />
    </QueryClientProvider>,
  )
}

describe('WatchlistsPage dialog flows', () => {
  it('opens global create-list dialog from selector and creates a list', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ selectedListId: null })
    openDialogMock.mockResolvedValue({ action: 'confirm', name: 'Weekend' })

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
      ],
    }
    const emptyItems: ApiListResponse<ListItem> = { items: [] }

    apiRequestMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/api/lists' && !options?.method) return Promise.resolve(lists)
      if (path === '/api/lists/saved-list/items') return Promise.resolve(emptyItems)
      if (path === '/api/lists' && options?.method === 'POST') {
        return Promise.resolve({
          id: 'list-weekend',
          name: 'Weekend',
          is_default: false,
          description: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        })
      }
      if (path === '/api/lists/list-weekend/items') return Promise.resolve(emptyItems)
      return Promise.resolve({ items: [] })
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'New list' }))

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledWith('watchlistCreate', {})
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/lists',
        expect.objectContaining({ method: 'POST', body: { name: 'Weekend', description: null } }),
      )
    })
  })
})
