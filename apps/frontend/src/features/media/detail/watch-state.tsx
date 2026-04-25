import { Check, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function WatchedButton({
  watched,
  isPending,
  onClick,
}: {
  watched: boolean
  isPending: boolean
  onClick: () => void
}) {
  return (
    <Button className="w-fit" variant={watched ? 'default' : 'secondary'} type="button" disabled={isPending} onClick={onClick}>
      {watched ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
      {watched ? 'Mark unwatched' : 'Mark watched'}
    </Button>
  )
}
