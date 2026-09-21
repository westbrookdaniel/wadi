import { useTvPageState } from '@/components/tv/use-tv-page-state'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Settings, Search, Bookmark, X } from 'lucide-react'
import { useRef } from 'react'

import { createList, deleteList, listItemsQuery, listsQuery, queryKeys, updateList } from '@/api/queries'
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

  const [filter, setFilter] = useTvPageState('watchlist-filter', '')
  const [searchExpanded, setSearchExpanded] = useTvPageState('watchlist-search-expanded', false)
  const searchInput = useRef<HTMLInputElement>(null)
  const [sort, setSort] = useTvPageState('watchlist-sort', 'recent')

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
  const mutationError = createMutation.error ?? renameMutation.error ?? deleteListMutation.error

  return (
    <div className={cn(pageStack, 'gap-5 max-[800px]:gap-3')} data-tv-loading={items.isLoading || lists.isLoading ? '' : undefined}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-2xl font-medium tracking-tight">Watchlists</h1>
        <Button size="sm" className="rounded-lg" onClick={() => void openCreateListDialog()} disabled={createMutation.isPending}><Plus aria-hidden="true" />New list</Button>
      </header>
      <div className="flex min-w-0 items-center gap-3 max-[800px]:flex-col max-[800px]:items-stretch max-[800px]:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <nav aria-label="Watchlists" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {[...(lists.data ?? [])].sort((a, b) => Number(b.is_default) - Number(a.is_default)).map(list => <button key={list.id} type="button" onClick={() => { setSelectedListId(list.id); setFilter('') }} aria-pressed={activeListId === list.id} className={cn('flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition', activeListId === list.id ? 'border-border bg-muted text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/40')}>
              {list.is_default ? <Bookmark className="size-3.5" aria-hidden="true" /> : null}{list.name}
            </button>)}
          </nav>
          {activeList && !activeList.is_default ? <Button variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label="List settings" title="Manage list" onClick={() => void openListSettingsDialog()}><Settings className="size-5" /></Button> : null}
        </div>
        {activeList ? <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" className={cn('hidden flex-1 justify-start border border-border text-muted-foreground', !searchExpanded && 'max-[800px]:flex')} onClick={() => { setSearchExpanded(true); requestAnimationFrame(() => searchInput.current?.focus()) }}><Search className="size-3.5" />Search this list</Button>
          <label className={cn('flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border px-3 max-[800px]:flex-1', !searchExpanded && 'max-[800px]:hidden')}>
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <Input ref={searchInput} aria-label="Search this list" placeholder="Search this list" value={filter} onChange={event => setFilter(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { setFilter(''); setSearchExpanded(false) } }} className="h-full w-40 border-0 bg-transparent px-0 text-sm focus-visible:ring-0 max-[800px]:w-full" />
            <button type="button" aria-label="Close list search" className="hidden max-[800px]:grid size-6 shrink-0 place-items-center text-muted-foreground" onClick={() => { setFilter(''); setSearchExpanded(false) }}><X className="size-3.5" /></button>
          </label>
          <div className={cn(searchExpanded && 'max-[800px]:hidden')}>
            <Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="Sort watchlist" className="h-9 w-40 rounded-lg text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Recently added</SelectItem><SelectItem value="az">Title A–Z</SelectItem></SelectContent></Select>
          </div>
        </div> : null}
      </div>
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
