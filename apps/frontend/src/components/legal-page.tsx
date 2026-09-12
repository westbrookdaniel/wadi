import type { ReactNode } from 'react'
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="min-h-dvh bg-background px-6 py-12 text-foreground"><article className="mx-auto grid max-w-2xl gap-6 text-sm leading-relaxed [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-medium [&_p]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-4"><a href="/home" className="w-fit text-muted-foreground">← Back to Wadi</a><h1 className="text-3xl font-medium tracking-tight">{title}</h1><p>Updated 12 September 2026</p>{children}<nav className="mt-4 flex flex-wrap gap-5"><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a><a href="https://github.com/westbrookdaniel/wadi">Source code</a></nav></article></main>
}
