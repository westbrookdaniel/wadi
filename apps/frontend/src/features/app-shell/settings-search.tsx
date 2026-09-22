import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

type Match = { section: string; sectionName: string; label: string; element: HTMLElement }

// Index rendered labels rather than keeping a second, easily outdated settings list.
function findSettings(sections: string[][], query: string): Match[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return sections.flatMap(([section, sectionName]) => {
    const root = document.getElementById(section)
    if (!root) return []
    const candidates = [...root.querySelectorAll<HTMLElement>('label, h2, h3, summary, button[aria-label], input[aria-label]')]
    if (!candidates.length) candidates.push(root)
    const seen = new Set<string>()
    return candidates.flatMap(element => {
      const copy = element.cloneNode(true) as HTMLElement
      copy.querySelectorAll('input, select, textarea').forEach(control => control.remove())
      const label = (element.getAttribute('aria-label') || copy.textContent || sectionName).replace(/\s+/g, ' ').trim()
      const text = `${sectionName} ${label}`.toLocaleLowerCase()
      if (!label || seen.has(label) || !words.every(word => text.includes(word))) return []
      seen.add(label)
      return [{ section, sectionName, label, element }]
    })
  }).slice(0, 20)
}

export function SettingsSearch({ sections, onNavigate }: { sections: string[][]; onNavigate: (section: string) => void }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [selected, setSelected] = useState<Match | null>(null)
  useEffect(() => {
    if (!selected) return
    const frame = requestAnimationFrame(() => {
      const element = selected.element
      if (!element.isConnected) return
      let parent: HTMLElement | null = element
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true
        parent = parent.parentElement
      }
      const control = element instanceof HTMLLabelElement ? element.control : null
      const target = control ?? element.querySelector<HTMLElement>('input, button, select, [tabindex]') ?? element
      if (!target.hasAttribute('tabindex') && !target.matches('input, button, select, summary, a[href]')) target.tabIndex = -1
      target.focus({ preventScroll: true })
      element.scrollIntoView({ block: 'center', behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [selected])
  const choose = (match: Match) => {
    onNavigate(match.section)
    setSelected({ ...match })
    setQuery('')
    setMatches([])
  }
  return <div className="grid max-w-xl gap-2">
    <Input type="search" aria-label="Search settings" placeholder="Search settings…" value={query}
      onChange={event => { setQuery(event.target.value); setMatches(findSettings(sections, event.target.value)) }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setQuery(''); setMatches([]) }
        if (event.key === 'Enter' && matches[0]) { event.preventDefault(); choose(matches[0]) }
      }} />
    {query.trim() ? <div className="grid gap-1 rounded-xl border border-border bg-card p-2" aria-label="Settings search results">
      <p role="status" className="px-2 py-1 text-xs text-muted-foreground">{matches.length ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : 'No matching settings'}</p>
      {matches.map((match, index) => <button key={`${match.section}:${index}`} type="button" aria-label={`${match.label} — ${match.sectionName}`} className="rounded-lg p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => choose(match)}>
        <span className="block line-clamp-2 text-sm font-medium">{match.label}</span><span className="text-xs text-muted-foreground">{match.sectionName}</span>
      </button>)}
    </div> : null}
  </div>
}
