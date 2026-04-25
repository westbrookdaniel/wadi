import { cn } from "@/lib/utils";

const mediaRow =
  "grid auto-cols-[minmax(142px,180px)] grid-flow-col gap-3 py-1 pb-3.5 [scrollbar-width:thin] [scroll-snap-type:x_proximity] [&_.media-card-item]:[scroll-snap-align:start]";

export function MediaRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        mediaRow,
        "overflow-x-auto overflow-y-hidden -mx-[50vw] pl-[50vw] pr-[150vw] scroll-px-[50vw] no-scrollbar",
      )}
    >
      {children}
    </div>
  );
}
