import {
  dominantSaturatedBucket,
  fallbackSaturatedAverage,
  rgbString,
} from './backdrop-color'

describe('dominantSaturatedBucket', () => {
  it('chooses the most frequent saturated bucket', () => {
    const pixels = rgbaPixels(
      ...repeatPixel([230, 34, 70, 255], 12),
      ...repeatPixel([48, 145, 234, 255], 4),
    )

    const color = dominantSaturatedBucket(pixels)

    expect(color).toEqual({ r: 230, g: 34, b: 70 })
    expect(rgbString(color!)).toBe('230 34 70')
  })

  it('ignores desaturated gray pixels', () => {
    const pixels = rgbaPixels(
      ...repeatPixel([90, 90, 90, 255], 10),
      ...repeatPixel([130, 130, 130, 255], 6),
    )

    expect(dominantSaturatedBucket(pixels)).toBeNull()
  })

  it('ignores transparent pixels', () => {
    const pixels = rgbaPixels(
      ...repeatPixel([220, 40, 90, 0], 16),
      ...repeatPixel([220, 40, 90, 20], 8),
    )

    expect(dominantSaturatedBucket(pixels)).toBeNull()
  })

  it('returns null when no pixels are provided', () => {
    expect(dominantSaturatedBucket(new Uint8ClampedArray())).toBeNull()
  })
})

describe('fallbackSaturatedAverage', () => {
  it('returns a color when the primary formula has no qualifying pixels', () => {
    const pixels = rgbaPixels(
      ...repeatPixel([121, 108, 95, 255], 10),
      ...repeatPixel([132, 116, 99, 255], 7),
      ...repeatPixel([90, 90, 90, 255], 6),
    )

    expect(dominantSaturatedBucket(pixels)).toBeNull()
    expect(fallbackSaturatedAverage(pixels)).toEqual({ r: 126, g: 111, b: 97 })
  })

  it('returns null when no valid fallback pixels exist', () => {
    const pixels = rgbaPixels(
      ...repeatPixel([100, 100, 100, 255], 16),
      ...repeatPixel([255, 0, 0, 0], 8),
    )

    expect(fallbackSaturatedAverage(pixels)).toBeNull()
  })
})

function rgbaPixels(...values: number[]) {
  return new Uint8ClampedArray(values)
}

function repeatPixel(
  pixel: [number, number, number, number],
  count: number,
): number[] {
  return Array.from({ length: count }, () => pixel).flat()
}
