import { RevealedImage } from '@/components/revealed-image'
import { Film } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type ArtworkProps = {
  src?: string
  alt?: string
  className?: string
  eager?: boolean
  backdropSource?: 'detail' | 'catalog'
}

export function Artwork({ src, alt = '', className, eager = false, backdropSource }: ArtworkProps) {
  const [failedSource, setFailedSource] = useState<string | undefined>()
  const available = Boolean(src && src !== failedSource)
  return (
    <div className={cn('artwork relative overflow-hidden bg-card', className)}>
      {available ? (
        <RevealedImage
          src={src}
          alt={alt}
          className="size-full object-cover"
          data-bg-source={backdropSource}
          loading={eager ? 'eager' : 'lazy'}
          onError={() => setFailedSource(src)}
        />
      ) : (
        <div className="artwork-fallback absolute inset-0 grid place-items-center" role="img" aria-label={alt ? `${alt}, artwork unavailable` : 'Artwork unavailable'}>
          <Film className="absolute size-20 text-white/5 blur-md" aria-hidden="true" />
          <Film className="size-10 text-white/15" strokeWidth={1} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
