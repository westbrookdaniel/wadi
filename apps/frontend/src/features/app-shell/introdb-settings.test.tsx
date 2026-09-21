import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { apiRequest } from '@/api/client'
import { useAppStore } from '@/store/app-store'
import { IntroDbSettings } from './introdb-settings'
vi.mock('@/api/client', () => ({ apiRequest: vi.fn() }))
afterEach(() => vi.resetAllMocks())
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><IntroDbSettings /></QueryClientProvider>)
  return { client, ...view }
}
it('shows the default-on preference, saves opt-out and removes cached timestamps', async () => {
  vi.mocked(apiRequest).mockImplementation(async (_path, options) => options?.method === 'PUT' ? options.body : { enabled: true })
  const user = userEvent.setup(), { client } = setup()
  const toggle = screen.getByRole('switch', { name: 'Show skip buttons' })
  await waitFor(() => expect(toggle).toBeEnabled())
  expect(toggle).toBeChecked()
  const key = ['skip-segments', useAppStore.getState().authRevision, 'episode']
  client.setQueryData(key, [{ type: 'intro', start: 1, end: 30 }])
  await user.click(toggle)
  await waitFor(() => expect(toggle).not.toBeChecked())
  expect(apiRequest).toHaveBeenCalledWith('/api/settings/introdb', { method: 'PUT', body: { enabled: false } })
  expect(client.getQueryData(key)).toBeUndefined()
  expect(screen.getByRole('status')).toHaveTextContent('Saved to your account.')
  await user.click(toggle)
  await waitFor(() => expect(toggle).toBeChecked())
})
it('shows a failed save without enabling the feature', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ enabled: false }).mockRejectedValueOnce(new Error('offline'))
  setup(); const toggle = screen.getByRole('switch')
  await waitFor(() => expect(toggle).toBeEnabled())
  await userEvent.click(toggle)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save'))
  expect(toggle).not.toBeChecked()
})
it('disables the toggle when loading account preferences fails', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('offline'))
  setup()
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not load'))
  expect(screen.getByRole('switch')).toBeDisabled()
  expect(screen.getByRole('switch')).not.toBeChecked()
})
