import { useQueries, useQuery, type QueryClient } from '@tanstack/react-query'
import { addonsQuery, streamsQuery } from '@/api/queries'
import type { AddonRecord } from '@/api/types'

export function streamAddons(addons: AddonRecord[], type: string, id: string) {
  return addons.filter(addon => addon.manifest.resources?.some(resource => {
    const declaration = typeof resource === 'string' ? { name: resource, types: addon.manifest.types, idPrefixes: Array.isArray(addon.manifest.idPrefixes) ? addon.manifest.idPrefixes as string[] : [] } : resource as { name?: string; types?: string[]; idPrefixes?: string[] } | null
    return declaration?.name === 'stream' && declaration.types?.includes(type)
      && (!declaration.idPrefixes?.length || declaration.idPrefixes.some(prefix => id.startsWith(prefix)))
  }))
}

// Separate cache entries let each provider publish or retain its own results.
export function useStreams(type: string, id: string, enabled = true) {
  const addons = useQuery({ ...addonsQuery, enabled })
  const providers = streamAddons(addons.data ?? [], type, id)
  return useQueries({
    queries: providers.map(addon => streamsQuery(type, id, enabled, addon.id)),
    combine: results => ({
      data: results.flatMap(result => result.data ?? []),
      isFetching: enabled && (addons.isFetching || results.some(result => result.isFetching)),
      isSuccess: addons.isSuccess && (results.length === 0 || results.some(result => result.isSuccess)),
      isError: addons.isError || results.some(result => result.isError),
      error: addons.error ?? results.find(result => result.error)?.error ?? null,
      refetch: () => addons.error ? addons.refetch() : Promise.allSettled(results.map(result => result.refetch())),
    }),
  })
}

export async function prefetchStreams(client: QueryClient, type: string, id: string) {
  const addons = await client.fetchQuery(addonsQuery)
  await Promise.allSettled(streamAddons(addons, type, id).map(addon => client.prefetchQuery(streamsQuery(type, id, true, addon.id))))
}
