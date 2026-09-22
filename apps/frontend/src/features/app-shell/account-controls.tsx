import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import { useAppStore } from '@/store/app-store'
import { desktopBridge } from '@/lib/desktop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export function AccountControls({ email }: { email: string }) {
  const [dialog, setDialog] = useState<'password' | 'delete' | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const client = useQueryClient()
  const reset = () => { setCurrentPassword(''); setNewPassword(''); setRepeatPassword(''); setConfirmation(''); setError('') }
  const submit = async () => {
    setBusy(true); setError('')
    try {
      if (dialog === 'password') {
        if (newPassword !== repeatPassword) throw new Error('New passwords do not match.')
        await apiRequest('/api/account/password', { method: 'POST', body: { currentPassword, newPassword } })
        setMessage('Password changed. Other devices have been signed out and integration access has been revoked.')
      } else {
        await apiRequest('/api/account', { method: 'DELETE', body: { email: confirmation, password: currentPassword } })
        useAppStore.getState().setToken(null); client.clear()
      }
      setDialog(null); reset()
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.') }
    finally { setBusy(false) }
  }
  const exportData = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await apiRequest('/api/account/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'wadi-account.json'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000)
      setMessage('Export ready. It includes your add-on configuration, which may contain private keys. Keep the file private.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed. Please try again.') }
    finally { setBusy(false) }
  }
  const external = (path: string) => {
    const bridge = desktopBridge()
    if (bridge) void bridge.openExternal(path)
    else window.location.assign(path)
  }
  return <section className="settings-panel grid gap-5">
    <h2 className="text-base font-medium">Your account</h2>
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" disabled={busy} onClick={() => { reset(); setDialog('password') }}>Change password</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void exportData()}>Export user data</Button>
      <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => { reset(); setDialog('delete') }}>Delete account</Button>
    </div>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {error && !dialog && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <a href="/terms" onClick={event => { if (desktopBridge()) { event.preventDefault(); void desktopBridge()?.openPage('/terms') } }} className="hover:text-foreground">Terms of service</a>
      <a href="/privacy" onClick={event => { if (desktopBridge()) { event.preventDefault(); void desktopBridge()?.openPage('/privacy') } }} className="hover:text-foreground">Privacy policy</a>
      <button onClick={() => external('https://github.com/westbrookdaniel/wadi')} className="hover:text-foreground">Source code ↗</button>
    </div>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open && !busy) { setDialog(null); reset() } }}>
      <DialogContent><DialogHeader><DialogTitle>{dialog === 'delete' ? 'Delete your account?' : 'Change password'}</DialogTitle><DialogDescription>{dialog === 'delete' ? 'This permanently deletes all your profiles, add-ons, lists, settings and watch history. Export your data first if you want a copy.' : 'Use at least 8 characters. Your other devices will be signed out and all API keys and connected apps will be revoked.'}</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit() }}>
          {dialog === 'delete' && <label className="grid gap-2 text-sm">Enter {email} to confirm<Input type="email" required value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="email" /></label>}
          <label className="grid gap-2 text-sm">Current password<Input type="password" required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
          {dialog === 'password' && <><label className="grid gap-2 text-sm">New password<Input type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><label className="grid gap-2 text-sm">Repeat new password<Input type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={repeatPassword} onChange={event => setRepeatPassword(event.target.value)} /></label></>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setDialog(null); reset() }}>Cancel</Button><Button type="submit" variant={dialog === 'delete' ? 'destructive' : 'default'} disabled={busy || (dialog === 'delete' && confirmation.trim().toLowerCase() !== email.toLowerCase())}>{busy ? 'Working…' : dialog === 'delete' ? 'Delete account permanently' : 'Change password'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </section>
}
