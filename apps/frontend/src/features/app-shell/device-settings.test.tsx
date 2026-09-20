import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { DesktopBridge } from '@/lib/desktop'
import { DeviceSettings } from './device-settings'

afterEach(() => { cleanup(); delete window.wadiDesktop })

function installDesktop(initial = false) {
  let saved = initial
  let notify: (value: boolean) => void = () => {}
  const unsubscribe = vi.fn()
  const setStartFullscreen = vi.fn(async (value: boolean) => { saved = value; notify(value); return value })
  window.wadiDesktop = {
    appVersion: async () => '0.1.4',
    getStartFullscreen: async () => saved,
    setStartFullscreen,
    onStartFullscreenChanged: callback => { notify = callback; return unsubscribe },
    updateState: async () => ({ kind: 'idle' }),
    checkUpdates: async () => ({ kind: 'idle' }),
    downloadUpdate: async () => {},
    onUpdate: () => () => {},
    onOpenSettings: () => () => {},
    openPage: async () => {},
    session: async () => true,
    signIn: async () => true,
    request: async () => ({ status: 200, body: null }),
    media: async () => null,
    openExternal: async () => {},
  } satisfies DesktopBridge
  return { setStartFullscreen, unsubscribe, notify: (value: boolean) => notify(value) }
}

it('keeps desktop startup settings out of the web interface', () => {
  render(<DeviceSettings />)
  expect(screen.queryByRole('checkbox', { name: 'Always start in fullscreen' })).toBeNull()
})

it('loads and saves the installation preference across settings remounts', async () => {
  const desktop = installDesktop(true)
  const user = userEvent.setup()
  const view = render(<DeviceSettings />)
  const checkbox = screen.getByRole('checkbox', { name: 'Always start in fullscreen' })
  await waitFor(() => expect(checkbox).toBeChecked())
  await user.click(checkbox)
  await waitFor(() => expect(desktop.setStartFullscreen).toHaveBeenCalledWith(false))
  await waitFor(() => expect(checkbox).not.toBeChecked())
  view.unmount()
  expect(desktop.unsubscribe).toHaveBeenCalledOnce()
  render(<DeviceSettings />)
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Always start in fullscreen' })).toBeEnabled())
  expect(screen.getByRole('checkbox', { name: 'Always start in fullscreen' })).not.toBeChecked()
})

it('reflects native menu changes while settings is open', async () => {
  const desktop = installDesktop()
  render(<DeviceSettings />)
  const checkbox = screen.getByRole('checkbox', { name: 'Always start in fullscreen' })
  await waitFor(() => expect(checkbox).toBeEnabled())
  act(() => desktop.notify(true))
  expect(checkbox).toBeChecked()
})

it('keeps the saved value and allows retry when saving fails', async () => {
  const desktop = installDesktop()
  desktop.setStartFullscreen.mockRejectedValueOnce(new Error('Disk full'))
  const user = userEvent.setup()
  render(<DeviceSettings />)
  const checkbox = screen.getByRole('checkbox', { name: 'Always start in fullscreen' })
  await waitFor(() => expect(checkbox).toBeEnabled())
  await user.click(checkbox)
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
  expect(checkbox).not.toBeChecked()
  expect(checkbox).toBeEnabled()
  await user.click(checkbox)
  await waitFor(() => expect(checkbox).toBeChecked())
})
