import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WatchedButton } from './watch-state'
import { useWatchToggle } from './use-watch-toggle'
import { Artwork } from '@/components/artwork'
import { uniqueSeasons, defaultSeason, seasonValue, parseSeasonValue, seasonLabel } from './episode-labels'
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { episodesQuery, streamsQuery, watchDataQuery } from "@/api/queries";
import type { MediaPreview, WatchDataResponse } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bottomPagePadding, mutedText } from "@/lib/styles";
import { cn } from "@/lib/utils";

import { useAppStore } from '@/store/app-store'
import { readLastSeason, saveLastSeason, formatEpisodeReleaseDate } from './series-url-state'
import { DetailShell } from "./detail-shell";
import { StreamList } from "./stream-list";
import type { Episode, PlaybackTarget, PlayableStream } from "./types";

type SeriesStep = "episodes" | "streams";

export function SeriesDetailPage({
  media,
  listAction,
  preferredVideoId,
  preferredSeason,
  onSelectionChange,
  onBack,
  onPlay,
}: {
  media: MediaPreview;
  listAction?: React.ReactNode;
  preferredVideoId?: string | null;
  preferredSeason?: string;
  onSelectionChange?: (selection: {
    season: number | null;
    episodeId: string | null;
  }) => void;
  onBack: () => void;
  onPlay: (stream: PlayableStream, target: PlaybackTarget) => void;
}) {
  const profileId = useAppStore(state => state.activeProfileId)
  const episodeCatalog = useQuery(episodesQuery(media.id, profileId))
  const episodes = useMemo(() => episodeCatalog.data && (!episodeCatalog.data.stale || episodeCatalog.data.items.length) ? episodeCatalog.data.items : parseEpisodes(media.raw), [episodeCatalog.data, media.raw]);
  const preferredEpisode = episodes.find(
    (episode) => episode.id === preferredVideoId,
  );
  const preferredSeasonFromSearch =
    preferredSeason === undefined ? undefined : parseSeasonValue(preferredSeason);
  const [selectedSeasonOverride, setSelectedSeasonOverride] = useState<
    number | null | undefined
  >(undefined);
  const seasons = uniqueSeasons(episodes);
  const rememberedSeason = useMemo(() => readLastSeason(profileId, media.id), [profileId, media.id])
  const selectedSeason = selectedSeasonOverride !== undefined ? selectedSeasonOverride
    : preferredEpisode ? preferredEpisode.season
    : preferredSeasonFromSearch !== undefined ? preferredSeasonFromSearch
    : rememberedSeason !== undefined && seasons.includes(rememberedSeason) ? rememberedSeason
    : defaultSeason(seasons) ?? null
  useEffect(() => {
    if (episodes.length) saveLastSeason(profileId, media.id, selectedSeason)
  }, [episodes.length, media.id, profileId, selectedSeason])
  const visibleEpisodes = episodes.filter(
    (episode) => episode.season === selectedSeason,
  );
  const [selectedEpisodeIdOverride, setSelectedEpisodeIdOverride] = useState<
    string | null
  >(null);
  const selectedEpisodeId =
    selectedEpisodeIdOverride ?? preferredEpisode?.id ?? null;
  const [stepOverride, setStepOverride] = useState<SeriesStep | null>(null);
  const step = stepOverride ?? (preferredEpisode ? "streams" : "episodes");
  const selectedEpisode =
    episodes.find((episode) => episode.id === selectedEpisodeId) ?? null;
  const streams = useQuery(
    streamsQuery(
      media.type,
      selectedEpisode?.id ?? "",
      Boolean(selectedEpisode),
    ),
  );
  const watchData = useQuery(
    watchDataQuery(media.type, media.id, Boolean(media)),
  );

  const selectEpisode = (episode: Episode) => {
    setSelectedEpisodeIdOverride(episode.id);
    setSelectedSeasonOverride(episode.season);
    onSelectionChange?.({ season: episode.season, episodeId: episode.id });
    setStepOverride("streams");
  };

  const onSeasonChange = (season: number | null) => {
    setSelectedSeasonOverride(season);
    setSelectedEpisodeIdOverride((currentEpisodeId) => {
      if (!currentEpisodeId) {
        return null;
      }
      const currentEpisode = episodes.find(
        (episode) => episode.id === currentEpisodeId,
      );
      return currentEpisode?.season === season ? currentEpisodeId : null;
    });
    const currentEpisode = episodes.find(
      (episode) => episode.id === selectedEpisodeId,
    );
    onSelectionChange?.({
      season,
      episodeId: currentEpisode?.season === season ? currentEpisode.id : null,
    });
  };

  return (
    <DetailShell
      media={media}
      onBack={onBack}
      sideLabel={
        step === "streams" ? "Available streams" : "Available episodes"
      }
      sideTitle={
        step === "streams" && selectedEpisode ? selectedEpisode.title : "Episodes"
      }
      sideContent={
        step === "streams" && selectedEpisode ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Button
              className="w-fit"
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setStepOverride("episodes");
                setSelectedEpisodeIdOverride(null);
                onSelectionChange?.({ season: selectedSeason, episodeId: null });
              }}
            >
              <ChevronLeft aria-hidden="true" />
              Change Episode
            </Button>
            {streams.error ? <p role="alert" className="text-xs text-destructive">{streams.error.message}</p> : null}
            <StreamList
              streams={streams.data ?? []}
              isLoading={streams.isLoading}
              onPlay={(stream) =>
                onPlay(stream, {
                  mediaType: media.type,
                  mediaId: media.id,
                  overrideMediaId: media.id,
                  videoId: selectedEpisode.id,
                  seriesEpisodes: episodes,
                  episodeContext: {
                    season: selectedEpisode.season,
                    episode: selectedEpisode.episode,
                    title: selectedEpisode.title,
                  },
                })
              }
            />
          </div>
        ) : (
          <EpisodeSelector
            media={media}
            episodes={episodes}
            seasons={seasons}
            selectedSeason={selectedSeason}
            visibleEpisodes={visibleEpisodes}
            watchData={watchData.data}
            onSeasonChange={onSeasonChange}
            onSelectEpisode={selectEpisode}
          />
        )
      }
    >
      {listAction}
      {watchData.error ? <p role="alert" className="text-xs text-destructive">{watchData.error.message}</p> : null}
    </DetailShell>
  );
}

function EpisodeSelector({
  media,
  episodes,
  seasons,
  selectedSeason,
  visibleEpisodes,
  watchData,
  onSeasonChange,
  onSelectEpisode,
}: {
  media: MediaPreview;
  episodes: Episode[];
  seasons: Array<number | null>;
  selectedSeason: number | null;
  visibleEpisodes: Episode[];
  watchData: WatchDataResponse | undefined;
  onSeasonChange: (season: number | null) => void;
  onSelectEpisode: (episode: Episode) => void;
}) {
  if (!episodes.length) {
    return <p className={mutedText}>No episodes returned for this series.</p>;
  }
  const currentSeasonIndex = seasons.findIndex(
    (season) => season === selectedSeason,
  );
  const hasPreviousSeason = currentSeasonIndex > 0;
  const hasNextSeason =
    currentSeasonIndex >= 0 && currentSeasonIndex < seasons.length - 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous season"
          disabled={!hasPreviousSeason}
          onClick={() => {
            if (!hasPreviousSeason) return;
            onSeasonChange(seasons[currentSeasonIndex - 1] ?? null);
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Select
          value={seasonValue(selectedSeason)}
          onValueChange={(value) => onSeasonChange(parseSeasonValue(value))}
        >
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next season"
          disabled={!hasNextSeason}
          onClick={() => {
            if (!hasNextSeason) return;
            onSeasonChange(seasons[currentSeasonIndex + 1] ?? null);
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div
        className={cn(
          "grid gap-2 overflow-y-auto pr-1 [scrollbar-width:thin]",
          bottomPagePadding,
        )}
      >
        {visibleEpisodes.map((episode) => (
          <EpisodeButton
            key={episode.id}
            episode={episode}
            media={media}
            watchState={watchData?.items.filter(state => (episode.videoIds ?? [episode.id]).includes(state.video_id ?? "")).sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0]}
            watchUnavailable={!watchData}
            onClick={() => onSelectEpisode(episode)}
          />
        ))}
      </div>
    </div>
  );
}

function EpisodeButton({
  media,
  episode,
  watchState,
  watchUnavailable,
  onClick,
}: {
  episode: Episode;
  media: MediaPreview;
  watchUnavailable: boolean;
  watchState?: { position_seconds: number; duration_seconds?: number | null; watched: boolean };
  onClick: () => void;
}) {
  const toggle = useWatchToggle(media.type, media.id, episode.id)
  return (
    <div className="rounded-lg border border-border bg-card/50">
      <div className="flex items-center gap-1 pr-2">
      <button
        className="grid flex-1 min-w-0 cursor-pointer grid-cols-[80px_1fr] gap-2 text-left"
        type="button"
        onClick={onClick}
      >
        <Artwork src={episode.thumbnail} className="h-16 w-20 rounded-l-lg" />
        <div className="min-w-0 flex flex-col justify-center py-2 pr-1">
          <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium">
            {episode.title}
          </strong>
          {formatEpisodeReleaseDate(episode.released) ? <time dateTime={episode.released} className="mt-0.5 block text-xs text-muted-foreground">{formatEpisodeReleaseDate(episode.released)}</time> : null}

        </div>
      </button>
      {watchState && watchState.position_seconds > 0 && !watchState.watched ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} aria-label={`${formatWatchDuration(watchState.position_seconds)} watched`} className="mr-2 inline-flex shrink-0 rounded-full text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" pathLength="100" strokeDasharray={`${watchState.duration_seconds ? Math.min(100, Math.max(0, watchState.position_seconds / watchState.duration_seconds * 100)) : 0} 100`} />
              </svg>
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatWatchDuration(watchState.position_seconds)} watched{watchState.duration_seconds ? ` of ${formatWatchDuration(watchState.duration_seconds)}` : ''}</TooltipContent>
        </Tooltip>
      ) : null}
      <WatchedButton compact title={episode.title} watched={watchState?.watched ?? false} isPending={toggle.isPending || watchUnavailable} onClick={() => toggle.mutate(!watchState?.watched)} />
      </div>
      {toggle.error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{toggle.error.message}</p> : null}
    </div>
  );
}

function parseEpisodes(raw: Record<string, unknown>): Episode[] {
  const videos = Array.isArray(raw.videos) ? raw.videos : [];
  return videos.flatMap((value) => {
    if (!value || typeof value !== "object") {
      return [];
    }
    const video = value as Record<string, unknown>;
    const id = stringValue(video.id);
    if (!id) {
      return [];
    }
    const season = numberValue(video.season);
    const episode = numberValue(video.episode);
    const fallbackTitle = [
      season === null ? undefined : `S${season}`,
      episode === null ? undefined : `E${episode}`,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      id,
      title:
        (stringValue(video.title) ??
          stringValue(video.name) ??
          fallbackTitle) ||
        id,
      season,
      episode,
      released: stringValue(video.released),
      overview: stringValue(video.overview) ?? stringValue(video.description),
      thumbnail: stringValue(video.thumbnail) ?? stringValue(video.poster),
    };
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function formatWatchDuration(duration: number) {
  if (!Number.isFinite(duration)) {
    return "Unknown duration";
  }
  const seconds = Math.max(0, Math.floor(duration));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
