import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AddonRecord } from '@/api/types'
import { ToastProvider } from '@/components/ui/toast'
import { SettingsPage } from './settings-page'

const openDialogMock = vi.hoisted(() => vi.fn())
const apiRequestMock = vi.fn()

vi.mock('@/components/dialogs', () => ({
  useDialogManager: () => ({
    openDialog: openDialogMock,
  }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => () => undefined,
  }
})

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
      <ToastProvider>
        <SettingsPage user={{ id: 'user-1', email: 'dev@example.com' }} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('SettingsPage dialog flows', () => {
  it('opens global addon configure dialog and saves returned config', async () => {
    const user = userEvent.setup()

    const addon: AddonRecord = {
      id: 'addon-1',
      source_url: 'https://example.com/manifest.json',
      transport: 'http',
      manifest: {
        id: 'addon.test',
        name: 'Test Addon',
        version: '1.0.0',
        description: 'Test addon',
        config: [{ key: 'token', type: 'text', required: true }],
      },
      config: { token: 'old-token' },
      installed_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    openDialogMock.mockResolvedValue({ action: 'save', config: { token: 'new-token' } })

    apiRequestMock.mockImplementation((path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/api/addons' && !options?.method) return Promise.resolve({ items: [addon] })
      if (path === '/api/catalogs' && !options?.method) return Promise.resolve({ items: [] })
      if (path === '/api/lists' && !options?.method) return Promise.resolve({ items: [] })
      if (path === '/api/settings/browse-layout' && !options?.method) {
        return Promise.resolve({
          pages: {
            home: { order: [], hidden: [] },
            movies: { order: [], hidden: [] },
            series: { order: [], hidden: [] },
          },
        })
      }
      if (path === '/api/settings/playback' && !options?.method) {
        return Promise.resolve({
          stream_action: 'external',
          external_player_template: 'vlc://{url}',
        })
      }
      if (path === '/api/addons/addon-1/configure' && options?.method === 'POST') {
        return Promise.resolve({ ...addon, config: options.body })
      }
      return Promise.resolve({ items: [] })
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Configure addon' }))

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledWith('addonConfigure', { addon })
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/addons/addon-1/configure',
        expect.objectContaining({ method: 'POST', body: { token: 'new-token' } }),
      )
    })
  })
})
