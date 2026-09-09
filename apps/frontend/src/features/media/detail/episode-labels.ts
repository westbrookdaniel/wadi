import type { Episode } from './types'

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

