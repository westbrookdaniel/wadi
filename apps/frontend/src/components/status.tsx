export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state-block" role="status">
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
    <div className="state-block">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="state-block error-state" role="alert">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </div>
  )
}

export function PosterSkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <div className="media-row" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="poster-skeleton" key={index} />
      ))}
    </div>
  )
}
