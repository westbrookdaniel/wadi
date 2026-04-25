import { ArrowLeft } from 'lucide-react'

import type { MediaPreview } from '@/api/types'
import { Button } from '@/components/ui/button'
import { mutedText } from '@/lib/styles'
import { cn } from '@/lib/utils'

export function DetailShell({
  media,
  children,
  sideLabel,
  sideTitle,
  sideContent,
  onBack,
}: {
  media: MediaPreview
  children?: React.ReactNode
  sideLabel: string
  sideTitle: string
  sideContent: React.ReactNode
  onBack: () => void
}) {
  return (
    <div className="grid gap-7" aria-label={`${media.name} details`}>
      <Button className="mt-6 ml-6 w-fit" variant="secondary" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Back
      </Button>

      <div className="grid min-h-[calc(100svh-64px)] grid-cols-[minmax(0,1fr)_minmax(280px,400px)] items-stretch gap-0 pl-[clamp(24px,5vw,64px)] max-[800px]:min-h-0 max-[800px]:grid-cols-1 max-[800px]:gap-[22px] max-[800px]:px-[22px] max-[800px]:pb-[22px]">
        <section className="grid min-h-[min(68svh,680px)] grid-cols-[minmax(180px,280px)_minmax(0,680px)] items-end gap-[clamp(22px,5vw,56px)] max-[800px]:min-h-0 max-[800px]:grid-cols-1">
          {media.poster ? <img className="aspect-[2/3] w-full rounded-lg object-cover shadow-[0_28px_80px_hsl(0_0%_0%/42%)] max-[800px]:w-[min(220px,70vw)]" src={media.poster} alt="" /> : null}
          <div className="grid gap-[18px]">
            <h2 className="m-0 text-[clamp(2.3rem,6vw,5.6rem)] leading-[0.95] tracking-normal max-[800px]:text-[clamp(2rem,12vw,3.8rem)]">{media.name}</h2>
            <p className={cn('m-0 max-w-[680px]', mutedText)}>{[media.type, media.releaseInfo].filter(Boolean).join(' • ')}</p>
            <p className={cn('m-0 max-w-[680px]', mutedText)}>{media.description ?? 'No description available.'}</p>
            {children}
          </div>
        </section>

        <aside
          className="grid h-[calc(100svh-64px)] content-start gap-3.5 overflow-hidden rounded-lg bg-[hsl(240_14%_4%/72%)] p-4 max-[800px]:h-auto max-[800px]:max-h-[72svh]"
          aria-label={sideLabel}
        >
          <h3 className="m-0 tracking-normal">{sideTitle}</h3>
          {sideContent}
        </aside>
      </div>
    </div>
  )
}
