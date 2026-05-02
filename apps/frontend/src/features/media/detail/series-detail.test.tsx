import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";

import type { MediaPreview } from "@/api/types";

import {
  SeriesDetailPage,
  defaultSeason,
  episodeLabel,
  parseSeasonValue,
  seasonLabel,
  seasonValue,
  uniqueSeasons,
} from "./series-detail";

const apiRequestMock = vi.fn();

vi.mock("@/api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

function createMedia(): MediaPreview {
  return {
    id: "series-1",
    type: "series",
    name: "Series One",
    raw: {
      videos: [
        {
          id: "s1e1",
          title: "Pilot",
          season: 1,
          episode: 1,
          released: "2024-01-01",
        },
        {
          id: "s2e1",
          title: "Premiere",
          season: 2,
          episode: 1,
          released: "2025-01-01",
        },
      ],
    },
  };
}

function renderSeriesDetailPage({
  preferredVideoId,
  preferredSeason,
  onSelectionChange,
}: {
  preferredVideoId?: string | null;
  preferredSeason?: string;
  onSelectionChange?: (selection: {
    season: number | null;
    episodeId: string | null;
  }) => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const media = createMedia();
  return render(
    <QueryClientProvider client={queryClient}>
      <SeriesDetailPage
        media={media}
        preferredVideoId={preferredVideoId}
        preferredSeason={preferredSeason}
        onSelectionChange={onSelectionChange}
        onBack={() => {}}
        onPlay={() => {}}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  apiRequestMock.mockReset();
});

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

describe("SeriesDetailPage", () => {
  it("does not render season/episode/date metadata in series details", async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/streams/")) {
        return Promise.resolve({ responses: [] });
      }
      if (path.startsWith("/api/watch-data/")) {
        return Promise.resolve({
          media_type: "series",
          media_id: "series-1",
          items: [],
        });
      }
      if (path === "/api/addons") {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({});
    });

    renderSeriesDetailPage({ preferredVideoId: "s1e1" });

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    expect(screen.getByText("Pilot")).toBeInTheDocument();
    expect(
      screen.queryByText("S1 • E1 • 2024-01-01"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("E1 • 2024-01-01")).not.toBeInTheDocument();
  });

  it("emits URL selection payload when season and episode change", async () => {
    const onSelectionChange = vi.fn();
    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/watch-data/")) {
        return Promise.resolve({
          media_type: "series",
          media_id: "series-1",
          items: [],
        });
      }
      if (path.startsWith("/api/streams/")) {
        return Promise.resolve({ responses: [] });
      }
      return Promise.resolve({ items: [] });
    });

    renderSeriesDetailPage({ onSelectionChange });

    await userEvent.click(screen.getByRole("combobox", { name: "Season" }));
    await userEvent.click(await screen.findByText("Season 2"));
    expect(onSelectionChange).toHaveBeenCalledWith({
      season: 2,
      episodeId: null,
    });

    await userEvent.click(screen.getByText("Premiere"));
    expect(onSelectionChange).toHaveBeenCalledWith({
      season: 2,
      episodeId: "s2e1",
    });

    await userEvent.click(screen.getByRole("button", { name: "Change Episode" }));
    expect(onSelectionChange).toHaveBeenCalledWith({
      season: 2,
      episodeId: null,
    });
  });
});
