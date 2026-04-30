import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import {
  isMediaDrivenPath,
  resolveBackdropPosterSource,
  useDynamicBackdropColor,
} from './use-dynamic-backdrop-color'

describe('route matching', () => {
  it('matches media and browse routes', () => {
    expect(isMediaDrivenPath('/media/movie/tt123')).toBe(true)
    expect(isMediaDrivenPath('/home')).toBe(true)
    expect(isMediaDrivenPath('/movies')).toBe(true)
    expect(isMediaDrivenPath('/settings')).toBe(false)
  })
})

describe('resolveBackdropPosterSource', () => {
  it('prefers detail image on media routes', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <img data-bg-source="catalog" src="https://cdn.example/catalog.jpg" />
      <img data-bg-source="detail" src="https://cdn.example/detail.jpg" />
    `

    expect(resolveBackdropPosterSource('/media/movie/1', root)).toBe(
      'https://cdn.example/detail.jpg',
    )
  })

  it('uses first rendered catalog image for browse pages', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <img data-bg-source="catalog" src="https://cdn.example/a.jpg" />
      <img data-bg-source="catalog" src="https://cdn.example/b.jpg" />
    `

    expect(resolveBackdropPosterSource('/movies', root)).toBe(
      'https://cdn.example/a.jpg',
    )
  })
})

describe('useDynamicBackdropColor', () => {
  it('uses first rendered catalog poster on browse routes', async () => {
    const extractAccent = vi.fn(async (sourceUrl: string) => {
      if (sourceUrl.endsWith('/first.jpg')) {
        return '120 80 40'
      }
      return '10 10 10'
    })

    render(
      <BackdropHarness
        pathname="/home"
        catalogSources={[
          'https://cdn.example/first.jpg',
          'https://cdn.example/second.jpg',
        ]}
        extractAccent={extractAccent}
      />,
    )

    await waitFor(() => {
      expect(extractAccent).toHaveBeenCalledWith(
        'https://cdn.example/first.jpg',
        expect.any(AbortSignal),
      )
      expect(screen.getByTestId('backdrop').className).toContain(
        'has-media-accent',
      )
    })
  })

  it('applies accent from detail poster and falls back when extraction fails', async () => {
    const extractAccent = vi
      .fn<
        (sourceUrl: string, signal: AbortSignal) => Promise<string | null>
      >()
      .mockImplementation(async (sourceUrl) => {
        if (sourceUrl.endsWith('/detail-a.jpg')) {
          return '33 120 200'
        }
        throw new Error('cors blocked')
      })

    const { rerender } = render(
      <BackdropHarness
        pathname="/media/movie/tt123"
        detailSrc="https://cdn.example/detail-a.jpg"
        extractAccent={extractAccent}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('backdrop').className).toContain(
        'has-media-accent',
      )
      expect(
        screen
          .getByTestId('backdrop')
          .style.getPropertyValue('--media-accent-rgb')
          .trim(),
      ).toBe('33 120 200')
    })

    rerender(
      <BackdropHarness
        pathname="/media/movie/tt123"
        detailSrc="https://cdn.example/detail-b.jpg"
        extractAccent={extractAccent}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('backdrop').className).not.toContain(
        'has-media-accent',
      )
      expect(
        screen
          .getByTestId('backdrop')
          .style.getPropertyValue('--media-accent-rgb')
          .trim(),
      ).toBe('')
    })
  })

  it('falls back when no poster source exists', async () => {
    const extractAccent = vi.fn(
      async (sourceUrl: string, signal: AbortSignal) => {
        void sourceUrl
        void signal
        return null
      },
    )

    render(<BackdropHarness pathname="/watchlists" extractAccent={extractAccent} />)

    await waitFor(() => {
      expect(screen.getByTestId('backdrop').className).not.toContain(
        'has-media-accent',
      )
    })

    expect(extractAccent).not.toHaveBeenCalled()
  })
})

function BackdropHarness({
  pathname,
  detailSrc,
  catalogSources = [],
  extractAccent,
}: {
  pathname: string
  detailSrc?: string
  catalogSources?: string[]
  extractAccent: (sourceUrl: string, signal: AbortSignal) => Promise<string | null>
}) {
  const backdrop = useDynamicBackdropColor(pathname, { extractAccent })

  return (
    <div>
      {detailSrc ? (
        <img data-bg-source="detail" src={detailSrc} alt="" />
      ) : null}
      {catalogSources.map((source) => (
        <img data-bg-source="catalog" src={source} alt="" key={source} />
      ))}
      <div
        data-testid="backdrop"
        className={backdrop.hasMediaAccent ? 'has-media-accent' : ''}
        style={backdrop.style}
      />
    </div>
  )
}
