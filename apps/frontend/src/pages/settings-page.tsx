import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import {
  addonsQuery,
  configureAddon,
  deleteAddon,
  installAddon,
  logout,
  queryKeys,
} from '@/api/queries'
import type { AddonRecord, ConfigDecl, User } from '@/api/types'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import {
  dangerText,
  iconButton,
  iconTextButton,
  inputClass,
  labelClass,
  mutedText,
  pageStack,
  primaryButton,
  smallButton,
} from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

export function SettingsPage({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const setToken = useAppStore((state) => state.setToken)
  const [url, setUrl] = useState('')
  const addons = useQuery(addonsQuery)

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      setToken(null)
      queryClient.clear()
    },
  })

  const installMutation = useMutation({
    mutationFn: () => installAddon(url),
    onSuccess: async () => {
      setUrl('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.addons }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalogs }),
      ])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAddon,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.addons }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalogs }),
      ])
    },
  })

  function onInstall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (url.trim()) {
      installMutation.mutate()
    }
  }

  return (
    <div className={cn(pageStack, 'max-w-[980px]')}>
      <header className="flex min-h-[52px] items-center justify-between gap-[18px]">
        <h1 className="m-0 text-[clamp(1.2rem,2vw,1.7rem)] font-[520] tracking-normal">{user.email}</h1>
        <button className={iconTextButton} type="button" onClick={() => logoutMutation.mutate()}>
          <LogOut aria-hidden="true" />
          Logout
        </button>
      </header>

      <section className="grid gap-4 border-b border-[hsl(0_0%_100%/8%)] pt-2 pb-6">
        <h2 className="m-0 text-[1.05rem] font-[520] tracking-normal">Install addon</h2>
        <form className="flex items-center gap-2.5 max-[800px]:flex-col max-[800px]:items-stretch [&_input]:max-w-[640px]" onSubmit={onInstall}>
          <input
            className={inputClass}
            type="url"
            value={url}
            placeholder="https://addon.example/manifest.json"
            onChange={(event) => setUrl(event.target.value)}
            required
          />
          <button className={iconTextButton} type="submit" disabled={installMutation.isPending}>
            <Plus aria-hidden="true" />
            Install
          </button>
        </form>
        {installMutation.error ? <ErrorState error={installMutation.error} /> : null}
      </section>

      <section className="grid gap-4 border-b border-[hsl(0_0%_100%/8%)] pt-2 pb-6">
        <h2 className="m-0 text-[1.05rem] font-[520] tracking-normal">Installed addons</h2>

        {addons.isLoading ? <LoadingState label="Loading addons" /> : null}
        {addons.error ? <ErrorState error={addons.error} /> : null}
        {addons.data?.length ? (
          <div className="grid gap-2.5">
            {addons.data.map((addon) => (
              <AddonCard
                addon={addon}
                key={addon.id}
                onDelete={() => deleteMutation.mutate(addon.id)}
              />
            ))}
          </div>
        ) : !addons.isLoading ? (
          <EmptyState title="No addons installed" body="Install a Stremio-compatible addon to unlock catalogs and streams." />
        ) : null}
      </section>
    </div>
  )
}

function AddonCard({ addon, onDelete }: { addon: AddonRecord; onDelete: () => void }) {
  const queryClient = useQueryClient()
  const fields = addon.manifest.config ?? []
  const [config, setConfig] = useState<Record<string, unknown>>(() => addon.config ?? defaultsFrom(fields))

  const configureMutation = useMutation({
    mutationFn: () => configureAddon(addon.id, config),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.addons })
    },
  })

  return (
    <article className="grid gap-[18px] border-b border-[hsl(0_0%_100%/8%)] py-4">
      <div className="flex items-center justify-between gap-[18px]">
        <div>
          <h3 className="m-0 text-base font-[520] tracking-normal">{addon.manifest.name ?? addon.source_url}</h3>
          <p className={cn('mt-1.5 mb-0', mutedText)}>{addon.manifest.description ?? `${addon.transport} addon`}</p>
        </div>
        <button className={cn(iconButton, dangerText)} type="button" aria-label="Delete addon" onClick={onDelete}>
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      {fields.length ? (
        <form
          className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            configureMutation.mutate()
          }}
        >
          {fields.map((field) => (
            <label className={labelClass} key={field.key}>
              {field.title ?? field.key}
              {field.options?.length ? (
                <select
                  className={inputClass}
                  value={String(config[field.key] ?? '')}
                  onChange={(event) => setConfig((current) => ({ ...current, [field.key]: event.target.value }))}
                >
                  <option value="">Default</option>
                  {field.options.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputClass}
                  value={String(config[field.key] ?? '')}
                  type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
                  required={field.required}
                  onChange={(event) => setConfig((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              )}
            </label>
          ))}
          <button className={cn(primaryButton, smallButton)} type="submit" disabled={configureMutation.isPending}>
            Save config
          </button>
        </form>
      ) : (
        <p className={mutedText}>No configuration fields.</p>
      )}
    </article>
  )
}

function defaultsFrom(fields: ConfigDecl[]) {
  return Object.fromEntries(fields.map((field) => [field.key, field.default ?? '']))
}
