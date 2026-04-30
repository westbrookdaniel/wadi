import { dominantSaturatedBucket, rgbString } from './backdrop-color'

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

function rgbaPixels(...values: number[]) {
  return new Uint8ClampedArray(values)
}

function repeatPixel(
  pixel: [number, number, number, number],
  count: number,
): number[] {
  return Array.from({ length: count }, () => pixel).flat()
}
