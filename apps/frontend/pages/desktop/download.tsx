import { ArrowLeft, ArrowUpRight, Monitor, Volume2, Library } from 'lucide-react'

const repository = 'https://github.com/westbrookdaniel/wadi'
export default function Download() {
  return <main className="min-h-dvh bg-background px-6 py-10 text-foreground sm:px-12 sm:py-14">
    <div className="mx-auto grid max-w-4xl gap-12">
      <nav className="flex items-center justify-between">
        <a href="/home" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to Wadi</a>
        <a href={repository} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">GitHub<ArrowUpRight className="size-4" /></a>
      </nav>
      <header className="grid max-w-2xl gap-5">
        <img src="/favicon.svg" alt="Wadi" className="size-16" />
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">Your library. More ways to play.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">Wadi for desktop plays more video and audio formats, with conversion happening on your computer as you watch.</p>
        <a href={`${repository}/releases`} className="mt-2 inline-flex w-fit items-center gap-3 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">View downloads on GitHub<ArrowUpRight className="size-4" /></a>
        <p className="text-xs text-muted-foreground">For macOS, Windows, and Linux. Available installers are listed with each release.</p>
      </header>
      <section className="grid gap-6 border-y border-border py-8 sm:grid-cols-3" aria-label="Desktop features">
        {[{ Icon: Monitor, title: 'Start watching sooner', body: 'Convert incompatible video while it streams, without waiting for a complete download.' }, { Icon: Volume2, title: 'More audio support', body: 'Convert unsupported audio tracks on your device as you watch.' }, { Icon: Library, title: 'Pick up where you left off', body: 'Sign in with your Wadi account for your profiles, add-ons, and saved library.' }].map(({ Icon, title, body }) => <div key={title} className="grid content-start gap-3"><Icon className="size-5 text-primary" /><h2 className="font-medium">{title}</h2><p className="text-sm leading-relaxed text-muted-foreground">{body}</p></div>)}
      </section>
      <section className="grid gap-5 rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h2 className="text-xl font-medium tracking-tight">Install from GitHub Releases</h2>
        <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Open the releases page and choose the latest release. Expand <strong className="font-medium text-foreground">Assets</strong> to see its downloads.</li>
          <li>Choose the installer for your computer: <strong className="font-medium text-foreground">.dmg</strong> for macOS, <strong className="font-medium text-foreground">.exe</strong> for Windows, or <strong className="font-medium text-foreground">.AppImage / .deb</strong> for Linux. If multiple builds are listed, choose the one matching your processor.</li>
          <li>Open the installer, launch Wadi, and sign in through your browser to connect your account.</li>
        </ol>
        <p className="text-sm text-muted-foreground">If no installer is listed yet for your system, keep using <a href="/home" className="underline underline-offset-4 text-foreground">Wadi on the web</a> and check back after the next release.</p>
      </section>
    </div>
  </main>
}
