import { useQuery } from "@tanstack/react-query";

import { catalogQuery } from "@/api/queries";
import type { CatalogEntry, MediaPreview } from "@/api/types";
import { EmptyState, ErrorState, PosterSkeletonRow } from "@/components/status";

import { MediaCard } from "@/features/media/media-card";
import { contentSection, mutedText, sectionHeading } from "@/lib/styles";
import { MediaRow } from "@/components/media-row";

export function CatalogSection({
  entry,
  search,
  onOpen,
}: {
  entry: CatalogEntry;
  search?: string;
  onOpen: (media: MediaPreview) => void;
}) {
  const extras: Record<string, string> = search ? { search } : {};
  const catalog = useQuery(
    catalogQuery(entry.catalog.type, entry.catalog.id, extras),
  );
  const title = entry.catalog.name ?? entry.catalog.id;

  return (
    <section className={contentSection}>
      <div className={sectionHeading}>
        <div>
          <h2 className="m-0 tracking-normal">{title}</h2>
          <p className={mutedText}>{entry.addon_name}</p>
        </div>
      </div>

      {catalog.isLoading ? <PosterSkeletonRow /> : null}
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
      ) : !catalog.isLoading && !catalog.error ? (
        <EmptyState title="No items returned" />
      ) : null}
    </section>
  );
}
