/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'

import type { AddonRecord, ConfigDecl } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { canSubmitForm, fieldError, fieldErrorClass } from '@/lib/form'

export type DialogKey = 'watchlistCreate' | 'watchlistSettings' | 'addonConfigure'

export type DialogParamsMap = {
  watchlistCreate: { initialName?: string; title?: string }
  watchlistSettings: { listId: string; currentName: string; canDelete: boolean }
  addonConfigure: { addon: AddonRecord }
}

export type DialogResultMap = {
  watchlistCreate: { action: 'confirm'; name: string } | { action: 'cancel' }
  watchlistSettings: { action: 'save'; name: string } | { action: 'delete' } | { action: 'cancel' }
  addonConfigure: { action: 'save'; config: Record<string, unknown> } | { action: 'cancel' }
}

type DialogContextValue = {
  openDialog: <K extends DialogKey>(key: K, params: DialogParamsMap[K]) => Promise<DialogResultMap[K]>
}

type ActiveDialogItem = {
  id: number
  key: DialogKey
  params: DialogParamsMap[DialogKey]
  resolve: (result: DialogResultMap[DialogKey]) => void
}

type DialogState = {
  active: ActiveDialogItem | null
  queue: ActiveDialogItem[]
}

const createListSchema = z.object({ name: z.string().trim().min(1, 'Enter a list name.') })
const renameListSchema = z.object({ name: z.string().trim().min(1, 'Enter a list name.') })

const DialogManagerContext = createContext<DialogContextValue | null>(null)

export function DialogManagerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>({ active: null, queue: [] })
  const stateRef = useRef<DialogState>({ active: null, queue: [] })
  const idRef = useRef(1)

  const applyState = useCallback((nextState: DialogState) => {
    stateRef.current = nextState
    setState(nextState)
  }, [])

  const resolveActive = useCallback((result: DialogResultMap[DialogKey]) => {
    const current = stateRef.current.active
    if (!current) {
      return
    }
    current.resolve(result)
    const [nextActive, ...restQueue] = stateRef.current.queue
    applyState({
      active: nextActive ?? null,
      queue: restQueue,
    })
  }, [applyState])

  const openDialog = useCallback(
    <K extends DialogKey>(key: K, params: DialogParamsMap[K]) =>
      new Promise<DialogResultMap[K]>((resolve) => {
        const item: ActiveDialogItem = {
          id: idRef.current,
          key,
          params: params as DialogParamsMap[DialogKey],
          resolve: resolve as (value: DialogResultMap[DialogKey]) => void,
        }
        idRef.current += 1

        const current = stateRef.current
        if (current.active) {
          applyState({
            active: current.active,
            queue: [...current.queue, item],
          })
          return
        }

        applyState({
          active: item,
          queue: current.queue,
        })
      }),
    [applyState],
  )

  useEffect(() => {
    return () => {
      const current = stateRef.current
      if (current.active) {
        current.active.resolve(cancelResult(current.active.key))
      }
      current.queue.forEach((item) => {
        item.resolve(cancelResult(item.key))
      })
    }
  }, [])

  return (
    <DialogManagerContext.Provider value={{ openDialog }}>
      {children}
      {state.active ? (
        <DialogHost
          key={state.active.id}
          dialog={state.active}
          onResolve={resolveActive}
        />
      ) : null}
    </DialogManagerContext.Provider>
  )
}

export function useDialogManager() {
  const context = useContext(DialogManagerContext)
  if (!context) {
    throw new Error('useDialogManager must be used within DialogManagerProvider')
  }
  return context
}

function DialogHost({
  dialog,
  onResolve,
}: {
  dialog: ActiveDialogItem
  onResolve: (result: DialogResultMap[DialogKey]) => void
}) {
  if (dialog.key === 'watchlistCreate') {
    return (
      <WatchlistCreateDialog
        params={dialog.params as DialogParamsMap['watchlistCreate']}
        onResolve={(result) => onResolve(result)}
      />
    )
  }

  if (dialog.key === 'watchlistSettings') {
    return (
      <WatchlistSettingsDialog
        params={dialog.params as DialogParamsMap['watchlistSettings']}
        onResolve={(result) => onResolve(result)}
      />
    )
  }

  return (
    <AddonConfigureDialog
      params={dialog.params as DialogParamsMap['addonConfigure']}
      onResolve={(result) => onResolve(result)}
    />
  )
}

function WatchlistCreateDialog({
  params,
  onResolve,
}: {
  params: DialogParamsMap['watchlistCreate']
  onResolve: (result: DialogResultMap['watchlistCreate']) => void
}) {
  const form = useForm({
    defaultValues: { name: params.initialName ?? '' },
    validators: { onSubmit: createListSchema },
    onSubmit: ({ value }) => onResolve({ action: 'confirm', name: value.name }),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onResolve({ action: 'cancel' })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{params.title ?? 'New watchlist'}</DialogTitle>
          <DialogDescription>Give your collection a name.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="name">
            {(field) => (
              <div className="grid gap-2">
                <Label className="text-xs" htmlFor="watchlist-name">Name</Label>
                <Input id="watchlist-name" aria-label="List name" placeholder="List name" maxLength={100} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
                {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
              </div>
            )}
          </form.Field>
          <form.Subscribe selector={(formState) => ({ canSubmit: formState.canSubmit, isSubmitting: formState.isSubmitting })}>
            {(formState) => (
              <DialogFooter>
                <Button variant="ghost" type="button" onClick={() => onResolve({ action: 'cancel' })}>Cancel</Button>
                <Button type="submit" disabled={!canSubmitForm(formState, false)}>
                  Create list
                </Button>
              </DialogFooter>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function WatchlistSettingsDialog({
  params,
  onResolve,
}: {
  params: DialogParamsMap['watchlistSettings']
  onResolve: (result: DialogResultMap['watchlistSettings']) => void
}) {
  const form = useForm({
    defaultValues: { name: params.currentName },
    validators: { onSubmit: renameListSchema },
    onSubmit: ({ value }) => onResolve({ action: 'save', name: value.name }),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onResolve({ action: 'cancel' })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage watchlist</DialogTitle>
          <DialogDescription>Rename this list or delete it.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="name">
            {(field) => (
              <div className="grid gap-2">
                <Label className="text-xs" htmlFor="watchlist-name">Name</Label>
                <Input id="watchlist-name" aria-label="List name" placeholder="List name" maxLength={100} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
                {fieldError(field) ? <p className={fieldErrorClass}>{fieldError(field)}</p> : null}
              </div>
            )}
          </form.Field>
          <DialogFooter className="justify-between">
            {params.canDelete ? (
              <Button variant="destructive" type="button" onClick={() => onResolve({ action: 'delete' })}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <form.Subscribe selector={(formState) => ({ canSubmit: formState.canSubmit, isSubmitting: formState.isSubmitting })}>
              {(formState) => (
                <Button variant="secondary" type="submit" disabled={!canSubmitForm(formState, false)}>
                  Save
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddonConfigureDialog({
  params,
  onResolve,
}: {
  params: DialogParamsMap['addonConfigure']
  onResolve: (result: DialogResultMap['addonConfigure']) => void
}) {
  const addon = params.addon
  const fields = addon.manifest.config ?? []
  const configSchema = z.object(Object.fromEntries(fields.map((field) => [field.key, schemaForField(field)])))

  const form = useForm({
    defaultValues: defaultsFrom(fields, addon.config),
    validators: {
      onSubmit: configSchema as never,
    },
    onSubmit: ({ value }) => onResolve({ action: 'save', config: normalizeConfig(value) }),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onResolve({ action: 'cancel' })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {addon.manifest.name ?? 'addon'}</DialogTitle>
          <DialogDescription>Update addon configuration values.</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          {fields.map((field) => (
            <form.Field name={field.key} key={field.key}>
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
            </form.Field>
          ))}
          <DialogFooter>
            <form.Subscribe selector={(formState) => ({ canSubmit: formState.canSubmit, isSubmitting: formState.isSubmitting })}>
              {(formState) => (
                <Button type="submit" disabled={!canSubmitForm(formState, false)}>
                  Save config
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    return field.required ? z.string().min(1, 'Choose an option.') : z.string()
  }
  if (field.type === 'number') {
    return field.required ? z.coerce.number('Enter a number.') : z.union([z.literal(''), z.coerce.number('Enter a number.')])
  }
  return field.required ? z.string().trim().min(1, 'This field is required.') : z.string()
}

function cancelResult<K extends DialogKey>(key: K): DialogResultMap[K] {
  if (key === 'watchlistCreate') {
    return { action: 'cancel' } as DialogResultMap[K]
  }
  if (key === 'watchlistSettings') {
    return { action: 'cancel' } as DialogResultMap[K]
  }
  return { action: 'cancel' } as DialogResultMap[K]
}
