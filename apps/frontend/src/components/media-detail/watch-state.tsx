import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, RotateCcw } from 'lucide-react'

import { queryKeys, setWatchState } from '@/api/queries'
import type { WatchState } from '@/api/types'
import { Button } from '@/components/ui/button'

export function WatchedButton({
  watched,
  isPending,
  onClick,
}: {
  watched: boolean
  isPending: boolean
  onClick: () => void
}) {
  return (
    <Button className="w-fit" variant={watched ? 'default' : 'secondary'} type="button" disabled={isPending} onClick={onClick}>
      {watched ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
      {watched ? 'Mark unwatched' : 'Mark watched'}
    </Button>
  )
}

export function useWatchToggle(mediaType: string, mediaId: string, videoId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (watched: boolean) =>
      setWatchState({
        media_type: mediaType,
        media_id: mediaId,
        video_id: videoId,
        watched,
      }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.watchData(mediaType, mediaId), (existing: { items?: WatchState[] } | undefined) => {
        if (!existing) {
          return { media_type: mediaType, media_id: mediaId, items: [state] }
        }
        const items = existing.items ?? []
        const index = items.findIndex((item) => (item.video_id ?? null) === videoId)
        return {
          ...existing,
          items: index >= 0 ? items.map((item, itemIndex) => (itemIndex === index ? state : item)) : [...items, state],
        }
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.watchData(mediaType, mediaId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.continueWatching(20) })
      queryClient.invalidateQueries({ queryKey: queryKeys.continueWatching(12) })
    },
  })
}
