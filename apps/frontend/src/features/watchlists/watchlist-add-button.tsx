import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Check, Plus } from 'lucide-react'

import { addListItem, createList, deleteListItem, listItemsQuery, listsQuery, queryKeys } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { useDialogManager } from '@/components/dialogs'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CREATE_LIST_VALUE = '__create_list__'

export function WatchlistAddButton({ media }: { media: MediaPreview }) {
  const queryClient = useQueryClient()
  const { openDialog } = useDialogManager()
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
      const result = await openDialog('watchlistCreate', {})
      if (result.action !== 'confirm') {
        return null
      }
      const list = await createList(result.name)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
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
  )
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
    const existing = (itemsByListId[value] ?? []).find(item => item.media_type === media.type && item.media_id === media.id)
    if (existing) removeMutation.mutate({ listId: value, itemId: existing.id })
    else addMutation.mutate(value)
  }

  const busy = addMutation.isPending || removeMutation.isPending || createAndAddMutation.isPending
  const error = lists.error ?? listItems.find(result => result.error)?.error ?? addMutation.error ?? removeMutation.error ?? createAndAddMutation.error
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" className="h-9 rounded-lg border border-border bg-muted/40 px-3 text-xs" type="button"
          aria-label={isSaved ? 'Remove from Saved' : 'Save to Saved'} aria-pressed={isSaved}
          onClick={toggleDefault} disabled={!defaultList || busy || listItems.some(result => result.isLoading || result.isError)}>
          {isSaved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
          {isSaved ? 'Saved' : 'Save'}
        </Button>
      <Select
        value=""
        onValueChange={handleAddToSelect}
        disabled={busy || lists.isLoading || listItems.some(result => result.isLoading || result.isError)}
      >
        <SelectTrigger className="w-fit max-w-[min(520px,100%)] h-9 rounded-lg border-border bg-muted/40 text-xs hover:bg-muted" size="sm" aria-label="Add to watchlist">
          {customAddedCount > 0 ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          <SelectValue
            placeholder={
              customAddedCount === 0
                ? 'Add to list'
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
      {error ? <p role="alert" className="text-xs text-destructive">{error instanceof Error ? error.message : 'Could not update your lists. Try again.'}</p> : null}
    </div>
  )
}
