import { Navigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'

import type { User } from '@/api/types'
import { meQuery, profilesQuery, queryKeys, selectProfile } from '@/api/queries'
import { LoadingState } from '@/components/status'
import { appBackground } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { clearStoredToken, useAppStore } from '@/store/app-store'
import { ProfileAvatar } from './profile-avatar'

export function ProtectedRoute({ children }: { children: (user: User) => ReactNode }) {
  const token = useAppStore((state) => state.token)
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId)
  const setSelectedListId = useAppStore((state) => state.setSelectedListId)
  const queryClient = useQueryClient()
  const me = useQuery(meQuery(Boolean(token)))
  const profiles = useQuery({ ...profilesQuery, enabled: Boolean(token && me.data) })
  const selectProfileMutation = useMutation({
    mutationFn: selectProfile,
    onSuccess: async (data) => {
      setActiveProfileId(data.active_profile_id)
      setSelectedListId(null)
      if (token && typeof window !== 'undefined') {
        window.sessionStorage.setItem('wadi.profile.selected_token', token)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
        queryClient.invalidateQueries({ queryKey: ['list-items'] }),
        queryClient.invalidateQueries({ queryKey: ['watch-data'] }),
        queryClient.invalidateQueries({ queryKey: ['continue-watching'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.browseLayout }),
      ])
    },
  })

  useEffect(() => {
    if (me.data?.active_profile_id) {
      setActiveProfileId(me.data.active_profile_id)
    }
  }, [me.data?.active_profile_id, setActiveProfileId])

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (me.isLoading) {
    return (
      <main className={cn('grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
        <LoadingState label="Restoring session" />
      </main>
    )
  }

  if (me.isError) {
    return <InvalidSessionRedirect />
  }

  if (!me.data) {
    return (
      <main className={cn('grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
        <LoadingState label="Preparing app" />
      </main>
    )
  }

  if (profiles.isLoading) {
    return (
      <main className={cn('grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
        <LoadingState label="Loading profiles" />
      </main>
    )
  }

  if (profiles.error || !profiles.data) {
    return <InvalidSessionRedirect />
  }

  if (profiles.data.length === 1) {
    const profile = profiles.data[0]
    if (activeProfileId !== profile.id || me.data.active_profile_id !== profile.id) {
      if (!selectProfileMutation.isPending) {
        selectProfileMutation.mutate(profile.id)
      }
      return (
        <main className={cn('grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
          <LoadingState label="Preparing profile" />
        </main>
      )
    }
  }

  const selectedToken =
    typeof window === 'undefined'
      ? null
      : window.sessionStorage.getItem('wadi.profile.selected_token')
  const requiresSelection =
    profiles.data.length > 1 &&
    (selectedToken !== token || activeProfileId !== me.data.active_profile_id)

  if (requiresSelection) {
    return (
      <main className={cn('grid min-h-svh content-center justify-items-center gap-6 px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
        <section className="grid w-[min(760px,100%)] gap-4 rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-sm">
          <header className="grid gap-1">
            <h1 className="m-0 text-[clamp(1.5rem,3vw,2.1rem)] font-[560]">Who&apos;s watching?</h1>
            <p className="m-0 text-sm text-muted-foreground">Choose a profile to continue. This controls your watch history, lists, and layout.</p>
          </header>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {profiles.data.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="grid justify-items-center gap-2 rounded-xl border border-border bg-card/60 p-3 transition hover:bg-muted/40"
                disabled={selectProfileMutation.isPending}
                onClick={() => selectProfileMutation.mutate(profile.id)}
              >
                <ProfileAvatar
                  name={profile.name}
                  avatarKey={profile.avatar_key}
                  themeColor={profile.theme_color}
                  className="size-16 text-xl"
                />
                <span className="text-sm font-medium">{profile.name}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  return children(me.data)
}

function InvalidSessionRedirect() {
  useEffect(() => {
    clearStoredToken()
  }, [])

  return <Navigate to="/login" replace />
}
