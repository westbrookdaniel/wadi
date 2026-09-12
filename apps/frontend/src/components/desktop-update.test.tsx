import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DesktopUpdate } from '@/lib/desktop'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DesktopUpdateControl } from './desktop-update'
afterEach(() => { delete window.wadiDesktop })
it('hides idle state, shows progress, and only installs on a ready click', async () => {
  let notify: (state: DesktopUpdate) => void = () => {}
  const installUpdate = vi.fn(async () => {})
  const checkUpdates = vi.fn(async (): Promise<DesktopUpdate> => ({ kind: 'idle' }))
  const unsubscribe = vi.fn()
  window.wadiDesktop = {
    updateState: async () => ({ kind: 'idle' }), onUpdate: callback => { notify = callback; return unsubscribe }, installUpdate, checkUpdates,
    updatePlayback: async () => {}, onOpenSettings: () => () => {}, openPage: async () => {}, session: async () => true, signIn: async () => true,
    request: async () => ({ status: 200, body: null }), media: async () => null, openExternal: async () => {},
  }
  const view = render(<TooltipProvider><DesktopUpdateControl /></TooltipProvider>)
  expect(screen.queryByRole('button')).toBeNull()
  act(() => notify({ kind: 'downloading', version: '0.2.0', percent: 42 }))
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42')
  fireEvent.click(screen.getByRole('button')); expect(installUpdate).not.toHaveBeenCalled()
  act(() => notify({ kind: 'ready', version: '0.2.0' }))
  fireEvent.click(screen.getByRole('button', { name: 'Restart and update: Version 0.2.0' }))
  await waitFor(() => expect(installUpdate).toHaveBeenCalledOnce())
  act(() => notify({ kind: 'error', message: 'Try again.' }))
  fireEvent.click(screen.getByRole('button', { name: 'Retry update: Try again.' }))
  await waitFor(() => expect(checkUpdates).toHaveBeenCalledOnce())
  view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce()
})
