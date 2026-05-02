import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { addonsQuery } from '@/api/queries'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { bottomPagePadding, mutedText } from '@/lib/styles'
import { cn } from '@/lib/utils'

import type { PlayableStream } from './types'

const FILTER_ALL = '__all__'
type StreamRow = {
  stream: PlayableStream
  index: number
  sourceKey: string
  sourceLabel: string
}

export function StreamList({
  streams,
  isLoading,
  onPlay,
}: {
  streams: PlayableStream[]
  isLoading: boolean
  onPlay: (stream: PlayableStream) => void
}) {
  const addons = useQuery(addonsQuery)
  const sourceLabelsById = useMemo(() => {
    const map = new Map<string, string>()
    for (const addon of addons.data ?? []) {
      map.set(addon.id, addon.manifest.name ?? addon.source_url ?? addon.id)
    }
    return map
  }, [addons.data])
  const rows = useMemo<StreamRow[]>(
    () =>
      streams.map((stream, index) =>
        normalizeStreamRow(stream, index, sourceLabelsById),
      ),
    [sourceLabelsById, streams],
  )
  const [filterValue, setFilterValue] = useState<string>(FILTER_ALL)
  const filterOptions = useMemo(() => buildFilterOptions(rows), [rows])
  const activeFilterValue =
    filterValue === FILTER_ALL || filterOptions.some((option) => option.value === filterValue)
      ? filterValue
      : FILTER_ALL
  const filteredRows = useMemo(
    () =>
      activeFilterValue === FILTER_ALL
        ? rows
        : rows.filter((row) => row.sourceKey === activeFilterValue),
    [activeFilterValue, rows],
  )

  if (isLoading) {
    return <StreamListSkeleton />
  }

  if (!streams.length) {
    return <p className={mutedText}>No streams returned.</p>
  }

  return (
    <div className="grid min-h-0 gap-3.5">
      <div className="grid gap-2">
        <Select value={activeFilterValue} onValueChange={setFilterValue}>
          <SelectTrigger className="w-full justify-between rounded-lg border border-border bg-card/70 px-2.5 text-sm" aria-label="Source filter">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL}>All sources</SelectItem>
            {filterOptions.map((source) => (
              <SelectItem key={source.value} value={source.value}>
                {source.label} ({source.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!filteredRows.length ? (
        <p className={mutedText}>No streams match this filter.</p>
      ) : (
        <div className={cn("flex flex-col gap-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]", bottomPagePadding)}>
          {filteredRows.map(({ stream, index, sourceLabel }, i) => (
            <button
              className="grid h-fit cursor-pointer content-between gap-2.5 rounded-lg border border-border bg-card/80 p-3.5 text-left text-card-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none [&_small]:text-[0.76rem] [&_small]:text-primary [&_span]:text-muted-foreground"
              type="button"
              key={`${i}-${stream.addon_id}-${stream.title ?? stream.name ?? index}`}
              onClick={() => onPlay(stream)}
            >
              <p className="font-bold line">{stream.title ?? stream.name ?? `Stream ${index + 1}`}</p>
              <p className="max-w-full break-all">{streamDetail(stream)}</p>
              <p className="text-xs text-muted-foreground max-w-full break-all">{sourceLabel}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function StreamListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className={cn("flex flex-col gap-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]", bottomPagePadding)}
      role="status"
      aria-label="Loading streams"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div className="grid gap-2.5 rounded-lg border border-border bg-card/70 p-3.5" key={index}>
          <Skeleton className="h-4 w-[62%] rounded-full" />
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-3 w-[46%] rounded-full" />
        </div>
      ))}
    </div>
  )
}

function streamDetail(stream: PlayableStream) {
  const behaviorHints =
    stream.behaviorHints && typeof stream.behaviorHints === 'object'
      ? (stream.behaviorHints as Record<string, unknown>)
      : {}
  const parts = [
    stringValue(stream.quality),
    stringValue(behaviorHints.filename),
    stringValue(stream.description),
    stream.infoHash ? 'Torrent' : undefined,
  ].filter(Boolean)

  return parts.length ? parts.join(' • ') : stream.url ? 'Direct browser-playable stream' : 'Addon stream'
}

function normalizeStreamRow(
  stream: PlayableStream,
  index: number,
  sourceLabelsById: Map<string, string>,
): StreamRow {
  const source = streamSource(stream, sourceLabelsById)

  return {
    stream,
    index,
    sourceKey: source.key,
    sourceLabel: source.label,
  }
}

function buildFilterOptions(rows: StreamRow[]) {
  const map = new Map<string, { label: string; count: number }>()
  for (const row of rows) {
    const value = row.sourceKey
    const label = row.sourceLabel
    const existing = map.get(value)
    if (existing) {
      existing.count += 1
    } else {
      map.set(value, { label, count: 1 })
    }
  }
  return Array.from(map.entries())
    .map(([value, data]) => ({ value, label: data.label, count: data.count }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function streamSource(
  stream: PlayableStream,
  sourceLabelsById: Map<string, string>,
) {
  if (stream.addon_id) {
    return {
      key: `addon:${stream.addon_id}`,
      label: sourceLabelsById.get(stream.addon_id) ?? stream.addon_id,
    }
  }

  if (stream.url) {
    try {
      const hostname = new URL(stream.url).hostname
      return { key: `url:${hostname}`, label: hostname }
    } catch {
      // Ignore invalid URLs and fall through.
    }
  }

  if (stream.externalUrl) {
    try {
      const hostname = new URL(stream.externalUrl).hostname
      return { key: `external:${hostname}`, label: hostname }
    } catch {
      return { key: 'external:unknown', label: 'External stream' }
    }
  }

  return { key: 'unknown', label: 'Unknown source' }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
