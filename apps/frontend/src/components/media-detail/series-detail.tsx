import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { findWatchState, streamsQuery, watchDataQuery } from '@/api/queries'
import type { MediaPreview, WatchDataResponse } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { mutedText } from '@/lib/styles'
import { cn } from '@/lib/utils'

import { DetailShell } from './detail-shell'
import { StreamList } from './stream-list'
import type { Episode, PlaybackTarget, PlayableStream } from './types'

type SeriesStep = 'episodes' | 'streams'

export function SeriesDetailPage({
  media,
  listAction,
  preferredVideoId,
  onBack,
  onPlay,
}: {
  media: MediaPreview
  listAction?: React.ReactNode
  preferredVideoId?: string | null
  onBack: () => void
  onPlay: (stream: PlayableStream, target: PlaybackTarget) => void
}) {
  const episodes = useMemo(() => parseEpisodes(media.raw), [media.raw])
  const preferredEpisode = episodes.find((episode) => episode.id === preferredVideoId)
  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    preferredEpisode?.season ?? episodes[0]?.season ?? null,
  )
  const visibleEpisodes = episodes.filter((episode) => episode.season === selectedSeason)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(preferredEpisode?.id ?? null)
  const [step, setStep] = useState<SeriesStep>(preferredEpisode ? 'streams' : 'episodes')
  const selectedEpisode = episodes.find((episode) => episode.id === selectedEpisodeId) ?? null
  const streams = useQuery(streamsQuery(media.type, selectedEpisode?.id ?? '', Boolean(selectedEpisode)))
  const watchData = useQuery(watchDataQuery(media.type, media.id, Boolean(media)))
  const seasons = uniqueSeasons(episodes)

  useEffect(() => {
    if (preferredEpisode) {
      setSelectedSeason(preferredEpisode.season)
      setSelectedEpisodeId(preferredEpisode.id)
      setStep('streams')
    }
  }, [preferredEpisode])

  useEffect(() => {
    if (selectedSeason === null && episodes[0]) {
      setSelectedSeason(episodes[0].season)
    }
  }, [episodes, selectedSeason])

  const selectEpisode = (episode: Episode) => {
    setSelectedEpisodeId(episode.id)
    setStep('streams')
  }

  return (
    <DetailShell
      media={media}
      onBack={onBack}
      sideLabel={step === 'streams' ? 'Available streams' : 'Available episodes'}
      sideTitle={step === 'streams' && selectedEpisode ? selectedEpisode.title : 'Select Episode'}
      sideContent={
        step === 'streams' && selectedEpisode ? (
          <div className="grid min-h-0 gap-4">
            <Button className="w-fit" type="button" size="sm" variant="secondary" onClick={() => setStep('episodes')}>
              <ChevronLeft aria-hidden="true" />
              Change Episode
            </Button>
            <p className={cn('m-0', mutedText)}>{episodeLabel(selectedEpisode)}</p>
            <StreamList
              streams={streams.data ?? []}
              isLoading={streams.isLoading}
              onPlay={(stream) =>
                onPlay(stream, {
                  mediaType: media.type,
                  mediaId: media.id,
                  videoId: selectedEpisode.id,
                })
              }
            />
          </div>
        ) : (
          <EpisodeSelector
            episodes={episodes}
            seasons={seasons}
            selectedSeason={selectedSeason}
            visibleEpisodes={visibleEpisodes}
            watchData={watchData.data}
            onSeasonChange={setSelectedSeason}
            onSelectEpisode={selectEpisode}
          />
        )
      }
    >
      {selectedEpisode ? (
        <p className={cn('m-0 max-w-[680px]', mutedText)}>
          {episodeLabel(selectedEpisode)}
        </p>
      ) : null}
      {listAction}
    </DetailShell>
  )
}

function EpisodeSelector({
  episodes,
  seasons,
  selectedSeason,
  visibleEpisodes,
  watchData,
  onSeasonChange,
  onSelectEpisode,
}: {
  episodes: Episode[]
  seasons: Array<number | null>
  selectedSeason: number | null
  visibleEpisodes: Episode[]
  watchData: WatchDataResponse | undefined
  onSeasonChange: (season: number | null) => void
  onSelectEpisode: (episode: Episode) => void
}) {
  if (!episodes.length) {
    return <p className={mutedText}>No episodes returned for this series.</p>
  }

  return (
    <div className="grid min-h-0 gap-4">
      <Select value={seasonValue(selectedSeason)} onValueChange={(value) => onSeasonChange(parseSeasonValue(value))}>
        <SelectTrigger className="w-full" aria-label="Season">
          <SelectValue placeholder="Season" />
        </SelectTrigger>
        <SelectContent>
          {seasons.map((season) => (
            <SelectItem key={seasonValue(season)} value={seasonValue(season)}>
              {seasonLabel(season)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid max-h-[56svh] gap-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
        {visibleEpisodes.map((episode) => (
          <EpisodeButton
            key={episode.id}
            episode={episode}
            watchState={findWatchState(watchData, episode.id)}
            onClick={() => onSelectEpisode(episode)}
          />
        ))}
      </div>
    </div>
  )
}

function EpisodeButton({
  episode,
  watchState,
  onClick,
}: {
  episode: Episode
  watchState?: { position_seconds: number }
  onClick: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-2.5">
      <button className="block w-full min-w-0 cursor-pointer text-left" type="button" onClick={onClick}>
        <strong className="block overflow-hidden text-ellipsis whitespace-nowrap">{episode.title}</strong>
        <span className={cn('text-[0.8rem]', mutedText)}>{episodeLabel(episode)}</span>
        {watchState?.position_seconds ? (
          <span className={cn('block text-[0.8rem]', mutedText)}>
            {formatDuration(watchState.position_seconds)}
          </span>
        ) : null}
      </button>
    </div>
  )
}

function parseEpisodes(raw: Record<string, unknown>): Episode[] {
  const videos = Array.isArray(raw.videos) ? raw.videos : []
  return videos.flatMap((value) => {
    if (!value || typeof value !== 'object') {
      return []
    }
    const video = value as Record<string, unknown>
    const id = stringValue(video.id)
    if (!id) {
      return []
    }
    const season = numberValue(video.season)
    const episode = numberValue(video.episode)
    const fallbackTitle = [season === null ? undefined : `S${season}`, episode === null ? undefined : `E${episode}`]
      .filter(Boolean)
      .join(' ')
    return {
      id,
      title: (stringValue(video.title) ?? stringValue(video.name) ?? fallbackTitle) || id,
      season,
      episode,
      released: stringValue(video.released),
      overview: stringValue(video.overview) ?? stringValue(video.description),
      thumbnail: stringValue(video.thumbnail) ?? stringValue(video.poster),
    }
  })
}

function uniqueSeasons(episodes: Episode[]) {
  return Array.from(new Set(episodes.map((episode) => episode.season))).sort((a, b) => {
    if (a === null) {
      return 1
    }
    if (b === null) {
      return -1
    }
    return a - b
  })
}

function seasonValue(season: number | null) {
  return season === null ? 'extras' : String(season)
}

function parseSeasonValue(value: string) {
  if (value === 'extras') {
    return null
  }
  const season = Number(value)
  return Number.isFinite(season) ? season : null
}

function seasonLabel(season: number | null) {
  return season === null ? 'Extras' : `Season ${season}`
}

function episodeLabel(episode: Pick<Episode, 'season' | 'episode' | 'released'>) {
  const parts = [
    episode.season === null ? undefined : `S${episode.season}`,
    episode.episode === null ? undefined : `E${episode.episode}`,
    episode.released?.slice(0, 10),
  ].filter(Boolean)
  return parts.length ? parts.join(' • ') : 'Episode'
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }
  return null
}

function formatDuration(duration: number) {
  if (!Number.isFinite(duration)) {
    return 'Unknown duration'
  }

  const minutes = Math.round(duration / 60)
  return `${minutes} min`
}
