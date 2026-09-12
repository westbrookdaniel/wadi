import { AuthShell } from '@/features/auth/auth-pages'
export default function Connected() {
  return <AuthShell showLogo={false} title="Connected to Wadi" body="You’re all set. Return to the desktop app to start watching, or close this tab.">
    <a href="/home" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Continue on the web</a>
  </AuthShell>
}
