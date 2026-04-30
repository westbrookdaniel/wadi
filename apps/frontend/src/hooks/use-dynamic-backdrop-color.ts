import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'

import {
  dominantSaturatedBucket,
  fallbackSaturatedAverage,
  rgbString,
} from '@/lib/backdrop-color'

const MEDIA_BROWSE_PATHS = new Set([
  '/home',
  '/movies',
  '/series',
  '/search',
  '/watchlists',
])

const SAMPLE_SIZE = 48
const DEFAULT_REFRESH_DELAY = 70

const accentCache = new Map<string, string | null>()

type UseDynamicBackdropColorOptions = {
  extractAccent?: (sourceUrl: string, signal: AbortSignal) => Promise<string | null>
}

type CssVars = CSSProperties & {
  '--media-accent-r'?: string
  '--media-accent-g'?: string
  '--media-accent-b'?: string
  '--media-accent-strength'?: string
}

const DEFAULT_ACCENT = { r: 137, g: 76, b: 181 }

export function useDynamicBackdropColor(
  pathname: string,
  options: UseDynamicBackdropColorOptions = {},
) {
  const [accent, setAccent] = useState<{ path: string; color: string | null }>({
    path: '',
    color: null,
  })
  const extractAccent = options.extractAccent ?? extractPosterAccentRgb
  const isMediaDrivenPage = isMediaDrivenPath(pathname)

  useEffect(() => {
    if (!isMediaDrivenPage) {
      return
    }

    let activeSource = ''
    let isCancelled = false
    let timerId: number | null = null
    let activeController: AbortController | null = null

    const refreshAccent = () => {
      const source = resolveBackdropPosterSource(pathname, document)
      if (source === activeSource) {
        return
      }
      activeSource = source ?? ''

      if (!source) {
        activeController?.abort()
        activeController = null
        setAccent({ path: pathname, color: null })
        return
      }

      activeController?.abort()
      activeController = new AbortController()
      const cached = accentCache.get(source)
      if (cached !== undefined) {
        setAccent({ path: pathname, color: cached })
        return
      }

      extractAccent(source, activeController.signal)
        .then((color) => {
          if (isCancelled || activeController?.signal.aborted) {
            return
          }
          accentCache.set(source, color)
          setAccent({ path: pathname, color })
        })
        .catch(() => {
          if (isCancelled || activeController?.signal.aborted) {
            return
          }
          accentCache.set(source, null)
          setAccent({ path: pathname, color: null })
        })
    }

    const queueRefresh = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
      timerId = window.setTimeout(refreshAccent, DEFAULT_REFRESH_DELAY)
    }

    const observer = new MutationObserver(queueRefresh)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'data-bg-source'],
    })

    queueRefresh()

    return () => {
      isCancelled = true
      observer.disconnect()
      activeController?.abort()
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
    }
  }, [extractAccent, isMediaDrivenPage, pathname])

  const activeAccent = isMediaDrivenPage && accent.path === pathname ? accent.color : null

  const style = useMemo<CssVars | undefined>(() => {
    if (!isMediaDrivenPage) {
      return undefined
    }
    const parsed = activeAccent ? parseRgbTriplet(activeAccent) : null
    const color = parsed ?? DEFAULT_ACCENT
    return {
      '--media-accent-r': String(color.r),
      '--media-accent-g': String(color.g),
      '--media-accent-b': String(color.b),
      '--media-accent-strength': parsed ? '1' : '0',
    }
  }, [activeAccent, isMediaDrivenPage])

  return {
    isMediaDrivenPage,
    hasMediaAccent: Boolean(activeAccent),
    style,
  }
}

export function isMediaDrivenPath(pathname: string) {
  return pathname.startsWith('/media/') || MEDIA_BROWSE_PATHS.has(pathname)
}

export function resolveBackdropPosterSource(
  pathname: string,
  root: ParentNode,
): string | null {
  if (pathname.startsWith('/media/')) {
    return imageSource(
      root.querySelector<HTMLImageElement>('img[data-bg-source="detail"]'),
    )
  }

  if (!MEDIA_BROWSE_PATHS.has(pathname)) {
    return null
  }

  const posters = Array.from(
    root.querySelectorAll<HTMLImageElement>('img[data-bg-source="catalog"]'),
  ).map((image) => ({ image, source: imageSource(image) }))

  const usable = posters.filter((entry) => Boolean(entry.source))
  if (!usable.length) {
    return null
  }

  const visible = usable.filter((entry) => isVisibleInViewport(entry.image))
  if (!visible.length) {
    return usable[0]?.source ?? null
  }

  visible.sort((left, right) => {
    const leftRect = left.image.getBoundingClientRect()
    const rightRect = right.image.getBoundingClientRect()
    if (leftRect.top !== rightRect.top) {
      return leftRect.top - rightRect.top
    }
    return leftRect.left - rightRect.left
  })

  return visible[0]?.source ?? usable[0]?.source ?? null
}

export async function extractPosterAccentRgb(
  sourceUrl: string,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    throw abortedError()
  }

  const image = await loadImage(sourceUrl, signal)
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return null
  }

  try {
    drawCoverImage(context, image, SAMPLE_SIZE)
    const imageData = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
    const primaryColor = dominantSaturatedBucket(imageData)
    if (primaryColor) {
      return rgbString(primaryColor)
    }

    const fallbackColor = fallbackSaturatedAverage(imageData)
    return fallbackColor ? rgbString(fallbackColor) : null
  } catch {
    return null
  }
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: number,
) {
  const width = Math.max(1, image.naturalWidth || image.width || size)
  const height = Math.max(1, image.naturalHeight || image.height || size)
  const scale = Math.max(size / width, size / height)
  const drawWidth = width * scale
  const drawHeight = height * scale
  const drawX = (size - drawWidth) / 2
  const drawY = (size - drawHeight) / 2

  context.clearRect(0, 0, size, size)
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

function imageSource(image: HTMLImageElement | null) {
  if (!image) {
    return null
  }
  const source = image.currentSrc || image.src
  return source || null
}

function isVisibleInViewport(image: HTMLImageElement) {
  const rect = image.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return false
  }

  const viewportWidth =
    typeof window !== 'undefined' && window.innerWidth > 0
      ? window.innerWidth
      : Number.POSITIVE_INFINITY
  const viewportHeight =
    typeof window !== 'undefined' && window.innerHeight > 0
      ? window.innerHeight
      : Number.POSITIVE_INFINITY

  return (
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewportWidth &&
    rect.top < viewportHeight
  )
}

function loadImage(sourceUrl: string, signal: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.referrerPolicy = 'no-referrer'

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      cleanup()
      reject(abortedError())
    }

    image.onload = () => {
      cleanup()
      resolve(image)
    }

    image.onerror = () => {
      cleanup()
      reject(new Error(`Failed to load image: ${sourceUrl}`))
    }

    signal.addEventListener('abort', onAbort)
    image.src = sourceUrl
  })
}

function abortedError() {
  return new DOMException('Operation aborted', 'AbortError')
}

function parseRgbTriplet(value: string) {
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 3) {
    return null
  }
  const red = Number(parts[0])
  const green = Number(parts[1])
  const blue = Number(parts[2])
  if ([red, green, blue].some((channel) => !Number.isFinite(channel))) {
    return null
  }
  return {
    r: clampChannel(red),
    g: clampChannel(green),
    b: clampChannel(blue),
  }
}

function clampChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)))
}
