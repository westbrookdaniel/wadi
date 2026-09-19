import { z } from 'zod'

export type MetadataValue<T> = { value: T; source: 'structured' | 'filename' | 'description' | 'title' } | { value: null; source: 'unknown' }
const unknownValue = <T>(): MetadataValue<T> => ({ value: null, source: 'unknown' })
export type StreamMetadata = ReturnType<typeof parseStreamMetadata>

/** Conservative, deterministic extraction. Unknown means unknown, never an assumed capability. */
export function parseStreamMetadata(input: unknown) {
  // Parse each field separately so one malformed provider field does not discard the others.
  const object = z.record(z.string(), z.unknown()).safeParse(input)
  const raw = object.success ? object.data : {}
  const field = <T>(schema: z.ZodType<T>, value: unknown): T | undefined => { const result = schema.safeParse(value); return result.success ? result.data : undefined }
  const hintFields = field(z.record(z.string(), z.unknown()), raw.behaviorHints) ?? {}
  const hints = { filename: field(z.string(), hintFields.filename), videoSize: field(z.number().finite().positive(), hintFields.videoSize), bingeGroup: field(z.string(), hintFields.bingeGroup) }
  const filename = hints?.filename ?? field(z.string(), raw.filename)
  const description = field(z.string(), raw.description)
  const title = field(z.string(), raw.title)
  const name = field(z.string(), raw.name)
  const sources: Array<{ text: string; source: 'filename' | 'description' | 'title' }> = []
  if (filename) sources.push({text:filename,source:'filename'})
  if (description) sources.push({text:description,source:'description'})
  for (const text of [title,name]) if (text) sources.push({text,source:'title'})
  function extract<T>(parse: (text: string) => T | null): MetadataValue<T> {
    for (const {text,source} of sources) { const value = parse(text); if (value !== null) return { value, source } }
    return unknownValue<T>()
  }
  function structured<T>(value: unknown, parse: (text: string) => T | null, fallback: () => MetadataValue<T>): MetadataValue<T> {
    const parsed = typeof value === 'string' || typeof value === 'number' ? parse(String(value)) : null
    return parsed !== null ? { value: parsed, source: 'structured' } : fallback()
  }
  const resolution = (text: string) => {
    const match = text.match(/(?:^|[^a-z0-9])(2160|1440|1080|720|576|480)(?:[pi])?(?=$|[^a-z0-9])/i)
    return match ? Number(match[1]) : /(?:^|[^a-z0-9])(?:4k|uhd)(?=$|[^a-z0-9])/i.test(text) ? 2160 : null
  }
  const codec = (text: string) => /\b(?:hevc|[hx][ ._-]?265)\b/i.test(text) ? 'HEVC' : /\b(?:avc|[hx][ ._-]?264)\b/i.test(text) ? 'H.264' : /\bav1\b/i.test(text) ? 'AV1' : /\bvp9\b/i.test(text) ? 'VP9' : null
  const languages = (text: string) => {
    const values = [
      ['en', /\b(?:english|eng)\b|(?:audio|language)\s*[:=]\s*en\b/i],
      ['es', /\b(?:spanish|spa|español)\b|(?:audio|language)\s*[:=]\s*es\b/i],
      ['fr', /\b(?:french|fra|fre|français)\b|(?:audio|language)\s*[:=]\s*fr\b/i],
      ['de', /\b(?:german|deu|ger|deutsch)\b|(?:audio|language)\s*[:=]\s*de\b/i],
      ['ja', /\b(?:japanese|jpn)\b|(?:audio|language)\s*[:=]\s*ja\b/i],
      ['hi', /\b(?:hindi|hin)\b|(?:audio|language)\s*[:=]\s*hi\b/i],
      ['it', /\b(?:italian|ita)\b|(?:audio|language)\s*[:=]\s*it\b/i],
    ].flatMap(([language,pattern]) => typeof language === 'string' && pattern instanceof RegExp && pattern.test(text) ? [language] : [])
    return values.length ? values : null
  }
  const episode = extract(text => {
    const match = text.match(/\bS(\d{1,3})[ ._-]*E(\d{1,4})(?:[ ._-]*E(\d{1,4}))?/i) ?? text.match(/\b(\d{1,3})x(\d{1,4})\b/i)
    return match ? { season: Number(match[1]), episode: Number(match[2]), ...(match[3] ? {lastEpisode:Number(match[3])} : {}) } : null
  })
  return {
    resolution: structured(raw.resolution ?? raw.quality, resolution, () => extract(resolution)),
    codec: structured(raw.codec, codec, () => extract(codec)),
    sourceQuality: extract(text => /\bremux\b/i.test(text) ? 'REMUX' : /\b(?:blu[ ._-]?ray|b[dr]rip)\b/i.test(text) ? 'BluRay' : /\bweb[ ._-]?dl\b/i.test(text) ? 'WEB-DL' : /\bwebrip\b/i.test(text) ? 'WEBRip' : /\bhdtv\b/i.test(text) ? 'HDTV' : /\b(?:hdcam|camrip|telesync)\b/i.test(text) ? 'CAM' : null),
    hdr: extract(text => /\b(?:dolby[ ._-]?vision|dovi|dv)\b/i.test(text) ? 'Dolby Vision' : /\bhdr10\+/i.test(text) ? 'HDR10+' : /\bhdr10\b/i.test(text) ? 'HDR10' : /\bhlg\b/i.test(text) ? 'HLG' : /\bhdr\b/i.test(text) ? 'HDR' : /\bsdr\b/i.test(text) ? 'SDR' : null),
    audio: extract(text => /\batmos\b/i.test(text) ? 'Atmos' : /\btruehd\b/i.test(text) ? 'TrueHD' : /\bdts[ ._-]?hd\b/i.test(text) ? 'DTS-HD' : /\bdts\b/i.test(text) ? 'DTS' : /\b(?:e[ ._-]?ac[ ._-]?3|ddp)(?=\d|\b)/i.test(text) ? 'EAC3' : /\bac[ ._-]?3\b/i.test(text) ? 'AC3' : /\baac\b/i.test(text) ? 'AAC' : null),
    audioChannels: extract(text => text.match(/\b([257]\.1|2\.0)\b/)?.[1] ?? null),
    languages: structured(raw.language, text => /^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(text) ? [text.toLowerCase()] : languages(text), () => extract(languages)),
    sizeBytes: hints?.videoSize ? {value:hints.videoSize,source:'structured' satisfies 'structured'} : extract(text => {
      const match=text.match(/\b(\d+(?:\.\d+)?)\s*(GiB|MiB|GB|MB)\b/i)
      if (!match) return null
      const unit=match[2].toLowerCase(), base=unit.includes('i')?1024:1000
      const bytes = Number(match[1]) * base ** (unit.startsWith('g')?3:2)
      return bytes > 0 && Number.isSafeInteger(Math.round(bytes)) ? Math.round(bytes) : null
    }),
    episode,
    bingeGroup: hints?.bingeGroup ? {value:hints.bingeGroup,source:'structured' satisfies 'structured'} : unknownValue<string>(),
    raw: { filename, description, title, name },
  }
}
