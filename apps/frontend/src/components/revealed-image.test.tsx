import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RevealedImage } from './revealed-image'

describe('RevealedImage', () => {
  it('waits for decoding, then resets the reveal when its source changes', async () => {
    const { rerender } = render(<RevealedImage src="/first.jpg" alt="Poster" />)
    const image = screen.getByAltText('Poster')
    let finishDecode = () => {}
    Object.defineProperty(image, 'decode', { value: vi.fn(() => new Promise<void>(resolve => { finishDecode = resolve })) })
    Object.defineProperty(image, 'naturalWidth', { value: 500 })
    fireEvent.load(image)
    expect(image).toHaveAttribute('data-ready', 'false')
    finishDecode()
    await waitFor(() => expect(image).toHaveAttribute('data-ready', 'true'))
    rerender(<RevealedImage src="/second.jpg" alt="Poster" />)
    expect(screen.getByAltText('Poster')).toHaveAttribute('data-ready', 'false')
  })
})
