import { describe, expect, it } from "vitest";

import {
  defaultSeason,
  episodeLabel,
  parseSeasonValue,
  seasonLabel,
  seasonValue,
  uniqueSeasons,
} from "./series-detail";

describe("series season helpers", () => {
  it("sorts season 0 to the end after numbered seasons", () => {
    const seasons = uniqueSeasons([
      { id: "a", title: "A", season: 2, episode: 1 },
      { id: "b", title: "B", season: 0, episode: 1 },
      { id: "c", title: "C", season: 1, episode: 1 },
    ]);

    expect(seasons).toEqual([1, 2, 0]);
    expect(seasons.map((season) => seasonLabel(season))).toEqual([
      "Season 1",
      "Season 2",
      "Special",
    ]);
  });

  it("maps season 0 to Special label", () => {
    expect(seasonLabel(0)).toBe("Special");
  });

  it("maps Special season selector value back to season 0", () => {
    expect(seasonValue(0)).toBe("special");
    expect(parseSeasonValue("special")).toBe(0);
  });

  it("defaults to season 1 before Special", () => {
    const seasons = uniqueSeasons([
      { id: "a", title: "A", season: 0, episode: 1 },
      { id: "b", title: "B", season: 1, episode: 1 },
      { id: "c", title: "C", season: 2, episode: 1 },
    ]);
    expect(defaultSeason(seasons)).toBe(1);
  });

  it("falls back to Special when no regular seasons exist", () => {
    expect(defaultSeason([0, null])).toBe(0);
  });

  it("omits S0 in episode label for special episodes", () => {
    expect(episodeLabel({ season: 0, episode: 1, released: "2024-01-01" })).toBe(
      "E1 • 2024-01-01",
    );
    expect(episodeLabel({ season: 2, episode: 1, released: "2024-01-01" })).toBe(
      "S2 • E1 • 2024-01-01",
    );
  });
});
