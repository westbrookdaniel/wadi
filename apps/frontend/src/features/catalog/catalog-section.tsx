import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { catalogQuery } from "@/api/queries";
import type { CatalogEntry, MediaPreview } from "@/api/types";
import { EmptyState, ErrorState, PosterSkeletonRow } from "@/components/status";

import { MediaCard } from "@/features/media/media-card";
import { contentSection, mutedText, sectionHeading } from "@/lib/styles";
import { MediaRow } from "@/components/media-row";

export function CatalogSection({
  entry,
  search,
  entries,
  onOpen,
}: {
  entry: CatalogEntry;
  search?: string;
  entries?: CatalogEntry[];
  onOpen: (media: MediaPreview) => void;
}) {
  const section = useRef<HTMLElement>(null);
  const [nearViewport, setNearViewport] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!section.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNearViewport(true); observer.disconnect(); }
    }, { rootMargin: '600px' });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  const extras: Record<string, string> = search ? { search } : {};
  const catalogs = useQueries({ queries: (entries ?? [entry]).map(item =>
    catalogQuery(item.catalog.type, item.catalog.id, extras, nearViewport)) });
  const seen = new Set<string>();
  const results = catalogs.map(result => result.data ?? []);
  const data = Array.from({ length: Math.max(0, ...results.map(items => items.length)) }).flatMap((_, index) =>
    results.flatMap(items => {
      const media = items[index];
      if (!media || seen.has(`${media.type}:${media.id}`)) return [];
      seen.add(`${media.type}:${media.id}`);
      return [media];
    }));
  const catalog = { data, isLoading: catalogs.some(result => result.isLoading), error: catalogs.find(result => result.error)?.error };
  const title = entry.catalog.name ?? entry.catalog.id;

  return (
    <section ref={section} className={contentSection}>
      <div className={sectionHeading}>
        <div>
          <h2 className="m-0 flex items-center gap-2 tracking-normal">
            <span>{title}</span>
          </h2>
          <p className={mutedText}>{entry.addon_name}</p>
        </div>
      </div>

      {!nearViewport || catalog.isLoading ? <PosterSkeletonRow /> : null}
      {catalog.error ? <ErrorState error={catalog.error} /> : null}
      {catalog.data?.length ? (
        <MediaRow>
          {catalog.data.slice(0, 12).map((media) => (
            <MediaCard
              key={`${media.type}-${media.id}`}
              media={media}
              onOpen={() => onOpen(media)}
            />
          ))}
        </MediaRow>
      ) : nearViewport && !catalog.isLoading && !catalog.error ? (
        <EmptyState title="No items returned" />
      ) : null}
    </section>
  );
}
