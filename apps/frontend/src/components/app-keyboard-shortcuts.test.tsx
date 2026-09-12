import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppKeyboardShortcuts } from './app-keyboard-shortcuts'
import { ToastProvider } from './ui/toast'
import { useAppStore } from '@/store/app-store'
import { router } from '@/router'

vi.mock('@/router', () => ({ router: { navigate: vi.fn(async () => {}) } }))
afterEach(() => { useAppStore.getState().setToken(null); vi.restoreAllMocks(); vi.clearAllMocks() })

it('offers fullscreen, navigation and shortcut help while leaving input and modal keys alone', () => {
  useAppStore.getState().setToken('test-session')
  const fullscreen = vi.fn(async () => {})
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: fullscreen })
  const { unmount } = render(<ToastProvider><AppKeyboardShortcuts /></ToastProvider>)
  fireEvent.keyDown(document.body, { key: 'f', code: 'KeyF' })
  expect(fullscreen).toHaveBeenCalledOnce()
  fireEvent.keyDown(document.body, { key: '/', code: 'Slash' })
  expect(router.navigate).toHaveBeenCalledWith({ to: '/search' })
  fireEvent.keyDown(document.body, { key: ',', code: 'Comma', ctrlKey: true })
  expect(router.navigate).toHaveBeenCalledWith({ to: '/settings' })
  const input = document.createElement('input'); document.body.append(input)
  fireEvent.keyDown(input, { key: 'f', code: 'KeyF' })
  input.remove()
  expect(fullscreen).toHaveBeenCalledOnce()
  fireEvent.keyDown(document.body, { key: '?', code: 'Slash', shiftKey: true })
  expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  fireEvent.keyDown(document.body, { key: 'f', code: 'KeyF' })
  expect(fullscreen).toHaveBeenCalledOnce()
  unmount()
})
