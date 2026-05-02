import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Heart, Plus } from 'lucide-react'

import { addListItem, createList, deleteListItem, listItemsQuery, listsQuery, queryKeys } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const CREATE_LIST_VALUE = '__create_list__'

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
  const createAndAddMutation = useMutation({
    mutationFn: async () => {
      const name = window.prompt('New list name')?.trim()
      if (!name) {
        return null
      }
      const list = await createList(name)
      await addListItem(list.id, media)
      return list.id
    },
    onSuccess: async (listId) => {
      if (!listId) {
        return
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
        queryClient.invalidateQueries({ queryKey: queryKeys.listItems(listId) }),
      ])
    },
  })

  const defaultItems = listItems[(lists.data ?? []).findIndex((list) => list.id === defaultList?.id)]?.data ?? []
  const savedDefaultItem = defaultItems.find((item) => item.media_type === media.type && item.media_id === media.id) ?? null
  const isSaved = Boolean(savedDefaultItem)
  const itemsByListId = Object.fromEntries(
    (lists.data ?? []).map((list, index) => [list.id, listItems[index]?.data ?? []]),
  ) as Record<string, NonNullable<(typeof listItems)[number]['data']>>
  const customAddedLists = customLists.filter((list) =>
    (itemsByListId[list.id] ?? []).some((item) => item.media_type === media.type && item.media_id === media.id),
  )
  const customAddedCount = customAddedLists.length

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
  const handleAddToSelect = (value: string) => {
    if (!value) {
      return
    }
    if (value === CREATE_LIST_VALUE) {
      createAndAddMutation.mutate()
      return
    }
    addMutation.mutate(value)
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
        onValueChange={handleAddToSelect}
        disabled={addMutation.isPending || createAndAddMutation.isPending}
      >
        <SelectTrigger className="w-fit max-w-[min(520px,100%)] rounded-full border-border bg-background hover:bg-muted" size="sm" aria-label="Add to watchlist">
          {customAddedCount > 0 ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          <SelectValue
            placeholder={
              customAddedCount === 0
                ? 'Add to'
                : customAddedCount === 1
                  ? customAddedLists[0]?.name
                  : `${customAddedCount} lists`
            }
          />
        </SelectTrigger>
        <SelectContent side="top" align="start" position="popper">
          <SelectItem value={CREATE_LIST_VALUE}>
            <span className="flex items-center gap-2">
              <Plus aria-hidden="true" />
              New list
            </span>
          </SelectItem>
          {customLists.map((list) => (
            <SelectItem value={list.id} key={list.id}>
              <span className="flex items-center gap-2">
                {(itemsByListId[list.id] ?? []).some((item) => item.media_type === media.type && item.media_id === media.id) ? (
                  <Check aria-hidden="true" />
                ) : (
                  <span className="size-4" aria-hidden="true" />
                )}
                {list.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
