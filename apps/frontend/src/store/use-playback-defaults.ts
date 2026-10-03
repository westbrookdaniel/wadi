import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { apiRequest } from '@/api/client'
import { useAppStore } from './app-store'
import { autoPlaybackSchema, useAutoPlayback, type AutoPlaybackSettings } from './auto-playback'

const responseSchema = z.object({ settings: autoPlaybackSchema.nullable() })

export function usePlaybackDefaults() {
  const profileId = useAppStore(state => state.activeProfileId)
  const revision = useAppStore(state => state.authRevision)
  const deviceSettings = useAutoPlayback(state => state.settings)
  const updateDevice = useAutoPlayback(state => state.update)
  const client = useQueryClient()
  const key = ['profile-playback-defaults', revision, profileId]
  const path = `/api/profiles/${encodeURIComponent(profileId ?? '')}/playback-settings`
  const profile = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => responseSchema.parse(await apiRequest(path, { signal })),
    enabled: Boolean(profileId),
    staleTime: 60_000,
    retry: false,
  })
  const mutation = useMutation({
    mutationFn: async ({ settings, path: requestPath, key: requestKey, profileId: requestProfile }: { settings: AutoPlaybackSettings | null; path: string; key: typeof key; profileId: string | null }) => {
      if (!requestProfile) {
        if (settings) updateDevice(settings)
        return { key: requestKey, value: { settings: null } }
      }
      return { key: requestKey, value: responseSchema.parse(await apiRequest(requestPath, { method: settings ? 'PUT' : 'DELETE', body: settings ?? undefined })) }
    },
    onSuccess: result => client.setQueryData(result.key, result.value),
  })
  return {
    settings: profile.data?.settings ?? deviceSettings,
    ready: !profileId || !profile.isPending,
    profileId,
    hasProfileDefaults: Boolean(profile.data?.settings),
    profileError: profile.error,
    retryProfile: () => profile.refetch(),
    save: {
      ...mutation,
      mutate: (settings: AutoPlaybackSettings | null, options?: { onSuccess?: () => void }) => mutation.mutate({ settings, path, key, profileId }, { onSuccess: () => options?.onSuccess?.() }),
      mutateAsync: async (settings: AutoPlaybackSettings | null) => (await mutation.mutateAsync({ settings, path, key, profileId })).value,
    },
  }
}
