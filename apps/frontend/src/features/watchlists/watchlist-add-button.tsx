import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, Plus } from 'lucide-react'

import { addListItem, deleteListItem, listItemsQuery, listsQuery, queryKeys } from '@/api/queries'
import type { ListItem, MediaPreview } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function WatchlistAddButton({ media }: { media: MediaPreview }) {
  const queryClient = useQueryClient()
  const lists = useQuery(listsQuery)
  const defaultList = (lists.data ?? []).find((list) => list.is_default) ?? null
  const customLists = (lists.data ?? []).filter((list) => !list.is_default)
  const listItems = useQueries({
    queries: (lists.data ?? []).map((list) => listItemsQuery(list.id)),
  })

  const addMutation = useMutation({
    mutationFn: (listId: string) => addListItem(listId, media),
    onSuccess: async (_item, listId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.listItems(listId) })
    },
  })
  const removeMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) => deleteListItem(listId, itemId),
    onSuccess: async (_item, values) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.listItems(values.listId) })
    },
  })

  const defaultItems = listItems[(lists.data ?? []).findIndex((list) => list.id === defaultList?.id)]?.data ?? []
  const savedDefaultItem = defaultItems.find((item) => item.media_type === media.type && item.media_id === media.id) ?? null
  const isSaved = Boolean(savedDefaultItem)

  const toggleDefault = () => {
    if (!defaultList) {
      return
    }
    if (savedDefaultItem) {
      removeMutation.mutate({ listId: defaultList.id, itemId: savedDefaultItem.id })
      return
    }
    addMutation.mutate(defaultList.id)
  }

  if (lists.isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="icon-sm" type="button" disabled aria-label="Save to Saved">
          <Heart aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="sm" type="button" disabled>
          Add to
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isSaved ? 'default' : 'secondary'}
            size="icon-sm"
            type="button"
            aria-label={isSaved ? 'Remove from Saved' : 'Save to Saved'}
            onClick={toggleDefault}
            disabled={!defaultList || addMutation.isPending || removeMutation.isPending}
          >
            <Heart className={isSaved ? 'fill-current' : undefined} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isSaved ? 'Saved' : 'Save to Saved'}</TooltipContent>
      </Tooltip>

      <Select
        value=""
        onValueChange={(listId) => listId && addMutation.mutate(listId)}
        disabled={!customLists.length || addMutation.isPending}
      >
        <SelectTrigger className="w-fit max-w-[min(520px,100%)] rounded-full border-border bg-background hover:bg-muted" size="sm" aria-label="Add to watchlist">
          <Plus aria-hidden="true" />
          <SelectValue placeholder="Add to" />
        </SelectTrigger>
        <SelectContent>
          {customLists.map((list) => (
            <SelectItem value={list.id} key={list.id}>
              {list.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
