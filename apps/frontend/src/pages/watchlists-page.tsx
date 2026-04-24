import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'

import { createList, deleteList, deleteListItem, listItemsQuery, listsQuery, queryKeys } from '@/api/queries'
import type { ListItem, MediaPreview } from '@/api/types'
import { MediaCard } from '@/components/media-card'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
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
    <div className="page-stack split-page">
      <section>
        <header className="page-header compact-header">
          <h1>Watchlists</h1>
        </header>

        <form className="inline-form" onSubmit={onCreate}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New list name" />
          <button className="icon-text-button" type="submit" disabled={createMutation.isPending}>
            <Plus aria-hidden="true" />
            Create
          </button>
        </form>

        {lists.isLoading ? <LoadingState label="Loading lists" /> : null}
        {lists.error ? <ErrorState error={lists.error} /> : null}
        {lists.data?.length ? (
          <div className="stack-list">
            {lists.data.map((list) => (
              <button
                className="list-row"
                type="button"
                key={list.id}
                data-active={list.id === activeListId}
                onClick={() => setSelectedListId(list.id)}
              >
                <span>{list.name}</span>
                <small>{new Date(list.updated_at).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        ) : !lists.isLoading ? (
          <EmptyState title="No watchlists yet" />
        ) : null}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>{lists.data?.find((list) => list.id === activeListId)?.name ?? 'Select a list'}</h2>
          </div>
          {activeListId ? (
            <button className="icon-text-button danger" type="button" onClick={() => deleteMutation.mutate(activeListId)}>
              <Trash2 aria-hidden="true" />
              Delete list
            </button>
          ) : null}
        </div>

        {items.isLoading ? <LoadingState label="Loading items" /> : null}
        {items.data?.length ? (
          <div className="media-grid">
            {items.data.map((item) => (
              <MediaCard
                key={item.id}
                media={item}
                onOpen={() => onOpenMedia(mediaFromListItem(item))}
                action={
                  <button
                    className="icon-button"
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
