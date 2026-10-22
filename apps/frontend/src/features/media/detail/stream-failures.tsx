import { Button } from '@/components/ui/button'

export type StreamFailure = {
  id: string
  provider: string
  message: string
  isRetrying: boolean
  onRetry: () => void
}

export function StreamFailures({ failures = [] }: { failures?: StreamFailure[] }) {
  return failures.map(failure => <div key={failure.id} role="alert" className="grid gap-2 rounded-lg border border-border p-3 text-sm">
    <p>{failure.provider} failed: {failure.message}</p>
    <Button variant="secondary" disabled={failure.isRetrying} onClick={failure.onRetry} aria-label={`Retry ${failure.provider}`}>
      {failure.isRetrying ? 'Retrying…' : 'Retry'}
    </Button>
  </div>)
}
