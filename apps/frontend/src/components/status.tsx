import { mediaRow, stateBlock } from '@/lib/styles'
import { cn } from '@/lib/utils'

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className={stateBlock} role="status">
      {label}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: React.ReactNode
}) {
  return (
    <div className={stateBlock}>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className={cn(stateBlock, 'text-[hsl(0_88%_76%)]')} role="alert">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </div>
  )
}

export function PosterSkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <div className={mediaRow} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          className="aspect-[2/3] rounded-lg bg-[linear-gradient(90deg,transparent,hsl(0_0%_100%/7%),transparent),hsl(0_0%_100%/6%)] bg-[length:220%_100%,100%_100%] animate-[skeleton-sheen_1.4s_ease-in-out_infinite]"
          key={index}
        />
      ))}
    </div>
  )
}
