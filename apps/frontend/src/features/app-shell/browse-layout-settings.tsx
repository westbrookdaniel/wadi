import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, GripVertical } from 'lucide-react'
import { useMemo, useState } from 'react'

import { browseLayoutQuery, catalogsQuery, listsQuery, queryKeys, updateBrowseLayout } from '@/api/queries'
import type { BrowseLayout, BrowsePageKey } from '@/api/types'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  buildBrowseRowCandidates,
  createDefaultBrowseLayout,
  normalizeBrowseLayout,
  resolveOrderedBrowseRows,
  type BrowseRowCandidate,
} from '../catalog/browse-layout'

const PAGE_OPTIONS: Array<{ key: BrowsePageKey; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'movies', label: 'Movies' },
  { key: 'series', label: 'Series' },
]

export function BrowseLayoutSettings() {
  const queryClient = useQueryClient()
  const catalogs = useQuery(catalogsQuery)
  const lists = useQuery(listsQuery)
  const browseLayout = useQuery(browseLayoutQuery)
  const [activePage, setActivePage] = useState<BrowsePageKey>('home')
  const [draftLayout, setDraftLayout] = useState<BrowseLayout | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const savedLayout = normalizeBrowseLayout(browseLayout.data ?? createDefaultBrowseLayout())
  const activeLayout = draftLayout ?? savedLayout
  const candidates = useMemo(
    () => buildBrowseRowCandidates(activePage, catalogs.data ?? [], lists.data ?? []),
    [activePage, catalogs.data, lists.data],
  )
  const orderedRows = resolveOrderedBrowseRows(candidates, activeLayout.pages[activePage])

  const saveMutation = useMutation({
    mutationFn: updateBrowseLayout,
    onSuccess: async (saved) => {
      const normalized = normalizeBrowseLayout(saved)
      setDraftLayout(normalized)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.browseLayout }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalogs }),
        queryClient.invalidateQueries({ queryKey: ['continue-watching'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
        queryClient.invalidateQueries({ queryKey: ['list-items'] }),
      ])
    },
  })

  const isLoading = catalogs.isLoading || lists.isLoading || browseLayout.isLoading
  const hasError = catalogs.error || lists.error || browseLayout.error
  const isDirty = JSON.stringify(activeLayout) !== JSON.stringify(savedLayout)

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const pageLayout = activeLayout.pages[activePage]
    const keys = orderedRows.map((row) => row.key)
    const oldIndex = keys.indexOf(String(active.id))
    const newIndex = keys.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const nextOrder = arrayMove(keys, oldIndex, newIndex)
    setDraftLayout((current) => {
      const next = current ?? savedLayout
      return {
        ...next,
        pages: {
          ...next.pages,
          [activePage]: {
            ...pageLayout,
            order: nextOrder,
          },
        },
      }
    })
  }

  const toggleHidden = (rowKey: string) => {
    setDraftLayout((current) => {
      const next = current ?? savedLayout
      const pageLayout = next.pages[activePage]
      const hidden = new Set(pageLayout.hidden)
      if (hidden.has(rowKey)) {
        hidden.delete(rowKey)
      } else {
        hidden.add(rowKey)
      }

      return {
        ...next,
        pages: {
          ...next.pages,
          [activePage]: {
            ...pageLayout,
            hidden: Array.from(hidden),
          },
        },
      }
    })
  }

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-[1.05rem] font-[520] tracking-normal">Customise layout</h3>
          <p className="m-0 text-sm text-muted-foreground">Reorder rows and hide sections for Home, Movies, and Series.</p>
        </div>
        <Button
          type="button"
          onClick={() => saveMutation.mutate(activeLayout)}
          disabled={!isDirty || saveMutation.isPending || isLoading || Boolean(hasError)}
        >
          Save layout
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PAGE_OPTIONS.map((option) => (
          <Button
            key={option.key}
            type="button"
            size="sm"
            variant={activePage === option.key ? 'default' : 'secondary'}
            onClick={() => setActivePage(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {isLoading ? <LoadingState label="Loading browse layout" /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {lists.error ? <ErrorState error={lists.error} /> : null}
      {browseLayout.error ? <ErrorState error={browseLayout.error} /> : null}

      {!isLoading && !hasError && !orderedRows.length ? (
        <EmptyState title="No rows to customize" body="Install addons or create watchlists to populate browse sections." />
      ) : null}

      {!isLoading && !hasError && orderedRows.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedRows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
            <ul className="m-0 grid max-h-[360px] list-none gap-2 overflow-y-auto pr-1 p-0">
              {orderedRows.map((row) => {
                const isHidden = activeLayout.pages[activePage].hidden.includes(row.key)
                return (
                  <SortableLayoutRow
                    key={row.key}
                    row={row}
                    showCatalogType={activePage === 'home'}
                    hidden={isHidden}
                    onToggleHidden={() => toggleHidden(row.key)}
                  />
                )
              })}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
    </section>
  )
}

function SortableLayoutRow({
  row,
  showCatalogType,
  hidden,
  onToggleHidden,
}: {
  row: BrowseRowCandidate
  showCatalogType: boolean
  hidden: boolean
  onToggleHidden: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-background/80 p-2.5',
        isDragging && 'shadow-lg',
      )}
    >
      <button
        type="button"
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        aria-label={`Drag ${row.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="m-0 flex items-center gap-2 truncate text-sm font-medium">
          <span className="truncate">{row.title}</span>
          {showCatalogType && row.kind === 'catalog' && row.catalogEntry ? (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {row.catalogEntry.catalog.type === 'series' ? 'Series' : 'Movies'}
            </span>
          ) : null}
        </p>
        <p className="m-0 truncate text-xs text-muted-foreground">{row.subtitle ?? row.key}</p>
      </div>
      <Button type="button" size="icon-sm" variant={hidden ? 'secondary' : 'ghost'} onClick={onToggleHidden} aria-label={hidden ? `Show ${row.title}` : `Hide ${row.title}`}>
        {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </li>
  )
}
