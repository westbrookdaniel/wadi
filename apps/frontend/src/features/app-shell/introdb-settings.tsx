import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { introDbPreferencesQuery, updateIntroDbPreferences } from '@/api/introdb'
import { useAppStore } from '@/store/app-store'

export function IntroDbSettings() {
  const revision = useAppStore(state => state.authRevision)
  const client = useQueryClient()
  const query = introDbPreferencesQuery(revision)
  const preferences = useQuery(query)
  const save = useMutation({
    mutationFn: updateIntroDbPreferences,
    onMutate: async () => { await client.cancelQueries({ queryKey: query.queryKey }) },
    onSuccess: data => {
      client.setQueryData(query.queryKey, data)
      // Cancel in-flight lookups and discard cached buttons immediately after opting out.
      if (!data.enabled) {
        void client.cancelQueries({ queryKey: ['skip-segments', revision] })
        client.removeQueries({ queryKey: ['skip-segments', revision] })
      }
    },
  })
  const unavailable = preferences.isPending || preferences.isError
  return <section className="grid gap-5 rounded-xl border border-border bg-card/60 p-5">
    <div><h2 className="text-lg font-medium">Skip intros, recaps &amp; outros</h2><p className="mt-1 text-sm text-muted-foreground">Your account preference, shared across profiles and devices.</p></div>
    <label className="flex items-center justify-between gap-5 text-sm">
      <span><span className="block font-medium">Show skip buttons</span><span id="introdb-help" className="mt-1 block text-xs leading-relaxed text-muted-foreground">Show a button when an intro, recap or outro is detected. You choose when to skip.</span></span>
      <input type="checkbox" role="switch" aria-label="Show skip buttons" aria-describedby="introdb-help" className="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-muted transition-colors checked:bg-primary before:absolute before:left-0.5 before:top-0.5 before:size-5 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-50" checked={!unavailable && preferences.data?.enabled === true} disabled={unavailable || save.isPending} onChange={event => save.mutate(event.target.checked)} />
    </label>
    <p className="text-xs leading-relaxed text-muted-foreground">Powered by <a className="underline underline-offset-4" href="https://introdb.app" target="_blank" rel="noreferrer">IntroDB</a>. Available for supported titles in Wadi’s player. Off by default.</p>
    {preferences.isError ? <p role="alert" className="text-sm text-destructive">Could not load your preference. <button type="button" className="underline" onClick={() => { void preferences.refetch() }}>Retry</button></p> : null}
    {save.isError ? <p role="alert" className="text-sm text-destructive">Could not save. Your previous setting is unchanged. Please try again.</p> : null}
    <p role="status" className="min-h-4 text-xs text-muted-foreground">{preferences.isPending ? 'Loading preference…' : save.isPending ? 'Saving…' : save.isSuccess ? 'Saved to your account.' : ''}</p>
  </section>
}
