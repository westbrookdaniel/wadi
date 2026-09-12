import { ArrowLeft, ArrowUpRight } from 'lucide-react'
export default function Download() {
  return <main className="grid min-h-dvh content-center bg-background px-6 py-12 text-foreground">
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <a href="/home" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to Wadi</a>
      <img src="/favicon.svg" alt="Wadi" className="size-16" />
      <h1 className="text-3xl font-medium tracking-tight">Wadi for desktop</h1>
      <p className="leading-relaxed text-muted-foreground">Your Wadi library, with more playback support. The desktop app converts unsupported video and audio on your computer while you watch. The web app plays formats your browser supports and does not convert media.</p>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>Open the latest GitHub release and expand <strong className="font-medium text-foreground">Assets</strong>.</li>
        <li>Download the installer for your computer: .dmg for macOS, .exe for Windows, or .AppImage / .deb for Linux. Choose the matching processor if several builds are listed.</li>
        <li>Install Wadi and sign in with your existing account.</li>
      </ol>
      <a href="https://github.com/westbrookdaniel/wadi/releases" className="inline-flex w-fit items-center gap-3 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">Downloads on GitHub<ArrowUpRight className="size-4" /></a>
      <p className="text-xs text-muted-foreground">No installer for your system yet? You can keep using <a href="/home" className="underline underline-offset-4">Wadi on the web</a>.</p>
    </div>
  </main>
}
