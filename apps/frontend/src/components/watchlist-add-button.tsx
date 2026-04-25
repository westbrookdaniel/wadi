import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus } from 'lucide-react'

import { addListItem, listItemsQuery, listsQuery, queryKeys } from '@/api/queries'
import type { ListItem, MediaPreview, UserList } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { mutedText } from '@/lib/styles'

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

  function onSelect(listId: string) {
    if (listId) {
      addMutation.mutate(listId)
    }
  }

  if (lists.isLoading) {
    return (
      <Button variant="secondary" size="sm" type="button" disabled>
        Add to
      </Button>
    )
  }

  if (!lists.data?.length) {
    return <p className={mutedText}>Create a watchlist to save this title.</p>
  }

  return (
    <Select value="" onValueChange={onSelect} disabled={addMutation.isPending}>
      <SelectTrigger className="w-fit max-w-[min(520px,100%)]" size="sm" aria-label="Add to watchlist">
        {hasSavedLists ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {lists.data.map((list) => (
          <SelectItem value={list.id} key={list.id}>
            {optionLabel(list, savedLists)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function containsMedia(items: ListItem[], media: MediaPreview) {
  return items.some((item) => item.media_type === media.type && item.media_id === media.id)
}

function optionLabel(list: UserList, savedLists: UserList[]) {
  return savedLists.some((savedList) => savedList.id === list.id) ? `Saved: ${list.name}` : list.name
}
