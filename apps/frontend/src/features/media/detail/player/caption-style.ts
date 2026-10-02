import type { CSSProperties } from 'react'
import type { LocalPlaybackState } from './state'

export type SubtitleAppearance = Pick<LocalPlaybackState, 'subtitleSize' | 'subtitleTextColor' | 'subtitleBackgroundColor' | 'subtitleBackgroundOpacity' | 'subtitleOutlineColor' | 'subtitleOutlineStyle' | 'subtitleOutlineWidth' | 'subtitleFontFamily'>

export function captionStyle(value: SubtitleAppearance): CSSProperties {
  const width = value.subtitleOutlineWidth ?? 1.5, color = value.subtitleOutlineColor
  const diagonal = width * 2 / 3
  return {
    lineHeight: 1.35, fontWeight: 500,
    fontSize: `calc(clamp(20px, 2.65vw, 36px) * ${value.subtitleSize})`,
    color: value.subtitleTextColor, fontFamily: value.subtitleFontFamily,
    textShadow: width === 0 ? 'none' : value.subtitleOutlineStyle === 'shadow'
      ? `0 0 ${width * 16 / 3}px ${color}`
      : `${width}px 0 0 ${color}, -${width}px 0 0 ${color}, 0 ${width}px 0 ${color}, 0 -${width}px 0 ${color}, ${diagonal}px ${diagonal}px 0 ${color}, -${diagonal}px -${diagonal}px 0 ${color}, -${diagonal}px ${diagonal}px 0 ${color}, ${diagonal}px -${diagonal}px 0 ${color}`,
  }
}
export function captionBackgroundStyle(value: SubtitleAppearance): CSSProperties {
  const hex = value.subtitleBackgroundColor.replace('#', '')
  const full = hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex
  const rgb = [0, 2, 4].map(start => Number.parseInt(full.slice(start, start + 2), 16) || 0)
  return { backgroundColor: `rgba(${rgb.join(', ')}, ${Math.max(0, Math.min(value.subtitleBackgroundOpacity, 1))})`, padding: '0.2em 0.45em', borderRadius: 4, whiteSpace: 'pre-line', boxDecorationBreak: 'clone' }
}
