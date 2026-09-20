import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DesktopUpdate } from '@/lib/desktop'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DesktopUpdateControl } from './desktop-update'
afterEach(() => { delete window.wadiDesktop })
it('hides idle state, offers a download only after an available update', async () => {
  let notify: (state: DesktopUpdate) => void = () => {}
  const downloadUpdate = vi.fn(async () => {})
  const checkUpdates = vi.fn(async (): Promise<DesktopUpdate> => ({ kind: 'idle' }))
  const unsubscribe = vi.fn()
  window.wadiDesktop = {
    getStartFullscreen: async () => false, setStartFullscreen: async value => value, onStartFullscreenChanged: () => () => {}, appVersion: async () => '0.1.0', updateState: async () => ({ kind: 'idle' }), onUpdate: callback => { notify = callback; return unsubscribe }, downloadUpdate, checkUpdates,
    onOpenSettings: () => () => {}, openPage: async () => {}, session: async () => true, signIn: async () => true,
    request: async () => ({ status: 200, body: null }), media: async () => null, openExternal: async () => {},
  }
  const view = render(<TooltipProvider><DesktopUpdateControl /></TooltipProvider>)
  expect(screen.queryByRole('button')).toBeNull()
  act(() => notify({ kind: 'available', version: '0.2.0' }))
  expect(downloadUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Download update: Version 0.2.0/ }))
  await waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce())
  act(() => notify({ kind: 'error', message: 'Try again.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Retry update: Try again.' }))
  await waitFor(() => expect(checkUpdates).toHaveBeenCalledOnce())
  view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce()
})
