import { useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Reveal complete, decoded images rather than progressive download scanlines. */
export function RevealedImage(props: Omit<ComponentProps<'img'>, 'src'> & { src?: string }) {
  return <DecodedImage key={props.src} {...props} />
}

function DecodedImage({ className, onLoad, ...props }: Omit<ComponentProps<'img'>, 'src'> & { src?: string }) {
  const [ready, setReady] = useState(false)
  return <img {...props} decoding="async" className={cn('image-reveal', className)} data-ready={ready} onLoad={async event => {
    const image = event.currentTarget
    try { await image.decode() } catch { /* Older engines may reject decode for a valid loaded image. */ }
    if (image.naturalWidth > 0) setReady(true)
    onLoad?.(event)
  }} />
}
