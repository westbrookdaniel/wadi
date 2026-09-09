import { cn } from "@/lib/utils";

const mediaRow =
  "grid auto-cols-[minmax(142px,180px)] grid-flow-col gap-3 py-1 pb-3.5 [scrollbar-width:thin] [scroll-snap-type:x_proximity] [&_.media-card-item]:[scroll-snap-align:start]";

export function MediaRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        mediaRow,
        "min-w-0 max-w-full overflow-x-auto overflow-y-hidden scroll-px-1 no-scrollbar",
      )}
    >
      {children}
    </div>
  );
}
