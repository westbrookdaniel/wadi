import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { Plus, Settings, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'

import { createList, deleteList, deleteListItem, listItemsQuery, listsQuery, queryKeys, updateList } from '@/api/queries'
import type { ListItem, MediaPreview } from '@/api/types'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MediaCard } from '@/features/media/media-card'
import { canSubmitForm, fieldError, fieldErrorClass } from '@/lib/form'
import { contentSection, mediaGrid, pageHeader, pageStack } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

const createListSchema = z.object({ name: z.string().trim().min(1, 'Enter a list name.') })
const renameListSchema = z.object({ name: z.string().trim().min(1, 'Enter a list name.') })
const CREATE_LIST_VALUE = '__create_list__'

export function WatchlistsPage({ onOpenMedia }: { onOpenMedia: (media: MediaPreview) => void }) {
  const queryClient = useQueryClient()
  const selectedListId = useAppStore((state) => state.selectedListId)
  const setSelectedListId = useAppStore((state) => state.setSelectedListId)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

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
    mutationFn: (value: z.infer<typeof createListSchema>) => createList(value.name),
    onSuccess: async (list) => {
      createForm.reset()
      setIsCreateOpen(false)
      setSelectedListId(list.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ listId, name }: { listId: string; name: string }) => updateList(listId, name),
    onSuccess: async () => {
      setIsSettingsOpen(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists })
    },
  })

  const deleteListMutation = useMutation({
    mutationFn: (listId: string) => deleteList(listId),
    onSuccess: async () => {
      setIsSettingsOpen(false)
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

  const createForm = useForm({
    defaultValues: { name: '' },
    validators: { onSubmit: createListSchema },
    onSubmit: ({ value }) => createMutation.mutate(value),
  })

  const renameForm = useForm({
    defaultValues: { name: activeList?.name ?? '' },
    validators: { onSubmit: renameListSchema },
    onSubmit: ({ value }) => {
      if (activeList) {
        renameMutation.mutate({ listId: activeList.id, name: value.name })
      }
    },
  })

  useEffect(() => {
    if (isSettingsOpen && activeList) {
      renameForm.reset({ name: activeList.name })
    }
  }, [activeList, isSettingsOpen, renameForm])

  const onSelectList = (value: string) => {
    if (value === CREATE_LIST_VALUE) {
      setIsCreateOpen(true)
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
            <Button variant="secondary" size="icon-sm" type="button" aria-label="List settings" onClick={() => setIsSettingsOpen(true)}>
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create List</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void createForm.handleSubmit()
            }}
          >
            <createForm.Field name="name">
              {(field) => (
                <div className="grid gap-2">
                  <Input value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
                  {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
                </div>
              )}
            </createForm.Field>
            <createForm.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
              {(state) => (
                <DialogFooter>
                  <Button variant="secondary" type="submit" disabled={!canSubmitForm(state, createMutation.isPending)}>
                    Create
                  </Button>
                </DialogFooter>
              )}
            </createForm.Subscribe>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>List Settings</DialogTitle>
            <DialogDescription>Rename this list or delete it.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void renameForm.handleSubmit()
            }}
          >
            <renameForm.Field name="name">
              {(field) => (
                <div className="grid gap-2">
                  <Input value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
                  {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
                </div>
              )}
            </renameForm.Field>
            <DialogFooter className="justify-between">
              <Button
                variant="destructive"
                type="button"
                onClick={() => activeList && deleteListMutation.mutate(activeList.id)}
                disabled={!activeList || deleteListMutation.isPending}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
              <renameForm.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
                {(state) => (
                  <Button variant="secondary" type="submit" disabled={!canSubmitForm(state, renameMutation.isPending)}>
                    Save
                  </Button>
                )}
              </renameForm.Subscribe>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
