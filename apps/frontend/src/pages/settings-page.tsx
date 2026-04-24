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
    <div className="page-stack settings-page">
      <header className="settings-header">
        <h1>{user.email}</h1>
        <button className="icon-text-button" type="button" onClick={() => logoutMutation.mutate()}>
          <LogOut aria-hidden="true" />
          Logout
        </button>
      </header>

      <section className="settings-section">
        <h2>Install addon</h2>
        <form className="inline-form wide" onSubmit={onInstall}>
          <input
            type="url"
            value={url}
            placeholder="https://addon.example/manifest.json"
            onChange={(event) => setUrl(event.target.value)}
            required
          />
          <button className="icon-text-button" type="submit" disabled={installMutation.isPending}>
            <Plus aria-hidden="true" />
            Install
          </button>
        </form>
        {installMutation.error ? <ErrorState error={installMutation.error} /> : null}
      </section>

      <section className="settings-section">
        <h2>Installed addons</h2>

        {addons.isLoading ? <LoadingState label="Loading addons" /> : null}
        {addons.error ? <ErrorState error={addons.error} /> : null}
        {addons.data?.length ? (
          <div className="addon-list">
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
    <article className="addon-card">
      <div className="settings-row">
        <div>
          <h3>{addon.manifest.name ?? addon.source_url}</h3>
          <p>{addon.manifest.description ?? `${addon.transport} addon`}</p>
        </div>
        <button className="icon-button danger" type="button" aria-label="Delete addon" onClick={onDelete}>
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      {fields.length ? (
        <form
          className="config-form"
          onSubmit={(event) => {
            event.preventDefault()
            configureMutation.mutate()
          }}
        >
          {fields.map((field) => (
            <label key={field.key}>
              {field.title ?? field.key}
              {field.options?.length ? (
                <select
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
                  value={String(config[field.key] ?? '')}
                  type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
                  required={field.required}
                  onChange={(event) => setConfig((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              )}
            </label>
          ))}
          <button className="primary-button small" type="submit" disabled={configureMutation.isPending}>
            Save config
          </button>
        </form>
      ) : (
        <p className="muted-text">No configuration fields.</p>
      )}
    </article>
  )
}

function defaultsFrom(fields: ConfigDecl[]) {
  return Object.fromEntries(fields.map((field) => [field.key, field.default ?? '']))
}
