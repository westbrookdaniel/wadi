import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { Copy, LogOut, Plus, Settings, Trash2 } from 'lucide-react'
import { z } from 'zod'

import {
  addonsQuery,
  createProfile,
  deleteProfile,
  configureAddon,
  deleteAddon,
  installAddon,
  logout,
  profilesQuery,
  previewAddon,
  queryKeys,
  selectProfile,
  updateProfile,
} from '@/api/queries'
import type { AddonManifest, AddonRecord, ConfigDecl, Profile, User } from '@/api/types'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { dangerText, mutedText, pageStack } from '@/lib/styles'
import { canSubmitForm, fieldError, fieldErrorClass } from '@/lib/form'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { useNavigate } from '@tanstack/react-router'
import { useToast } from '@/components/ui/toast'
import { BrowseLayoutSettings } from './browse-layout-settings'

const addonUrlSchema = z.object({
  url: z.url('Enter a valid addon manifest URL.'),
})

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter a profile name.').max(32, 'Use 32 characters or fewer.'),
})

export function ProfileSettingsPage() {
  const navigate = useNavigate()

  return (
    <div className={cn(pageStack, 'max-w-[980px]')}>
      <header className="grid gap-1">
        <h1 className="m-0 text-[clamp(1.2rem,2vw,1.7rem)] font-[520] tracking-normal">Profile settings</h1>
        <p className="m-0 text-sm text-muted-foreground">Applies to this profile.</p>
      </header>

      <section className="grid gap-4 border-b border-border pt-2 pb-6">
        <ProfileManager />
      </section>

      <section className="grid gap-4 border-b border-border pt-2 pb-6">
        <BrowseLayoutSettings />
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card/60 p-4">
        <h3 className="m-0 text-[1.05rem] font-[520] tracking-normal">Account settings</h3>
        <p className="m-0 text-sm text-muted-foreground">Applies to your whole account, including addons and sign-out.</p>
        <div>
          <Button type="button" onClick={() => navigate({ to: '/settings/account' })}>Open account settings</Button>
        </div>
      </section>
    </div>
  )
}

export function AccountSettingsPage({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const setToken = useAppStore((state) => state.setToken)
  const navigate = useNavigate()
  const addons = useQuery(addonsQuery)
  const [search, setSearch] = useState('')

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      setToken(null)
      queryClient.clear()
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

  const filtered = useMemo(
    () => (addons.data ?? []).filter((addon) => matchesAddonSearch(addon, search)),
    [addons.data, search],
  )

  return (
    <div className={cn(pageStack, 'max-w-[980px]')}>
      <header className="flex min-h-[52px] items-center justify-between gap-[18px]">
        <div className="grid gap-1">
          <h1 className="m-0 text-[clamp(1.2rem,2vw,1.7rem)] font-[520] tracking-normal">Account settings</h1>
          <p className="m-0 text-sm text-muted-foreground">Applies to your account: {user.email}</p>
        </div>
        <Button variant="secondary" type="button" onClick={() => logoutMutation.mutate()}>
          <LogOut aria-hidden="true" />
          Logout
        </Button>
      </header>

      <section className="grid gap-4 border-b border-border pt-2 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[1.05rem] font-[520] tracking-normal">Installed addons</h2>
          <Button type="button" onClick={() => navigate({ to: '/settings/account/add-addon' })}>
            <Plus aria-hidden="true" />
            Add addon
          </Button>
        </div>
        <Input
          type="search"
          placeholder="Search installed addons"
          className="h-[52px] rounded-full px-[18px] text-sm md:text-base"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {addons.isLoading ? <LoadingState label="Loading addons" /> : null}
        {addons.error ? <ErrorState error={addons.error} /> : null}
        {filtered.length ? (
          <div className="grid gap-2.5">
            {filtered.map((addon) => (
              <AddonCard addon={addon} key={addon.id} onDelete={() => deleteMutation.mutate(addon.id)} />
            ))}
          </div>
        ) : addons.data?.length && !addons.isLoading ? (
          <EmptyState title="No matching addons" body="Try a different search term." />
        ) : !addons.isLoading ? (
          <EmptyState title="No addons installed" body="Install a Stremio-compatible addon to unlock catalogs and streams." />
        ) : null}
      </section>
    </div>
  )
}

function ProfileManager() {
  const queryClient = useQueryClient()
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId)
  const setSelectedListId = useAppStore((state) => state.setSelectedListId)
  const profiles = useQuery(profilesQuery)
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (name: string) => createProfile(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ profile, name }: { profile: Profile; name: string }) =>
      updateProfile(profile.id, name, profile.avatar_key, profile.theme_color),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles })
      setEditingProfileId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProfile,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      ])
    },
  })

  const selectMutation = useMutation({
    mutationFn: selectProfile,
    onSuccess: async ({ active_profile_id }) => {
      setActiveProfileId(active_profile_id)
      setSelectedListId(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
        queryClient.invalidateQueries({ queryKey: ['list-items'] }),
        queryClient.invalidateQueries({ queryKey: ['watch-data'] }),
        queryClient.invalidateQueries({ queryKey: ['continue-watching'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.browseLayout }),
      ])
    },
  })

  const createForm = useForm({
    defaultValues: { name: '' },
    validators: { onSubmit: profileSchema },
    onSubmit: ({ value, formApi }) => {
      createMutation.mutate(value.name)
      formApi.reset()
    },
  })

  if (profiles.isLoading) {
    return <LoadingState label="Loading profiles" />
  }
  if (profiles.error) {
    return <ErrorState error={profiles.error} />
  }

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="m-0 text-[1.05rem] font-[520] tracking-normal">Profiles</h3>
        <p className="m-0 text-sm text-muted-foreground">Watch history, lists, and layout are isolated per profile.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(profiles.data ?? []).map((profile) => (
          <Card key={profile.id} size="sm" className="bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{profile.name}</span>
                {profile.id === activeProfileId ? <span className={mutedText}>Active</span> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={selectMutation.isPending || profile.id === activeProfileId}
                onClick={() => selectMutation.mutate(profile.id)}
              >
                Use profile
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setEditingProfileId(profile.id)}>
                Rename
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                className={dangerText}
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(profile.id)}
              >
                Delete
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void createForm.handleSubmit()
        }}
      >
        <createForm.Field name="name">
          {(field) => (
            <div className="grid gap-1">
              <Label htmlFor={field.name}>New profile</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Profile name"
                aria-invalid={field.state.meta.errors.length ? true : undefined}
              />
            </div>
          )}
        </createForm.Field>
        <Button type="submit" disabled={createMutation.isPending || (profiles.data?.length ?? 0) >= 5}>
          Create profile
        </Button>
      </form>
      {(profiles.data?.length ?? 0) >= 5 ? <p className="m-0 text-sm text-muted-foreground">Profile limit reached (5).</p> : null}

      <Dialog open={Boolean(editingProfileId)} onOpenChange={(open) => !open && setEditingProfileId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename profile</DialogTitle>
            <DialogDescription>This changes the display name for this profile.</DialogDescription>
          </DialogHeader>
          {editingProfileId ? (
            <RenameProfileForm
              profile={(profiles.data ?? []).find((value) => value.id === editingProfileId) ?? null}
              isPending={updateMutation.isPending}
              onSubmit={(profile, name) => updateMutation.mutate({ profile, name })}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RenameProfileForm({
  profile,
  isPending,
  onSubmit,
}: {
  profile: Profile | null
  isPending: boolean
  onSubmit: (profile: Profile, name: string) => void
}) {
  const form = useForm({
    defaultValues: { name: profile?.name ?? '' },
    validators: { onSubmit: profileSchema },
    onSubmit: ({ value }) => {
      if (!profile) return
      onSubmit(profile, value.name)
    },
  })

  if (!profile) {
    return null
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>Name</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={field.state.meta.errors.length ? true : undefined}
            />
            {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
          </div>
        )}
      </form.Field>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

export function AddAddonPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewAddon>> | null>(null)

  const previewMutation = useMutation({
    mutationFn: (value: z.infer<typeof addonUrlSchema>) => previewAddon(value.url),
    onSuccess: (data) => setPreview(data),
  })

  const installMutation = useMutation({
    mutationFn: (url: string) => installAddon(url),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.addons }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalogs }),
      ])
      toast({ title: preview?.installed_addon_id ? 'Addon updated' : 'Addon installed' })
      navigate({ to: '/settings/account' })
    },
  })

  const form = useForm({
    defaultValues: { url: '' },
    validators: { onSubmit: addonUrlSchema },
    onSubmit: ({ value }) => previewMutation.mutate(value),
  })

  const title = preview?.manifest.name ?? preview?.source_url ?? 'Addon preview'
  const version = stringValue(preview?.manifest.version)
  const description = stringValue(preview?.manifest.description)

  return (
    <div className={cn(pageStack, 'max-w-[980px]')}>
      <section className="grid gap-4 border-b border-border pt-2 pb-6">
        <h1 className="m-0 text-[1.2rem] font-[520] tracking-normal">Add addon</h1>
        <form
          className="flex items-start gap-2.5 max-[800px]:flex-col max-[800px]:items-stretch [&_input]:max-w-[640px]"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="url">
            {(field) => (
              <div className="grid flex-1 gap-2">
                <Input
                  type="url"
                  value={field.state.value}
                  placeholder="https://addon.example/manifest.json"
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length ? true : undefined}
                />
                {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
              </div>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
            {(state) => (
              <Button type="submit" disabled={!canSubmitForm(state, previewMutation.isPending)}>
                Preview
              </Button>
            )}
          </form.Subscribe>
        </form>
        {previewMutation.error ? <ErrorState error={previewMutation.error} /> : null}
      </section>

      {preview ? (
        <Card size="sm" className="bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <AddonAvatar manifest={preview.manifest} sourceUrl={preview.source_url} fallback={title} />
              {title}
			  <p className={mutedText}>{version ?? 'Unknown'}</p>
            </CardTitle>
            <CardDescription>{description ?? `${preview.transport} addon`}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className={mutedText}>URL: {preview.source_url}</p>
            <p className={mutedText}>
              Types: {Array.isArray(preview.manifest.types) && preview.manifest.types.length ? preview.manifest.types.join(', ') : 'None'}
            </p>
            <div className="flex gap-2 pt-1">
              <Button type="button" onClick={() => installMutation.mutate(preview.source_url)} disabled={installMutation.isPending}>
                {preview.installed_addon_id ? 'Update addon' : 'Install addon'}
              </Button>
              <Button variant="secondary" type="button" onClick={() => navigate({ to: '/settings/account' })}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function AddonCard({ addon, onDelete }: { addon: AddonRecord; onDelete: () => void }) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const fields = addon.manifest.config ?? []
  const hasConfig = fields.length > 0
  const title = addon.manifest.name ?? addon.source_url
  const version = stringValue(addon.manifest.version)
  const description = addon.manifest.description ?? `${addon.transport} addon`

  return (
    <Card size="sm" className="bg-card/70">
      <CardHeader className="gap-3">
        <CardTitle className="flex items-center gap-2.5">
          <AddonAvatar manifest={addon.manifest} sourceUrl={addon.source_url} fallback={title} />
          {title}
           <p className={mutedText}>{version ?? 'Unknown'}</p>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label="Share addon link"
            onClick={async () => {
              await navigator.clipboard.writeText(addon.source_url)
              toast({ title: 'Link copied' })
            }}
          >
            <Copy aria-hidden="true" />
          </Button>
          {hasConfig ? (
            <Button variant="ghost" size="icon" type="button" aria-label="Configure addon" onClick={() => setIsOpen(true)}>
              <Settings aria-hidden="true" />
            </Button>
          ) : null}
          <Button className={dangerText} variant="ghost" size="icon" type="button" aria-label="Delete addon" onClick={onDelete}>
            <Trash2 aria-hidden="true" />
          </Button>
        </CardAction>
      </CardHeader>
      {hasConfig ? <ConfigureAddonDialog addon={addon} open={isOpen} onOpenChange={setIsOpen} /> : null}
    </Card>
  )
}

function ConfigureAddonDialog({ addon, open, onOpenChange }: { addon: AddonRecord; open: boolean; onOpenChange: (next: boolean) => void }) {
  const queryClient = useQueryClient()
  const fields = addon.manifest.config ?? []
  const configSchema = z.object(Object.fromEntries(fields.map((field) => [field.key, schemaForField(field)])))
  const defaultConfig = defaultsFrom(fields, addon.config)

  const configureMutation = useMutation({
    mutationFn: (config: Record<string, unknown>) => configureAddon(addon.id, normalizeConfig(config)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.addons })
      onOpenChange(false)
    },
  })

  const configForm = useForm({
    defaultValues: defaultConfig,
    validators: {
      onSubmit: configSchema as never,
    },
    onSubmit: ({ value }) => configureMutation.mutate(value),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {addon.manifest.name ?? 'addon'}</DialogTitle>
          <DialogDescription>Update addon configuration values.</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            void configForm.handleSubmit()
          }}
        >
          {fields.map((field) => (
            <configForm.Field name={field.key} key={field.key}>
              {(formField) => (
                <div className="grid gap-2">
                  <Label htmlFor={`${addon.id}-${field.key}`}>{field.title ?? field.key}</Label>
                  {field.options?.length ? (
                    <Select
                      value={String(formField.state.value ?? '')}
                      onValueChange={(value) => formField.handleChange(value)}
                    >
                      <SelectTrigger id={`${addon.id}-${field.key}`} className="w-full" aria-invalid={formField.state.meta.errors.length ? true : undefined}>
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default">Default</SelectItem>
                        {field.options.map((option) => (
                          <SelectItem value={option} key={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`${addon.id}-${field.key}`}
                      value={String(formField.state.value ?? '')}
                      type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
                      onBlur={formField.handleBlur}
                      onChange={(event) => formField.handleChange(event.target.value)}
                      aria-invalid={formField.state.meta.errors.length ? true : undefined}
                    />
                  )}
                  {fieldError(formField) ? <p className={fieldErrorClass}>{fieldError(formField)}</p> : null}
                </div>
              )}
            </configForm.Field>
          ))}
          <DialogFooter>
            <configForm.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
              {(state) => (
                <Button type="submit" disabled={!canSubmitForm(state, configureMutation.isPending)}>
                  Save config
                </Button>
              )}
            </configForm.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddonAvatar({ manifest, sourceUrl, fallback }: { manifest: AddonManifest; sourceUrl: string; fallback: string }) {
  const [imageError, setImageError] = useState(false)
  const src = addonImageSrc(manifest, sourceUrl)
  return src && !imageError ? (
    <img src={src} alt="" className="size-7 rounded-sm object-cover" onError={() => setImageError(true)} />
  ) : (
    <span className="grid size-7 place-items-center rounded-sm bg-muted text-[0.6rem] uppercase tracking-wide text-muted-foreground">
      {fallback.slice(0, 1)}
    </span>
  )
}

function addonImageSrc(manifest: AddonManifest, sourceUrl: string) {
  const logo = stringValue(manifest.logo)
  const icon = stringValue(manifest.icon)
  if (logo) return logo
  if (icon) return icon
  try {
    const parsed = new URL(sourceUrl)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.origin}/favicon.ico`
    }
  } catch {
    return null
  }
  return null
}

function matchesAddonSearch(addon: AddonRecord, search: string) {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  const fields = [
    addon.manifest.name,
    addon.manifest.description,
    addon.manifest.version,
    addon.manifest.id,
    addon.source_url,
    addon.transport,
    ...(addon.manifest.types ?? []),
    ...catalogNames(addon.manifest),
    ...resourceNames(addon.manifest),
  ]
  return fields.some((value) => String(value ?? '').toLowerCase().includes(needle))
}

function catalogNames(manifest: AddonManifest) {
  if (!Array.isArray(manifest.catalogs)) return []
  return manifest.catalogs.flatMap((catalog) =>
    typeof catalog === 'object' && catalog && 'name' in catalog ? [String(catalog.name ?? ''), String(catalog.id ?? '')] : [],
  )
}

function resourceNames(manifest: AddonManifest) {
  if (!Array.isArray(manifest.resources)) return []
  return manifest.resources.map((resource) => (typeof resource === 'string' ? resource : JSON.stringify(resource)))
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function defaultsFrom(fields: ConfigDecl[], config: Record<string, unknown> | null): Record<string, string | number> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = config?.[field.key] ?? field.default ?? ''
      return [field.key, typeof value === 'number' ? value : String(value)]
    }),
  )
}

function normalizeConfig(config: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, value === '__default' ? '' : value]),
  )
}

function schemaForField(field: ConfigDecl) {
  if (field.options?.length) {
    return field.required ? z.string().min(1, 'Choose an option.') : z.string()
  }
  if (field.type === 'number') {
    return field.required ? z.coerce.number('Enter a number.') : z.union([z.literal(''), z.coerce.number('Enter a number.')])
  }
  return field.required ? z.string().trim().min(1, 'This field is required.') : z.string()
}
