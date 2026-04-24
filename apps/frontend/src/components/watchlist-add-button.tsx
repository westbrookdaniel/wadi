import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus } from 'lucide-react'
import { type ChangeEvent } from 'react'

import { addListItem, listItemsQuery, listsQuery, queryKeys } from '@/api/queries'
import type { ListItem, MediaPreview, UserList } from '@/api/types'
import { mutedButton, mutedText, smallButton } from '@/lib/styles'
import { cn } from '@/lib/utils'

export function WatchlistAddButton({ media }: { media: MediaPreview }) {
  const queryClient = useQueryClient()
  const lists = useQuery(listsQuery)
  const listItems = useQueries({
    queries: (lists.data ?? []).map((list) => listItemsQuery(list.id)),
  })
  const addMutation = useMutation({
    mutationFn: (listId: string) => addListItem(listId, media),
    onSuccess: async (_item, listId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.listItems(listId) })
    },
  })

  const savedLists = (lists.data ?? []).filter((_, index) =>
    containsMedia(listItems[index]?.data ?? [], media),
  )
  const hasSavedLists = savedLists.length > 0
  const label = hasSavedLists ? savedLists.map((list) => list.name).join(', ') : 'Add to'

  function onSelect(event: ChangeEvent<HTMLSelectElement>) {
    const listId = event.target.value
    if (listId) {
      addMutation.mutate(listId)
      event.target.value = ''
    }
  }

  if (lists.isLoading) {
    return (
      <button className={cn(mutedButton, smallButton)} type="button" disabled>
        Add to
      </button>
    )
  }

  if (!lists.data?.length) {
    return <p className={mutedText}>Create a watchlist to save this title.</p>
  }

  return (
    <label className="relative inline-grid w-fit max-w-full">
      <span className={cn(mutedButton, smallButton)}>
        {hasSavedLists ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {label}
      </span>
      <select className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Add to watchlist" defaultValue="" onChange={onSelect}>
        <option value="" disabled>
          Choose watchlist
        </option>
        {lists.data.map((list) => (
          <option value={list.id} key={list.id}>
            {optionLabel(list, savedLists)}
          </option>
        ))}
      </select>
    </label>
  )
}

function containsMedia(items: ListItem[], media: MediaPreview) {
  return items.some((item) => item.media_type === media.type && item.media_id === media.id)
}

function optionLabel(list: UserList, savedLists: UserList[]) {
  return savedLists.some((savedList) => savedList.id === list.id) ? `✓ ${list.name}` : list.name
}
