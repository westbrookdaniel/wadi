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
      <div className="grid grid-cols-[minmax(0,1fr)_clamp(320px,30vw,460px)] items-stretch gap-0 max-[800px]:grid-cols-1">
        <div className={cn("relative isolate flex min-h-svh min-w-0 flex-col gap-8 overflow-hidden max-[800px]:min-h-[65svh]", pagePadding)}>
          <div className="absolute inset-0 -z-10" aria-hidden="true">
            <Artwork eager src={typeof media.raw.background === 'string' ? media.raw.background : media.poster} className="h-full w-full opacity-65" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
          </div>
          <div>
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
              "mt-auto grid grid-cols-[minmax(90px,160px)_minmax(0,1fr)] items-end gap-6 max-[1100px]:grid-cols-1",
            )}
          >
            {media.poster ? (
              <Artwork
                backdropSource="detail"
                className="aspect-[2/3] w-full rounded-lg object-cover shadow-[0_28px_80px_hsl(0_0%_0%/42%)] max-[1100px]:w-[140px] max-[800px]:hidden"
                src={media.poster}
                alt=""
              />
            ) : null}
            <div className="grid gap-[18px]">
              <h2 className="m-0 text-[clamp(1.6rem,2.6vw,2.5rem)] text-balance leading-tight font-medium tracking-tight">
                {media.name}
              </h2>
              <p className={cn("m-0 max-w-[680px] text-sm leading-6", mutedText)}>
                {[media.type, media.releaseInfo].filter(Boolean).join(" • ")}
              </p>
              <p className={cn("m-0 max-w-[680px] text-sm leading-6", mutedText)}>
                {media.description ?? "No description available."}
              </p>
              {children}
            </div>
          </section>
        </div>

        <aside
          className={cn(
            "flex h-svh min-w-0 flex-col gap-4 overflow-hidden border-l border-border bg-card/30 p-6 max-[800px]:h-auto max-[800px]:min-h-[60svh] max-[800px]:border-l-0 max-[800px]:border-t"
          )}
          aria-label={sideLabel}
        >
          <h3 className="m-0 text-sm font-medium text-muted-foreground">{sideTitle}</h3>
          {sideContent}
        </aside>
      </div>
    </div>
  );
}

export function DetailShellSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="grid gap-7" aria-label="Loading media details" role="status">
      <div className="grid grid-cols-[minmax(0,1fr)_clamp(320px,30vw,460px)] items-stretch gap-0 max-[800px]:grid-cols-1">
        <div className={cn("relative isolate flex min-h-svh min-w-0 flex-col gap-8 overflow-hidden max-[800px]:min-h-[65svh]", pagePadding)}>
          <div>
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

          <section className="mt-auto grid grid-cols-[minmax(90px,160px)_minmax(0,1fr)] items-end gap-6 max-[1100px]:grid-cols-1">
            <Skeleton className="aspect-[2/3] w-full rounded-lg shadow-[0_28px_80px_hsl(0_0%_0%/28%)] max-[1100px]:w-[140px] max-[800px]:hidden" />
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
            "grid h-[calc(100svh)] content-start gap-3.5 overflow-hidden border-l border-border bg-card/30 max-[800px]:h-auto max-[800px]:border-l-0 max-[800px]:border-t",
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
