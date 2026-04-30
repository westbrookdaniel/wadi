export type RgbColor = {
  r: number
  g: number
  b: number
}

type Bucket = {
  weight: number
  sumR: number
  sumG: number
  sumB: number
}

const SATURATION_THRESHOLD = 0.22
const LIGHTNESS_MIN = 0.14
const LIGHTNESS_MAX = 0.88
const BUCKET_SIZE = 32
const FALLBACK_SATURATION_THRESHOLD = 0.08
const FALLBACK_LIGHTNESS_MIN = 0.08
const FALLBACK_LIGHTNESS_MAX = 0.92

export function dominantSaturatedBucket(
  pixels: Uint8ClampedArray,
): RgbColor | null {
  if (!pixels.length) {
    return null
  }

  const buckets = new Map<string, Bucket>()

  for (let index = 0; index <= pixels.length - 4; index += 4) {
    const alpha = pixels[index + 3] / 255
    if (alpha < 0.12) {
      continue
    }

    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const { saturation, lightness } = rgbToHsl(red, green, blue)

    if (
      saturation < SATURATION_THRESHOLD ||
      lightness < LIGHTNESS_MIN ||
      lightness > LIGHTNESS_MAX
    ) {
      continue
    }

    const bucketKey = `${Math.round(red / BUCKET_SIZE)}:${Math.round(green / BUCKET_SIZE)}:${Math.round(blue / BUCKET_SIZE)}`
    const weight = saturation * alpha
    const current = buckets.get(bucketKey) ?? {
      weight: 0,
      sumR: 0,
      sumG: 0,
      sumB: 0,
    }

    current.weight += weight
    current.sumR += red * weight
    current.sumG += green * weight
    current.sumB += blue * weight
    buckets.set(bucketKey, current)
  }

  let selected: Bucket | null = null
  for (const bucket of buckets.values()) {
    if (!selected || bucket.weight > selected.weight) {
      selected = bucket
    }
  }

  if (!selected || selected.weight <= 0) {
    return null
  }

  return {
    r: clampRgb(Math.round(selected.sumR / selected.weight)),
    g: clampRgb(Math.round(selected.sumG / selected.weight)),
    b: clampRgb(Math.round(selected.sumB / selected.weight)),
  }
}

export function rgbString(color: RgbColor) {
  return `${color.r} ${color.g} ${color.b}`
}

export function fallbackSaturatedAverage(
  pixels: Uint8ClampedArray,
): RgbColor | null {
  if (!pixels.length) {
    return null
  }

  let weightTotal = 0
  let redTotal = 0
  let greenTotal = 0
  let blueTotal = 0

  for (let index = 0; index <= pixels.length - 4; index += 4) {
    const alpha = pixels[index + 3] / 255
    if (alpha < 0.08) {
      continue
    }

    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const { saturation, lightness } = rgbToHsl(red, green, blue)

    if (
      saturation < FALLBACK_SATURATION_THRESHOLD ||
      lightness < FALLBACK_LIGHTNESS_MIN ||
      lightness > FALLBACK_LIGHTNESS_MAX
    ) {
      continue
    }

    const weight = (0.35 + saturation) * alpha
    weightTotal += weight
    redTotal += red * weight
    greenTotal += green * weight
    blueTotal += blue * weight
  }

  if (weightTotal <= 0) {
    return null
  }

  return {
    r: clampRgb(Math.round(redTotal / weightTotal)),
    g: clampRgb(Math.round(greenTotal / weightTotal)),
    b: clampRgb(Math.round(blueTotal / weightTotal)),
  }
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255
  const g = green / 255
  const b = blue / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) {
    return { saturation: 0, lightness }
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  return { saturation, lightness }
}

function clampRgb(value: number) {
  return Math.min(255, Math.max(0, value))
}
