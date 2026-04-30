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

  it('prefers the visual top-left visible catalog image over DOM order', () => {
    const root = document.createElement('div')
    const hiddenFirst = document.createElement('img')
    hiddenFirst.setAttribute('data-bg-source', 'catalog')
    hiddenFirst.src = 'https://cdn.example/hidden-first.jpg'
    setRect(hiddenFirst, { top: 0, left: -800, width: 180, height: 270 })

    const visibleSecond = document.createElement('img')
    visibleSecond.setAttribute('data-bg-source', 'catalog')
    visibleSecond.src = 'https://cdn.example/visible-second.jpg'
    setRect(visibleSecond, { top: 20, left: 16, width: 180, height: 270 })

    root.append(hiddenFirst, visibleSecond)

    expect(resolveBackdropPosterSource('/home', root)).toBe(
      'https://cdn.example/visible-second.jpg',
    )
  })

  it('falls back to first usable catalog image when none are visible', () => {
    const root = document.createElement('div')
    const first = document.createElement('img')
    first.setAttribute('data-bg-source', 'catalog')
    first.src = 'https://cdn.example/first.jpg'
    setRect(first, { top: 0, left: -1200, width: 180, height: 270 })

    const second = document.createElement('img')
    second.setAttribute('data-bg-source', 'catalog')
    second.src = 'https://cdn.example/second.jpg'
    setRect(second, { top: 4000, left: 40, width: 180, height: 270 })

    root.append(first, second)

    expect(resolveBackdropPosterSource('/home', root)).toBe(
      'https://cdn.example/first.jpg',
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

  it('updates when home content mutates and a new top-left visible poster appears', async () => {
    const extractAccent = vi.fn(async (sourceUrl: string) => {
      if (sourceUrl.endsWith('/first.jpg')) {
        return '120 80 40'
      }
      if (sourceUrl.endsWith('/new-top-left.jpg')) {
        return '20 180 80'
      }
      return null
    })

    const { rerender } = render(
      <BackdropHarness
        pathname="/home"
        catalogSources={['https://cdn.example/first.jpg']}
        catalogRects={{
          'https://cdn.example/first.jpg': {
            top: 20,
            left: 24,
            width: 180,
            height: 270,
          },
        }}
        extractAccent={extractAccent}
      />,
    )

    await waitFor(() => {
      expect(
        screen
          .getByTestId('backdrop')
          .style.getPropertyValue('--media-accent-r')
          .trim(),
      ).toBe('120')
    })

    rerender(
      <BackdropHarness
        pathname="/home"
        catalogSources={[
          'https://cdn.example/new-top-left.jpg',
          'https://cdn.example/first.jpg',
        ]}
        catalogRects={{
          'https://cdn.example/new-top-left.jpg': {
            top: 10,
            left: 8,
            width: 180,
            height: 270,
          },
          'https://cdn.example/first.jpg': {
            top: 30,
            left: 40,
            width: 180,
            height: 270,
          },
        }}
        extractAccent={extractAccent}
      />,
    )

    await waitFor(() => {
      expect(extractAccent).toHaveBeenCalledWith(
        'https://cdn.example/new-top-left.jpg',
        expect.any(AbortSignal),
      )
      expect(
        screen
          .getByTestId('backdrop')
          .style.getPropertyValue('--media-accent-r')
          .trim(),
      ).toBe('20')
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
          .style.getPropertyValue('--media-accent-r')
          .trim(),
      ).toBe('33')
      expect(
        screen
          .getByTestId('backdrop')
          .style.getPropertyValue('--media-accent-g')
          .trim(),
      ).toBe('120')
      expect(
        screen
          .getByTestId('backdrop')
          .style.getPropertyValue('--media-accent-b')
          .trim(),
      ).toBe('200')
      expect(
        screen
          .getByTestId('backdrop')
          .style.getPropertyValue('--media-accent-strength')
          .trim(),
      ).toBe('1')
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
          .style.getPropertyValue('--media-accent-strength')
          .trim(),
      ).toBe('0')
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
  catalogRects = {},
  extractAccent,
}: {
  pathname: string
  detailSrc?: string
  catalogSources?: string[]
  catalogRects?: Record<
    string,
    { top: number; left: number; width: number; height: number }
  >
  extractAccent: (sourceUrl: string, signal: AbortSignal) => Promise<string | null>
}) {
  const backdrop = useDynamicBackdropColor(pathname, { extractAccent })

  return (
    <div>
      {detailSrc ? (
        <img data-bg-source="detail" src={detailSrc} alt="" />
      ) : null}
      {catalogSources.map((source) => (
        <img
          data-bg-source="catalog"
          src={source}
          alt=""
          key={source}
          ref={(element) => {
            const rect = catalogRects[source]
            if (!element || !rect) {
              return
            }
            setRect(element, rect)
          }}
        />
      ))}
      <div
        data-testid="backdrop"
        className={backdrop.hasMediaAccent ? 'has-media-accent' : ''}
        style={backdrop.style}
      />
    </div>
  )
}

function setRect(
  element: Element,
  rect: { top: number; left: number; width: number; height: number },
) {
  const value: DOMRect = {
    x: rect.left,
    y: rect.top,
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  } as DOMRect
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => value,
  })
}
