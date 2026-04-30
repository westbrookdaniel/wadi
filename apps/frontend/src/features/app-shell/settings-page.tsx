import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { Copy, LogOut, Plus, Settings, Trash2 } from 'lucide-react'
import { z } from 'zod'

import {
  addonsQuery,
  configureAddon,
  deleteAddon,
  installAddon,
  logout,
  previewAddon,
  queryKeys,
} from '@/api/queries'
import type { AddonManifest, AddonRecord, ConfigDecl, User } from '@/api/types'
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

const addonUrlSchema = z.object({
  url: z.url('Enter a valid addon manifest URL.'),
})

export function SettingsPage({ user }: { user: User }) {
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
        <h1 className="m-0 text-[clamp(1.2rem,2vw,1.7rem)] font-[520] tracking-normal">{user.email}</h1>
        <Button variant="secondary" type="button" onClick={() => logoutMutation.mutate()}>
          <LogOut aria-hidden="true" />
          Logout
        </Button>
      </header>

      <section className="grid gap-4 border-b border-border pt-2 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[1.05rem] font-[520] tracking-normal">Installed addons</h2>
          <Button type="button" onClick={() => navigate({ to: '/settings/add-addon' })}>
            <Plus aria-hidden="true" />
            Add addon
          </Button>
        </div>
        <Input
          type="search"
          placeholder="Search installed addons"
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
      navigate({ to: '/settings' })
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
              <Button variant="secondary" type="button" onClick={() => navigate({ to: '/settings' })}>
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
  const src = addonImageSrc(manifest, sourceUrl)
  return src ? (
    <img src={src} alt="" className="size-7 rounded-sm object-cover" />
  ) : (
    <span className="grid size-7 place-items-center rounded-sm bg-muted text-xs uppercase">{fallback.slice(0, 1)}</span>
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
