import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { z } from 'zod'

import { createList, deleteList, deleteListItem, listItemsQuery, listsQuery, queryKeys } from '@/api/queries'
import type { ListItem, MediaPreview } from '@/api/types'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MediaCard } from '@/features/media/media-card'
import {
  compactHeader,
  contentSection,
  dangerText,
  mediaGrid,
  pageHeader,
  pageStack,
  sectionHeading,
} from '@/lib/styles'
import { canSubmitForm, fieldError, fieldErrorClass } from '@/lib/form'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

const createListSchema = z.object({
  name: z.string().trim().min(1, 'Enter a list name.'),
})

export function WatchlistsPage({ onOpenMedia }: { onOpenMedia: (media: MediaPreview) => void }) {
  const queryClient = useQueryClient()
  const selectedListId = useAppStore((state) => state.selectedListId)
  const setSelectedListId = useAppStore((state) => state.setSelectedListId)
  const lists = useQuery(listsQuery)
  const activeListId = selectedListId ?? lists.data?.[0]?.id ?? null
  const items = useQuery(listItemsQuery(activeListId))

  useEffect(() => {
    if (!selectedListId && lists.data?.[0]) {
      setSelectedListId(lists.data[0].id)
    }
  }, [lists.data, selectedListId, setSelectedListId])

  const createMutation = useMutation({
    mutationFn: (value: z.infer<typeof createListSchema>) => createList(value.name),
    onSuccess: async (list) => {
      createForm.reset()
      setSelectedListId(list.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
    },
  })

  const createForm = useForm({
    defaultValues: {
      name: '',
    },
    validators: {
      onSubmit: createListSchema,
    },
    onSubmit: ({ value }) => createMutation.mutate(value),
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

  return (
    <div className={cn(pageStack, 'grid-cols-[minmax(240px,330px)_minmax(0,1fr)] items-start max-[800px]:grid-cols-1')}>
      <section>
        <header className={cn(pageHeader, compactHeader)}>
          <h1 className="m-0 leading-[0.95] tracking-normal">Watchlists</h1>
        </header>

        <form
          className="flex items-start gap-2.5 max-[800px]:flex-col max-[800px]:items-stretch"
          onSubmit={(event) => {
            event.preventDefault()
            void createForm.handleSubmit()
          }}
        >
          <createForm.Field name="name">
            {(field) => (
              <div className="grid flex-1 gap-2">
                <Input
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="New list name"
                  aria-invalid={field.state.meta.errors.length ? true : undefined}
                />
                {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
              </div>
            )}
          </createForm.Field>
          <createForm.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
            {(state) => (
              <Button variant="secondary" type="submit" disabled={!canSubmitForm(state, createMutation.isPending)}>
                <Plus aria-hidden="true" />
                Create
              </Button>
            )}
          </createForm.Subscribe>
        </form>

        {lists.isLoading ? <LoadingState label="Loading lists" /> : null}
        {lists.error ? <ErrorState error={lists.error} /> : null}
        {lists.data?.length ? (
          <div className="grid gap-2.5">
            {lists.data.map((list) => (
              <Button
                className={cn(
                  'flex h-auto min-h-[46px] w-full items-center justify-between gap-3.5 rounded-[7px] border border-border bg-card/60 px-3 py-2.5 text-left text-foreground hover:bg-muted',
                  list.id === activeListId && 'border-primary/45 bg-primary/15',
                )}
                variant="ghost"
                type="button"
                key={list.id}
                onClick={() => setSelectedListId(list.id)}
              >
                <span>{list.name}</span>
                <small className="text-muted-foreground">{new Date(list.updated_at).toLocaleDateString()}</small>
              </Button>
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
            <Button className={dangerText} variant="secondary" type="button" onClick={() => deleteMutation.mutate(activeListId)}>
              <Trash2 aria-hidden="true" />
              Delete list
            </Button>
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
