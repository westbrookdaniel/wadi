import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Artwork } from './artwork'
it('replaces failed artwork and retries when the source changes', () => {
  const view = render(<Artwork src="/missing.jpg" alt="Poster" />)
  fireEvent.error(screen.getByAltText('Poster'))
  expect(screen.queryByAltText('Poster')).not.toBeInTheDocument()
  expect(view.container.querySelector('img')).toBeNull()
  view.rerender(<Artwork src="/working.jpg" alt="Poster" />)
  expect(screen.getByAltText('Poster')).toHaveAttribute('src', '/working.jpg')
})
