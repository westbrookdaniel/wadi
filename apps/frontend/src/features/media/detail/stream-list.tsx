import { useMemo, useState } from 'react'

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
  const rows = useMemo<StreamRow[]>(
    () => streams.map((stream, index) => normalizeStreamRow(stream, index)),
    [streams],
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
        <p className={cn("m-0 text-xs font-medium", mutedText)}>Source</p>
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
        <p className={cn('m-0 text-xs', mutedText)}>
          Showing {filteredRows.length} of {rows.length} streams
        </p>
      </div>

      {!filteredRows.length ? (
        <p className={mutedText}>No streams match this filter.</p>
      ) : (
        <div className={cn("flex flex-col gap-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]", bottomPagePadding)}>
          {filteredRows.map(({ stream, index, sourceLabel }) => (
            <button
              className="grid h-fit cursor-pointer content-between gap-2.5 rounded-lg border border-border bg-card/80 p-3.5 text-left text-card-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none [&_small]:text-[0.76rem] [&_small]:text-primary [&_span]:text-muted-foreground"
              type="button"
              key={`${stream.addon_id}-${stream.title ?? stream.name ?? index}`}
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

function normalizeStreamRow(stream: PlayableStream, index: number): StreamRow {
  const sourceLabel = streamSource(stream)

  return {
    stream,
    index,
    sourceKey: `source:${sourceLabel.toLowerCase()}`,
    sourceLabel,
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

function streamSource(stream: PlayableStream) {
  if (stream.url) {
    return new URL(stream.url).hostname
  }

  if (stream.externalUrl) {
    try {
      return new URL(stream.externalUrl).hostname
    } catch {
      return 'External stream'
    }
  }

  return stream.addon_id ?? 'Unknown source'
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
