import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApiListResponse, AddonRecord } from '@/api/types'

import { StreamList } from './stream-list'

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

function renderStreamList() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <StreamList
        isLoading={false}
        onPlay={() => {}}
        streams={[
          { addon_id: 'addon-a', title: 'Alpha One', url: 'https://first.example/stream-a' },
          { addon_id: 'addon-a', title: 'Alpha Two', url: 'https://second.example/stream-b' },
          { addon_id: 'addon-b', title: 'Beta One', url: 'https://third.example/stream-c' },
        ]}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  apiRequestMock.mockReset()
})

describe('StreamList source filtering', () => {
  it('groups and filters by addon source identity', async () => {
    const addons: ApiListResponse<AddonRecord> = {
      items: [
        {
          id: 'addon-a',
          source_url: 'https://alpha-addon.example',
          transport: 'http',
          manifest: { name: 'Alpha Source' },
          config: null,
          installed_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'addon-b',
          source_url: 'https://beta-addon.example',
          transport: 'http',
          manifest: { name: 'Beta Source' },
          config: null,
          installed_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ],
    }

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/addons') {
        return Promise.resolve(addons)
      }
      return Promise.resolve({})
    })

    renderStreamList()

    expect(screen.getByText('Showing 3 of 3 streams')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'Source filter' }))
    expect(
      await screen.findByRole('option', { name: /Alpha Source\s*\(2\)/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: /Beta Source\s*\(1\)/ }),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('option', { name: /Beta Source\s*\(1\)/ }),
    )

    await waitFor(() => {
      expect(screen.getByText('Showing 1 of 3 streams')).toBeInTheDocument()
    })
    expect(screen.getByText('Beta One')).toBeInTheDocument()
    expect(screen.queryByText('Alpha One')).not.toBeInTheDocument()
    expect(screen.queryByText('Alpha Two')).not.toBeInTheDocument()
  })
})
