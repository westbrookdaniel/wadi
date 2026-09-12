import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { stateBlock } from "@/lib/styles";
import { MediaRow } from "./media-row";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className={stateBlock} role="status">
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={stateBlock}>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Unable to continue</AlertTitle>
      <AlertDescription>
        {error instanceof Error ? error.message : "Something went wrong"}
      </AlertDescription>
    </Alert>
  );
}

export function PosterSkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <MediaRow>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="grid gap-2.5 max-[800px]:gap-1.5"><Skeleton className="aspect-[2/3] rounded-lg" /><div><Skeleton className="h-[23px] w-3/4 max-[800px]:h-[18px]" /><Skeleton className="mt-1 h-5 w-1/2 max-[800px]:h-[15px]" /></div></div>
      ))}
    </MediaRow>
  );
}
