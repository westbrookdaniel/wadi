import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Settings, Trash2 } from 'lucide-react'
import { useEffect } from 'react'

import { createList, deleteList, deleteListItem, listItemsQuery, listsQuery, queryKeys, updateList } from '@/api/queries'
import type { ListItem, MediaPreview } from '@/api/types'
import { useDialogManager } from '@/components/dialogs'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MediaCard } from '@/features/media/media-card'
import { contentSection, mediaGrid, pageHeader, pageStack } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

const CREATE_LIST_VALUE = '__create_list__'

export function WatchlistsPage({ onOpenMedia }: { onOpenMedia: (media: MediaPreview) => void }) {
  const queryClient = useQueryClient()
  const { openDialog } = useDialogManager()
  const selectedListId = useAppStore((state) => state.selectedListId)
  const setSelectedListId = useAppStore((state) => state.setSelectedListId)

  const lists = useQuery(listsQuery)
  const defaultList = (lists.data ?? []).find((list) => list.is_default) ?? null
  const activeListId = selectedListId ?? defaultList?.id ?? lists.data?.[0]?.id ?? null
  const activeList = (lists.data ?? []).find((list) => list.id === activeListId) ?? null
  const items = useQuery(listItemsQuery(activeListId))

  useEffect(() => {
    if (!selectedListId && defaultList) {
      setSelectedListId(defaultList.id)
    }
  }, [defaultList, selectedListId, setSelectedListId])

  const createMutation = useMutation({
    mutationFn: ({ name }: { name: string }) => createList(name),
    onSuccess: async (list) => {
      setSelectedListId(list.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ listId, name }: { listId: string; name: string }) => updateList(listId, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
    },
  })

  const deleteListMutation = useMutation({
    mutationFn: (listId: string) => deleteList(listId),
    onSuccess: async () => {
      setSelectedListId(defaultList?.id ?? null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
    },
  })

  const removeItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) => deleteListItem(listId, itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.listItems(activeListId) })
    },
  })

  const openCreateListDialog = async () => {
    const result = await openDialog('watchlistCreate', {})
    if (result.action !== 'confirm') {
      return
    }
    createMutation.mutate({ name: result.name })
  }

  const openListSettingsDialog = async () => {
    if (!activeList) {
      return
    }
    const result = await openDialog('watchlistSettings', {
      listId: activeList.id,
      currentName: activeList.name,
      canDelete: !activeList.is_default,
    })
    if (result.action === 'save') {
      renameMutation.mutate({ listId: activeList.id, name: result.name })
      return
    }
    if (result.action === 'delete') {
      deleteListMutation.mutate(activeList.id)
    }
  }

  const onSelectList = (value: string) => {
    if (value === CREATE_LIST_VALUE) {
      void openCreateListDialog()
      return
    }
    setSelectedListId(value)
  }

  return (
    <div className={cn(pageStack, 'gap-5')}>
      <header className={cn(pageHeader, 'min-h-0')}>
        <h1 className="m-0 leading-[0.95] tracking-normal">Watchlists</h1>
        <div className="flex items-center gap-2">
          <Select value={activeListId ?? ''} onValueChange={onSelectList} disabled={lists.isLoading}>
            <SelectTrigger className="w-[220px] max-w-full" aria-label="Select watchlist">
              <SelectValue placeholder="Select list" />
            </SelectTrigger>
            <SelectContent>
              {(lists.data ?? []).map((list) => (
                <SelectItem value={list.id} key={list.id}>
                  {list.name}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={CREATE_LIST_VALUE}>
                <Plus aria-hidden="true" />
                List
              </SelectItem>
            </SelectContent>
          </Select>
          {activeList && !activeList.is_default ? (
            <Button variant="secondary" size="icon-sm" type="button" aria-label="List settings" onClick={() => void openListSettingsDialog()}>
              <Settings aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </header>

      <section className={contentSection}>
        {lists.isLoading ? <LoadingState label="Loading lists" /> : null}
        {lists.error ? <ErrorState error={lists.error} /> : null}
        {items.isLoading ? <LoadingState label="Loading items" /> : null}
        {items.data?.length ? (
          <div className={mediaGrid}>
            {items.data.map((item) => (
              <MediaCard
                key={item.id}
                media={mediaFromListItem(item)}
                onOpen={() => onOpenMedia(mediaFromListItem(item))}
                action={
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    aria-label={`Remove ${item.title}`}
                    onClick={() => activeListId && removeItemMutation.mutate({ listId: activeListId, itemId: item.id })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                }
              />
            ))}
          </div>
        ) : activeListId && !items.isLoading ? (
          <EmptyState title="This list is empty" body="Add titles from Movies, Series, or Search." />
        ) : null}
      </section>
    </div>
  )
}

function mediaFromListItem(item: ListItem): MediaPreview {
  return {
    id: item.media_id,
    type: item.media_type,
    name: item.title,
    poster: item.poster ?? undefined,
    releaseInfo: item.release_info ?? undefined,
    raw: item.meta ?? {
      id: item.media_id,
      type: item.media_type,
      name: item.title,
    },
  }
}
