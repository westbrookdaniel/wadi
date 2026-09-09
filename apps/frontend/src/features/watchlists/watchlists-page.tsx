import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Settings, Trash2, Search, Bookmark } from 'lucide-react'
import { useState } from 'react'

import { createList, deleteList, deleteListItem, listItemsQuery, listsQuery, queryKeys, updateList } from '@/api/queries'
import type { ListItem, MediaPreview } from '@/api/types'
import { useDialogManager } from '@/components/dialogs'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { MediaCard } from '@/features/media/media-card'
import { contentSection, mediaGrid, pageStack } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'


export function WatchlistsPage({ onOpenMedia }: { onOpenMedia: (media: MediaPreview) => void }) {
  const queryClient = useQueryClient()
  const { openDialog } = useDialogManager()
  const selectedListId = useAppStore((state) => state.selectedListId)
  const setSelectedListId = useAppStore((state) => state.setSelectedListId)

  const lists = useQuery(listsQuery)
  const defaultList = (lists.data ?? []).find((list) => list.is_default) ?? null
  const activeListId = lists.data?.some(list => list.id === selectedListId) ? selectedListId : defaultList?.id ?? lists.data?.[0]?.id ?? null
  const activeList = (lists.data ?? []).find((list) => list.id === activeListId) ?? null
  const items = useQuery(listItemsQuery(activeListId))

  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('recent')

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
    onSuccess: async (_result, values) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.listItems(values.listId) })
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

  const visibleItems = (items.data ?? []).filter(item => item.title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))
  if (sort === 'az') visibleItems.sort((a, b) => a.title.localeCompare(b.title))
  const mutationError = createMutation.error ?? renameMutation.error ?? deleteListMutation.error ?? removeItemMutation.error

  return (
    <div className={cn(pageStack, 'gap-6')}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-2xl font-medium tracking-tight">Watchlists</h1>
        <Button size="sm" className="rounded-lg" onClick={() => void openCreateListDialog()} disabled={createMutation.isPending}><Plus aria-hidden="true" />New list</Button>
      </header>
      <nav aria-label="Watchlists" className="flex gap-2 overflow-x-auto pb-1">
        {(lists.data ?? []).map(list => <button key={list.id} type="button" onClick={() => { setSelectedListId(list.id); setFilter('') }} aria-pressed={activeListId === list.id} className={cn('flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition', activeListId === list.id ? 'border-white/20 bg-white/10 text-white' : 'border-transparent text-muted-foreground hover:bg-white/5')}>
          {list.is_default ? <Bookmark className="size-3.5" aria-hidden="true" /> : null}{list.name}
        </button>)}
      </nav>
      {activeList ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
        <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{items.data?.length ?? 0} {(items.data?.length ?? 0) === 1 ? "title" : "titles"}</span>
          {!activeList.is_default ? <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" aria-label="List settings" onClick={() => void openListSettingsDialog()}><Settings className="size-3.5" />Manage list</Button> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3"><Search className="size-3.5 text-muted-foreground" /><Input aria-label="Search this list" placeholder="Search this list" value={filter} onChange={event => setFilter(event.target.value)} className="h-9 w-40 border-0 bg-transparent px-0 text-sm focus-visible:ring-0" /></label>
          <Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="Sort watchlist" className="h-9 w-44 rounded-lg text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Recently added</SelectItem><SelectItem value="az">Title A–Z</SelectItem></SelectContent></Select>
        </div>
      </div> : null}
      {mutationError ? <ErrorState error={mutationError} /> : null}
      <section className={contentSection}>
        {lists.isLoading ? <LoadingState label="Loading lists" /> : null}
        {lists.error ? <ErrorState error={lists.error} /> : null}
        {items.error ? <ErrorState error={items.error} /> : null}
        {items.isLoading ? <LoadingState label="Loading items" /> : null}
        {visibleItems.length ? (
          <div className={mediaGrid}>
            {visibleItems.map((item) => (
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
                    disabled={removeItemMutation.isPending}
                    onClick={() => activeListId && removeItemMutation.mutate({ listId: activeListId, itemId: item.id })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                }
              />
            ))}
          </div>
        ) : activeListId && !items.isLoading && !items.error ? (
          <EmptyState title={filter ? "No matching titles" : "This list is empty"} body={filter ? "Try a different title." : "Save a film or series to keep it here for later."} />
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
