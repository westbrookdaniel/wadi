import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { LogOut, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'

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
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  dangerText,
  mutedText,
  pageStack,
} from '@/lib/styles'
import { canSubmitForm, fieldError, fieldErrorClass } from '@/lib/form'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

const installAddonSchema = z.object({
  url: z.url('Enter a valid addon manifest URL.'),
})

export function SettingsPage({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const setToken = useAppStore((state) => state.setToken)
  const addons = useQuery(addonsQuery)

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      setToken(null)
      queryClient.clear()
    },
  })

  const installMutation = useMutation({
    mutationFn: (value: z.infer<typeof installAddonSchema>) => installAddon(value.url),
    onSuccess: async () => {
      installForm.reset()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.addons }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalogs }),
      ])
    },
  })

  const installForm = useForm({
    defaultValues: {
      url: '',
    },
    validators: {
      onSubmit: installAddonSchema,
    },
    onSubmit: ({ value }) => installMutation.mutate(value),
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
        <h2 className="m-0 text-[1.05rem] font-[520] tracking-normal">Install addon</h2>
        <form
          className="flex items-start gap-2.5 max-[800px]:flex-col max-[800px]:items-stretch [&_input]:max-w-[640px]"
          onSubmit={(event) => {
            event.preventDefault()
            void installForm.handleSubmit()
          }}
        >
          <installForm.Field name="url">
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
          </installForm.Field>
          <installForm.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
            {(state) => (
              <Button variant="secondary" type="submit" disabled={!canSubmitForm(state, installMutation.isPending)}>
                <Plus aria-hidden="true" />
                Install
              </Button>
            )}
          </installForm.Subscribe>
        </form>
        {installMutation.error ? <ErrorState error={installMutation.error} /> : null}
      </section>

      <section className="grid gap-4 border-b border-border pt-2 pb-6">
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
  const configSchema = z.object(Object.fromEntries(fields.map((field) => [field.key, schemaForField(field)])))
  const defaultConfig = defaultsFrom(fields, addon.config)

  const configureMutation = useMutation({
    mutationFn: (config: Record<string, unknown>) => configureAddon(addon.id, normalizeConfig(config)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.addons })
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
    <Card size="sm" className="bg-card/70">
      <CardHeader>
        <CardTitle>{addon.manifest.name ?? addon.source_url}</CardTitle>
        <CardDescription>{addon.manifest.description ?? `${addon.transport} addon`}</CardDescription>
        <CardAction>
        <Button className={dangerText} variant="ghost" size="icon" type="button" aria-label="Delete addon" onClick={onDelete}>
          <Trash2 aria-hidden="true" />
        </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {fields.length ? (
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
          <configForm.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
            {(state) => (
              <Button size="sm" type="submit" disabled={!canSubmitForm(state, configureMutation.isPending)}>
                Save config
              </Button>
            )}
          </configForm.Subscribe>
        </form>
      ) : (
        <p className={mutedText}>No configuration fields.</p>
      )}
      </CardContent>
    </Card>
  )
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
    return field.required
      ? z.string().min(1, 'Choose an option.')
      : z.string()
  }

  if (field.type === 'number') {
    return field.required
      ? z.coerce.number('Enter a number.')
      : z.union([z.literal(''), z.coerce.number('Enter a number.')])
  }

  return field.required ? z.string().trim().min(1, 'This field is required.') : z.string()
}
