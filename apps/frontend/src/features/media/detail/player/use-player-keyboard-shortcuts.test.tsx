import { fireEvent, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { usePlayerKeyboardShortcuts } from './use-player-keyboard-shortcuts'

it('handles playback keys without intercepting typing, dialogs or app/browser modifier shortcuts', () => {
  const handlers = { onTogglePlay: vi.fn(), onSeek: vi.fn(), onToggleMute: vi.fn(), onVolumeChange: vi.fn(), onChangeSpeed: vi.fn(), onToggleFullscreen: vi.fn() }
  const { unmount } = renderHook(() => usePlayerKeyboardShortcuts({ status: 'ready', currentTime: 20, duration: 120, playbackSpeed: 1, volume: 0.5 }, handlers))
  fireEvent.keyDown(window, { key: 'k', code: 'KeyK' })
  expect(handlers.onTogglePlay).toHaveBeenCalledOnce()
  fireEvent.keyDown(window, { key: 'l', code: 'KeyL' })
  expect(handlers.onSeek).toHaveBeenCalledWith(30)
  fireEvent.keyDown(window, { key: 'ArrowUp', code: 'ArrowUp' })
  expect(handlers.onVolumeChange).toHaveBeenCalledWith(0.55)
  fireEvent.keyDown(window, { key: ',', code: 'Comma', metaKey: true })
  fireEvent.keyDown(window, { key: ',', code: 'Comma', ctrlKey: true })
  expect(handlers.onChangeSpeed).not.toHaveBeenCalled()
  const input = document.createElement('input'); document.body.append(input)
  fireEvent.keyDown(input, { key: 'k', code: 'KeyK' })
  input.remove()
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog)
  fireEvent.keyDown(window, { key: 'k', code: 'KeyK' })
  dialog.remove()
  expect(handlers.onTogglePlay).toHaveBeenCalledOnce()
  unmount()
})
