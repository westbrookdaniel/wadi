import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'

import { createList, deleteList, deleteListItem, listItemsQuery, listsQuery, queryKeys } from '@/api/queries'
import type { ListItem, MediaPreview } from '@/api/types'
import { MediaCard } from '@/components/media-card'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import {
  compactHeader,
  contentSection,
  dangerText,
  iconButton,
  iconTextButton,
  inputClass,
  mediaGrid,
  pageHeader,
  pageStack,
  sectionHeading,
} from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

export function WatchlistsPage({ onOpenMedia }: { onOpenMedia: (media: MediaPreview) => void }) {
  const queryClient = useQueryClient()
  const selectedListId = useAppStore((state) => state.selectedListId)
  const setSelectedListId = useAppStore((state) => state.setSelectedListId)
  const [name, setName] = useState('')
  const lists = useQuery(listsQuery)
  const activeListId = selectedListId ?? lists.data?.[0]?.id ?? null
  const items = useQuery(listItemsQuery(activeListId))

  useEffect(() => {
    if (!selectedListId && lists.data?.[0]) {
      setSelectedListId(lists.data[0].id)
    }
  }, [lists.data, selectedListId, setSelectedListId])

  const createMutation = useMutation({
    mutationFn: () => createList(name),
    onSuccess: async (list) => {
      setName('')
      setSelectedListId(list.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (listId: string) => deleteList(listId),
    onSuccess: async () => {
      setSelectedListId(null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
    },
  })

  const removeItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) => deleteListItem(listId, itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.listItems(activeListId) })
    },
  })

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.trim()) {
      createMutation.mutate()
    }
  }

  return (
    <div className={cn(pageStack, 'grid-cols-[minmax(240px,330px)_minmax(0,1fr)] items-start max-[800px]:grid-cols-1')}>
      <section>
        <header className={cn(pageHeader, compactHeader)}>
          <h1 className="m-0 leading-[0.95] tracking-normal">Watchlists</h1>
        </header>

        <form className="flex items-center gap-2.5 max-[800px]:flex-col max-[800px]:items-stretch" onSubmit={onCreate}>
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="New list name" />
          <button className={iconTextButton} type="submit" disabled={createMutation.isPending}>
            <Plus aria-hidden="true" />
            Create
          </button>
        </form>

        {lists.isLoading ? <LoadingState label="Loading lists" /> : null}
        {lists.error ? <ErrorState error={lists.error} /> : null}
        {lists.data?.length ? (
          <div className="grid gap-2.5">
            {lists.data.map((list) => (
              <button
                className={cn(
                  'flex min-h-[46px] w-full items-center justify-between gap-3.5 rounded-[7px] border border-[hsl(0_0%_100%/8%)] bg-[hsl(0_0%_100%/4%)] px-3 py-2.5 text-left text-[hsl(0_0%_92%)]',
                  list.id === activeListId && 'border-[hsl(322_100%_72%/45%)] bg-[hsl(322_80%_55%/14%)]',
                )}
                type="button"
                key={list.id}
                onClick={() => setSelectedListId(list.id)}
              >
                <span>{list.name}</span>
                <small className="text-[hsl(240_6%_62%)]">{new Date(list.updated_at).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        ) : !lists.isLoading ? (
          <EmptyState title="No watchlists yet" />
        ) : null}
      </section>

      <section className={contentSection}>
        <div className={sectionHeading}>
          <div>
            <h2 className="m-0 tracking-normal">{lists.data?.find((list) => list.id === activeListId)?.name ?? 'Select a list'}</h2>
          </div>
          {activeListId ? (
            <button className={cn(iconTextButton, dangerText)} type="button" onClick={() => deleteMutation.mutate(activeListId)}>
              <Trash2 aria-hidden="true" />
              Delete list
            </button>
          ) : null}
        </div>

        {items.isLoading ? <LoadingState label="Loading items" /> : null}
        {items.data?.length ? (
          <div className={mediaGrid}>
            {items.data.map((item) => (
              <MediaCard
                key={item.id}
                media={item}
                onOpen={() => onOpenMedia(mediaFromListItem(item))}
                action={
                  <button
                    className={iconButton}
                    type="button"
                    aria-label={`Remove ${item.title}`}
                    onClick={() => activeListId && removeItemMutation.mutate({ listId: activeListId, itemId: item.id })}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
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
