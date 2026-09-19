import { useEffect, useRef, useState } from 'react'
import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Episode } from '../types'

export function NextEpisodePrompt({ episode, seconds, onContinue, onCancel }: { episode: Episode; seconds: number; onContinue: () => void; onCancel: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  const continueRef = useRef(onContinue)
  const completed = useRef(false)
  useEffect(() => { continueRef.current = onContinue }, [onContinue])
  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) setRemaining(value => Math.max(0, value - 1)) }, 1000)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => { if (remaining === 0 && !completed.current) { completed.current = true; continueRef.current() } }, [remaining])
  return <section aria-label="Up next" className="absolute bottom-24 right-6 left-6 z-20 rounded-2xl border border-white/15 bg-zinc-950/95 p-5 text-white shadow-xl sm:left-auto sm:w-[380px]">
    <div className="flex items-center justify-between"><span className="text-xs uppercase tracking-widest text-white/55">Up next · S{episode.season} E{episode.episode}</span><button aria-label="Cancel autoplay" onClick={onCancel} className="rounded p-2 hover:bg-white/10"><X className="size-4" /></button></div>
    <h3 className="mt-1 text-xl font-medium">{episode.title}</h3><p role="status" className="mt-2 text-sm text-white/60">Playing in {remaining} seconds</p>
    <div className="mt-4 flex gap-2"><Button onClick={() => { if (!completed.current) { completed.current = true; onContinue() } }}><Play className="size-4" />Play now</Button><Button variant="ghost" onClick={onCancel}>Stay here</Button></div>
    <div className="mt-4 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-primary transition-[width]" style={{width:`${remaining / seconds * 100}%`}} /></div>
  </section>
}
