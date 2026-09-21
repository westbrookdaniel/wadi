export const appBackground = "bg-background text-foreground";

export const authBackground = "bg-background text-foreground";

export const pageStack = "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8";

export const contentSection = "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5";

export const sectionHeading =
  "flex min-w-0 items-center justify-between gap-3 [&>div]:min-w-0 [&_h2]:break-words";

export const sectionAction =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-normal text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

export const pageHeader =
  "flex min-h-[72px] items-end justify-between gap-[18px] max-[800px]:flex-col max-[800px]:items-stretch";

export const compactHeader = "min-h-11 [&_h1]:text-[clamp(1.8rem,4vw,3.4rem)]";

export const mutedText = "text-muted-foreground";

export const dangerText = "text-destructive";

export const mediaGrid =
  "media-grid grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5 max-[800px]:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] max-[800px]:gap-x-2 max-[800px]:gap-y-4";

export const stateBlock =
  "grid min-w-0 w-full px-4 [overflow-wrap:anywhere] [&_strong]:max-w-full min-h-[min(420px,58svh)] content-center justify-items-center gap-2 text-center text-muted-foreground [&_p]:m-0 [&_p]:max-w-[440px] [&_strong]:text-[clamp(1.35rem,3vw,2.2rem)] [&_strong]:font-bold [&_strong]:tracking-normal [&_strong]:text-foreground";

export const pagePadding =
  "px-[clamp(18px,4vw,56px)] py-[clamp(28px,4vw,56px)] max-[800px]:p-[22px]";

export const bottomPagePadding =
  "pb-[clamp(18px,4vw,56px)] max-[800px]:pb-[22px]";
