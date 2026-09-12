import { Check, Eye, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function WatchedButton({ watched, isPending, onClick, compact = false, title }: {
  watched: boolean; isPending: boolean; onClick: () => void; compact?: boolean; title?: string
}) {
  const label = `${watched ? 'Mark unwatched' : 'Mark watched'}${title ? `: ${title}` : ''}`
  return <Button className={`${compact ? 'size-9 p-0' : 'h-9'} shrink-0 rounded-lg border text-xs ${watched ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20' : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'}`} size={compact ? 'icon-sm' : 'sm'} variant="ghost" type="button" aria-label={label} title={label} aria-pressed={watched} disabled={isPending} onClick={onClick}>
    {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : watched ? <Check aria-hidden="true" /> : <Eye aria-hidden="true" />}
    {!compact ? watched ? 'Watched' : 'Mark watched' : null}
  </Button>
}
