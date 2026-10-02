import { captionStyle, captionBackgroundStyle, type SubtitleAppearance } from './caption-style'

export function SubtitlePreview({ value }: { value: SubtitleAppearance }) {
  return <div aria-label="Subtitle preview" className="overflow-hidden rounded-lg bg-slate-800 p-6 text-center" style={captionStyle(value)}><span style={captionBackgroundStyle(value)}>The world is full of stories.</span></div>
}
