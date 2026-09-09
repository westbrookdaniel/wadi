import { Artwork } from '@/components/artwork'
import { ArrowLeft } from "lucide-react";

import type { MediaPreview } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mutedText, pagePadding } from "@/lib/styles";
import { cn } from "@/lib/utils";

import { StreamListSkeleton } from "./stream-list";

export function DetailShell({
  media,
  children,
  sideLabel,
  sideTitle,
  sideContent,
  onBack,
}: {
  media: MediaPreview;
  children?: React.ReactNode;
  sideLabel: string;
  sideTitle: string;
  sideContent: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="grid gap-7" aria-label={`${media.name} details`}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,500px)] items-stretch gap-0 max-[800px]:grid-cols-1 max-[800px]:gap-[22px]">
        <div className={cn("flex flex-col", pagePadding)}>
          <div className="flex-1">
            <Button
              size="icon-lg"
              variant="ghost"
              type="button"
              aria-label="Back"
              onClick={onBack}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
          </div>

          <section
            className={cn(
              "grid grid-cols-[minmax(180px,280px)_minmax(0,680px)] items-end gap-[clamp(22px,5vw,56px)] max-[800px]:grid-cols-1",
            )}
          >
            {media.poster ? (
              <Artwork
                backdropSource="detail"
                className="aspect-[2/3] w-full rounded-lg object-cover shadow-[0_28px_80px_hsl(0_0%_0%/42%)] max-[800px]:w-[min(220px,70vw)]"
                src={media.poster}
                alt=""
              />
            ) : null}
            <div className="grid gap-[18px]">
              <h2 className="m-0 text-[4rem] text-balance leading-[0.95] tracking-normal max-[800px]:text-[clamp(2rem,12vw,3.8rem)]">
                {media.name}
              </h2>
              <p className={cn("m-0 max-w-[680px]", mutedText)}>
                {[media.type, media.releaseInfo].filter(Boolean).join(" • ")}
              </p>
              <p className={cn("m-0 max-w-[680px]", mutedText)}>
                {media.description ?? "No description available."}
              </p>
              {children}
            </div>
          </section>
        </div>

        <aside
          className={cn(
            "grid h-[calc(100svh)] content-start gap-3.5 overflow-hidden bg-[hsl(240_14%_4%/72%)] max-[800px]:h-auto",
            pagePadding, 
			'pb-0'
          )}
          aria-label={sideLabel}
        >
          <h3 className="m-0 tracking-normal">{sideTitle}</h3>
          {sideContent}
        </aside>
      </div>
    </div>
  );
}

export function DetailShellSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="grid gap-7" aria-label="Loading media details" role="status">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,500px)] items-stretch gap-0 max-[800px]:grid-cols-1 max-[800px]:gap-[22px]">
        <div className={cn("flex flex-col", pagePadding)}>
          <div className="flex-1">
            <Button
              size="icon-lg"
              variant="ghost"
              type="button"
              onClick={onBack}
              aria-label="Back"
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
          </div>

          <section className="grid grid-cols-[minmax(180px,280px)_minmax(0,680px)] items-end gap-[clamp(22px,5vw,56px)] max-[800px]:grid-cols-1">
            <Skeleton className="aspect-[2/3] w-full rounded-lg shadow-[0_28px_80px_hsl(0_0%_0%/28%)] max-[800px]:w-[min(220px,70vw)]" />
            <div className="grid gap-[18px]">
              <Skeleton className="h-[clamp(3rem,8vw,6rem)] w-[min(520px,100%)] rounded-lg" />
              <Skeleton className="h-4 w-[min(260px,70%)] rounded-full" />
              <div className="grid max-w-[680px] gap-2.5">
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-4 w-[92%] rounded-full" />
                <Skeleton className="h-4 w-[64%] rounded-full" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-32 rounded-full" />
              </div>
            </div>
          </section>
        </div>

        <aside
          className={cn(
            "grid h-[calc(100svh)] content-start gap-3.5 overflow-hidden bg-[hsl(240_14%_4%/72%)] max-[800px]:h-auto",
            pagePadding,
            "pb-0",
          )}
          aria-label="Loading detail sidebar"
        >
          <Skeleton className="h-8 w-[56%] rounded-full" />
          <StreamListSkeleton />
        </aside>
      </div>
    </div>
  );
}
