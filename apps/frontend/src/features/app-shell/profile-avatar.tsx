import { RevealedImage } from '@/components/revealed-image'
/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { cn } from '@/lib/utils'

export const PROFILE_AVATAR_OPTIONS = [
  { key: 'avatar-1', color: '#526a8e', name: 'Slate' },
  { key: 'avatar-2', color: '#397d91', name: 'Ocean' },
  { key: 'avatar-3', color: '#457369', name: 'Sage' },
  { key: 'avatar-4', color: '#667750', name: 'Moss' },
  { key: 'avatar-5', color: '#ab7046', name: 'Copper' },
  { key: 'avatar-6', color: '#886287', name: 'Plum' },
] as const

export function colorForAvatar(avatarKey: string, themeColor: string | null) {
  if (themeColor) return themeColor
  return PROFILE_AVATAR_OPTIONS.find((value) => value.key === avatarKey)?.color ?? '#334155'
}

export function profileInitial(name: string) {
  const value = name.trim()
  return value ? value.slice(0, 1).toUpperCase() : '?'
}

export function ProfileAvatar({
  name,
  avatarKey,
  themeColor,
  className,
}: {
  name: string
  avatarKey: string
  themeColor: string | null
  className?: string
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const image = isAvatarImageUrl(avatarKey) && failedImage !== avatarKey
  return (
    <span
      className={cn(
        'relative shrink-0 overflow-hidden grid place-items-center rounded-full border border-border font-semibold text-white shadow-[0_10px_28px_hsl(0_0%_0%/24%)]',
        className,
      )}
      style={{ backgroundColor: colorForAvatar(avatarKey, themeColor) }}
      aria-hidden="true"
    >
      {image ? <RevealedImage src={avatarKey} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" onError={() => setFailedImage(avatarKey)} /> : profileInitial(name)}
    </span>
  )
}

export function isAvatarImageUrl(value: string) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
}
