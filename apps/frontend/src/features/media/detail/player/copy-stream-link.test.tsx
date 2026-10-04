import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CopyStreamLink } from './copy-stream-link'
afterEach(() => vi.unstubAllGlobals())
it('copies the actual current playable URL, including its query, and clears stale feedback on change', async () => {
  let complete!: () => void
  const writeText = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve })).mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const first = 'https://example.invalid/media.webm?token=synthetic&file=1'
  const second = 'https://example.invalid/next.webm?file=2'
  const view = render(<CopyStreamLink url={first} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy stream link' }))
  expect(writeText).toHaveBeenCalledWith(first)
  view.rerender(<CopyStreamLink url={second} />)
  await act(async () => complete())
  expect(screen.queryByText('Stream link copied.')).not.toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy stream link' })))
  expect(writeText).toHaveBeenLastCalledWith(second)
  expect(screen.getByRole('status')).toHaveTextContent('Stream link copied')
})
it('shows an honest failure and selectable manual fallback; missing URL is unavailable', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } })
  const view = render(<CopyStreamLink url="https://example.invalid/a" />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy stream link' })))
  expect(screen.getByRole('alert')).toHaveTextContent('Could not copy automatically')
  const link = screen.getByRole('textbox', { name: 'Stream link' })
  expect(link).toHaveValue('https://example.invalid/a')
  expect(link).toHaveAttribute('readonly')
  fireEvent.click(screen.getByRole('button', { name: 'Close link' }))
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  view.rerender(<CopyStreamLink />)
  expect(screen.getByRole('button', { name: 'Copy stream link' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('no copyable link')
})
