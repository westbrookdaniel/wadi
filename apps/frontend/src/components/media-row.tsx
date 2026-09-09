import { cn } from "@/lib/utils";

const mediaRow =
  "grid auto-cols-[minmax(142px,180px)] grid-flow-col gap-3 pt-3 pb-5 [scrollbar-width:thin] [scroll-snap-type:x_proximity] [&_.media-card-item]:[scroll-snap-align:start]";

export function MediaRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        mediaRow,
        "media-row-bleed min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar",
      )}
    >
      {children}
    </div>
  );
}
