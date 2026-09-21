import type { ReactNode } from 'react'
import type { MediaPreview } from '@/api/types'
import { Artwork } from '@/components/artwork'

export function TvDetail({ media, children, sideTitle, sideContent, sideLabel, onBack }: {
  media: MediaPreview; children?: ReactNode; sideTitle: string; sideLabel: string; sideContent: ReactNode; onBack: () => void
}) {
  return <div className="tv-detail" data-tv-focus-scope={`${media.id}:${sideLabel}`}>
    <header className="tv-detail-hero">
      <div className="tv-detail-art" aria-hidden="true"><Artwork eager src={typeof media.raw.background === 'string' ? media.raw.background : media.poster} className="size-full" /></div>
      <button type="button" data-tv-back onClick={onBack}>← Back</button>
      <div className="tv-detail-description"><p>{[media.type, media.releaseInfo].filter(Boolean).join(' · ')}</p>
        <h1>{media.name}</h1><p>{media.description ?? 'No description available.'}</p>
        {children}
      </div>
    </header>
    <section className="tv-detail-content" aria-label={sideLabel} data-tv-entry data-tv-region={sideLabel}>
      <h2>{sideTitle}</h2>{sideContent}
    </section>
  </div>
}
