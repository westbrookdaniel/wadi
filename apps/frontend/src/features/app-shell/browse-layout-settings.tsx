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
import type { BrowseLayout } from '@/api/types'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { SettingsSelect } from '@/components/ui/settings-select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  buildBrowseRowCandidates,
  createDefaultBrowseLayout,
  normalizeBrowseLayout,
  resolveOrderedBrowseRows,
  type BrowseRowCandidate,
} from '../catalog/browse-layout'

export function BrowseLayoutSettings() {
  const queryClient = useQueryClient()
  const catalogs = useQuery(catalogsQuery)
  const lists = useQuery(listsQuery)
  const browseLayout = useQuery(browseLayoutQuery)
  const activePage = 'home'
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
    () => buildBrowseRowCandidates(catalogs.data ?? [], lists.data ?? []),
    [activePage, catalogs.data, lists.data],
  )
  const resolvedRows = resolveOrderedBrowseRows(candidates, activeLayout.pages[activePage])
  const orderedRows = [...resolvedRows.filter(row => row.kind === 'continue'), ...resolvedRows.filter(row => row.kind !== 'continue')]

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
    const keys = orderedRows.filter(row => row.kind !== 'continue').map((row) => row.key)
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
          <h3 className="m-0 text-[1.05rem] font-[520] tracking-normal">Home layout</h3>
          <p className="m-0 text-sm text-muted-foreground">Reorder rows and hide sections on Home.</p>
        </div>
        <Button
          type="button"
          onClick={() => saveMutation.mutate(activeLayout)}
          disabled={!isDirty || saveMutation.isPending || isLoading || Boolean(hasError)}
        >
          Save layout
        </Button>
      </div>

      {isLoading ? <LoadingState label="Loading browse layout" /> : null}
      {saveMutation.error ? <ErrorState error={saveMutation.error} /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {lists.error ? <ErrorState error={lists.error} /> : null}
      {browseLayout.error ? <ErrorState error={browseLayout.error} /> : null}

      {!isLoading && !hasError && !orderedRows.length ? (
        <EmptyState title="No rows to customize" body="Install addons or create watchlists to populate browse sections." />
      ) : null}

      {!isLoading && !hasError && orderedRows.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedRows.filter(row => row.kind !== 'continue').map((row) => row.key)} strategy={verticalListSortingStrategy}>
            <ul className="m-0 grid min-w-0 max-h-[420px] list-none gap-2 overflow-y-auto pr-1 p-0">
              {orderedRows.map((row) => {
                const isHidden = activeLayout.pages[activePage].hidden.includes(row.key)
                return (
                  <SortableLayoutRow
                    key={row.key}
                    row={row}
                    mode={activeLayout.pages[activePage].catalogModes?.[row.key] ?? 'combined'}
                    onModeChange={mode => setDraftLayout(current => {
                      const next = current ?? savedLayout;
                      const page = next.pages[activePage];
                      return { ...next, pages: { ...next.pages, [activePage]: { ...page, catalogModes: { ...page.catalogModes, [row.key]: mode } } } };
                    })}
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
  mode,
  onModeChange,
  hidden,
  onToggleHidden,
}: {
  row: BrowseRowCandidate
  mode: "combined" | "movie" | "series"
  onModeChange: (mode: "combined" | "movie" | "series") => void
  hidden: boolean
  onToggleHidden: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key, disabled: row.kind === 'continue' })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-background/80 p-2.5',
        isDragging && 'shadow-lg',
      )}
    >
      {row.kind !== 'continue' ? <button
        type="button"
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        aria-label={`Drag ${row.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button> : null}
      <div className="min-w-0 flex-1">
        <p className="m-0 flex items-center gap-2 truncate text-sm font-medium">
          <span className="truncate">{row.title}</span>
        </p>
        <p className="m-0 truncate text-xs text-muted-foreground">{row.subtitle ?? (row.kind === 'continue' ? 'Resume playback' : 'Your list')}</p>
      </div>
      {(row.catalogEntries?.length ?? 0) > 1 ? (
        <SettingsSelect className="w-[112px] shrink-0" aria-label={`${row.title} content`} value={mode} onValueChange={value => { if (value === 'combined' || value === 'movie' || value === 'series') onModeChange(value) }}>
          <option value="combined">Combined</option><option value="movie">Movies</option><option value="series">TV shows</option>
        </SettingsSelect>
      ) : null}
      <Button type="button" size="icon-sm" variant={hidden ? 'secondary' : 'ghost'} onClick={onToggleHidden} aria-label={hidden ? `Show ${row.title}` : `Hide ${row.title}`}>
        {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </li>
  )
}
