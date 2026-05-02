import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { findWatchState, streamsQuery, watchDataQuery } from "@/api/queries";
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
  const episodes = useMemo(() => parseEpisodes(media.raw), [media.raw]);
  const preferredEpisode = episodes.find(
    (episode) => episode.id === preferredVideoId,
  );
  const preferredSeasonFromSearch =
    preferredSeason === undefined ? undefined : parseSeasonValue(preferredSeason);
  const [selectedSeasonOverride, setSelectedSeasonOverride] = useState<
    number | null
  >(null);
  const seasons = uniqueSeasons(episodes);
  const selectedSeason =
    selectedSeasonOverride ??
    preferredEpisode?.season ??
    preferredSeasonFromSearch ??
    defaultSeason(seasons) ??
    null;
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
        step === "streams" && selectedEpisode ? selectedEpisode.title : ""
      }
      sideContent={
        step === "streams" && selectedEpisode ? (
          <div className="grid min-h-0 gap-4">
            <Button
              className="w-fit"
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setStepOverride("episodes")}
            >
              <ChevronLeft aria-hidden="true" />
              Change Episode
            </Button>
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
            onSeasonChange={onSeasonChange}
            onSelectEpisode={selectEpisode}
          />
        )
      }
    >
      {listAction}
    </DetailShell>
  );
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
    <div className="grid min-h-0 gap-4">
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
            watchState={findWatchState(watchData, episode.id)}
            onClick={() => onSelectEpisode(episode)}
          />
        ))}
      </div>
    </div>
  );
}

function EpisodeButton({
  episode,
  watchState,
  onClick,
}: {
  episode: Episode;
  watchState?: { position_seconds: number };
  onClick: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  const showImage = Boolean(episode.thumbnail) && !imageError;

  return (
    <div className="rounded-lg border border-border bg-card/70">
      <button
        className="grid w-full min-w-0 cursor-pointer grid-cols-[84px_1fr] gap-3 text-left"
        type="button"
        onClick={onClick}
      >
        {showImage ? (
          <div className="h-16 w-24 rounded-l-lg overflow-hidden">
            <img
              src={episode.thumbnail}
              alt={episode.title}
              className="h-16 w-24 object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div
            className="grid h-16 w-24 rounded-l-lg place-items-center bg-muted text-[0.65rem] uppercase tracking-wide text-muted-foreground"
            aria-hidden="true"
          >
            No Image
          </div>
        )}
        <div className="min-w-0 flex flex-col justify-center px-4 p-2.5">
          <strong className="block overflow-hidden text-ellipsis whitespace-nowrap">
            {episode.title}
          </strong>
          {watchState?.position_seconds ? (
            <span className={cn("block text-[0.8rem]", mutedText)}>
              {formatWatchDuration(watchState.position_seconds)}
            </span>
          ) : null}
        </div>
      </button>
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

export function uniqueSeasons(episodes: Episode[]) {
  return Array.from(new Set(episodes.map((episode) => episode.season))).sort(
    (a, b) => {
      if (a === 0) {
        return 1;
      }
      if (b === 0) {
        return -1;
      }
      if (a === null) {
        return 1;
      }
      if (b === null) {
        return -1;
      }
      return a - b;
    },
  );
}

export function defaultSeason(seasons: Array<number | null>) {
  const seasonOne = seasons.find((season) => season === 1);
  if (seasonOne !== undefined) {
    return seasonOne;
  }
  const firstRegularSeason = seasons.find(
    (season): season is number => season !== null && season > 0,
  );
  if (firstRegularSeason !== undefined) {
    return firstRegularSeason;
  }
  return seasons[0] ?? null;
}

export function seasonValue(season: number | null) {
  if (season === 0) {
    return "special";
  }
  return season === null ? "extras" : String(season);
}

export function parseSeasonValue(value: string) {
  if (value === "special") {
    return 0;
  }
  if (value === "extras") {
    return null;
  }
  const season = Number(value);
  return Number.isFinite(season) ? season : null;
}

export function seasonLabel(season: number | null) {
  if (season === 0) {
    return "Special";
  }
  return season === null ? "Extras" : `Season ${season}`;
}

export function episodeLabel(
  episode: Pick<Episode, "season" | "episode" | "released">,
) {
  const parts = [
    episode.season === null || episode.season === 0
      ? undefined
      : `S${episode.season}`,
    episode.episode === null ? undefined : `E${episode.episode}`,
    episode.released?.slice(0, 10),
  ].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Episode";
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
  const minutes = Math.round(duration / 60);
  return `${minutes} min`;
}
