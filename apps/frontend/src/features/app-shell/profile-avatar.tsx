/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/utils'

export const PROFILE_AVATAR_OPTIONS = [
  { key: 'avatar-1', color: '#1d4ed8' },
  { key: 'avatar-2', color: '#0369a1' },
  { key: 'avatar-3', color: '#0f766e' },
  { key: 'avatar-4', color: '#15803d' },
  { key: 'avatar-5', color: '#b45309' },
  { key: 'avatar-6', color: '#a21caf' },
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
  return (
    <span
      className={cn(
        'grid place-items-center rounded-full border border-border font-semibold text-white shadow-[0_10px_28px_hsl(0_0%_0%/24%)]',
        className,
      )}
      style={{ backgroundColor: colorForAvatar(avatarKey, themeColor) }}
      aria-hidden="true"
    >
      {profileInitial(name)}
    </span>
  )
}
