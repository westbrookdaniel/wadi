import { RevealedImage } from '@/components/revealed-image'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  ArrowLeft,
  GripVertical,
  Copy,
  Ellipsis,
  LogOut,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { z } from "zod";

import {
  addonsQuery,
  reorderAddons,
  createProfile,
  deleteProfile,
  configureAddon,
  deleteAddon,
  installAddon,
  logout,
  profilesQuery,
  previewAddon,
  playbackPreferencesQuery,
  queryKeys,
  selectProfile,
  updatePlaybackPreferences,
  updateProfile,
} from "@/api/queries";
import type {
  AddonManifest,
  AddonRecord,
  PlaybackPreferences,
  User,
} from "@/api/types";
import { EmptyState, ErrorState, LoadingState } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dangerText, mutedText, pageStack } from "@/lib/styles";
import { canSubmitForm, fieldError, fieldErrorClass } from "@/lib/form";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useNavigate } from "@tanstack/react-router";
import { useToast } from "@/components/ui/toast-context";
import { useDialogManager } from "@/components/dialogs";
import { BrowseLayoutSettings } from "./browse-layout-settings";
import { ProfileAvatar, PROFILE_AVATAR_OPTIONS, isAvatarImageUrl } from "./profile-avatar";

const addonUrlSchema = z.object({
  url: z.url("Enter a valid addon manifest URL."),
});

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a profile name.")
    .max(32, "Use 32 characters or fewer."),
  avatarKey: z.string().trim().max(2048).refine(value => PROFILE_AVATAR_OPTIONS.some(option => option.key === value) || isAvatarImageUrl(value), "Choose a colour or enter an HTTP image URL."),
});

export function ProfileSettingsPage() {
  const navigate = useNavigate();

  return (
    <div className={cn(pageStack, "settings-area max-w-[1040px] gap-6")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
        <Button variant="secondary" size="sm" onClick={() => navigate({ to: "/settings/account" })}>Account & addons</Button>
      </header>
      <section className="settings-panel"><ProfileManager /></section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <BrowseLayoutSettings />
        <ExternalPlaybackSettingsSection />
      </div>
    </div>
  );
}

function ExternalPlaybackSettingsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const prefs = useQuery(playbackPreferencesQuery);
  const [draft, setDraft] = useState<PlaybackPreferences | null>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: PlaybackPreferences) => updatePlaybackPreferences(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.playbackPreferences });
      toast({ title: "External playback settings updated." });
    },
  });

  const data = draft ?? prefs.data;

  if (prefs.isLoading) {
    return (
      <div className="grid gap-3 rounded-xl border border-border bg-card/60 p-4">
        <h3 className="m-0 text-[1.05rem] font-[520] tracking-normal">
          External playback
        </h3>
        <p className="m-0 text-sm text-muted-foreground">Loading defaults…</p>
      </div>
    );
  }

  if (!data) {
    return prefs.error ? <ErrorState error={prefs.error} /> : null;
  }

  const updateDraft = <K extends keyof PlaybackPreferences>(
    key: K,
    value: PlaybackPreferences[K],
  ) => {
    setDraft((current) => ({ ...(current ?? data), [key]: value }));
  };

  const onSave = () => {
    saveMutation.mutate(draft ?? data);
  };

  return (
    <div className="grid gap-4 rounded-xl border border-border bg-card/60 p-4">
      <h3 className="m-0 text-[1.05rem] font-[520] tracking-normal">
        External playback
      </h3>
      <p className="m-0 text-sm text-muted-foreground">
        Direct streams play in Wadi. These settings control links that need an external player.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label className="grid gap-1.5">
          Default stream action
          <Select
            value={data.stream_action}
            onValueChange={(value) => updateDraft("stream_action", value as PlaybackPreferences["stream_action"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="external">Open in external player</SelectItem>
              <SelectItem value="copy">Copy stream link</SelectItem>
            </SelectContent>
          </Select>
        </Label>

        <Label className="grid gap-1.5 sm:col-span-2">
          External player URL template
          <Input
            value={data.external_player_template}
            onChange={(event) => updateDraft("external_player_template", event.target.value)}
            placeholder="vlc://{url}"
          />
          <span className="text-xs text-muted-foreground">
            Include <code>{"{url}"}</code> where the encoded stream URL should go. For example: <code>vlc://{"{url}"}</code>.
          </span>
        </Label>
      </div>

      {saveMutation.error ? <p role="alert" className="text-sm text-destructive">{saveMutation.error.message}</p> : null}
      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={saveMutation.isPending || !draft || (draft.stream_action === prefs.data?.stream_action && draft.external_player_template === prefs.data?.external_player_template)}>
          Save external playback settings
        </Button>
      </div>
    </div>
  );
}

export function AccountSettingsPage({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const setToken = useAppStore((state) => state.setToken);
  const navigate = useNavigate();
  const addons = useQuery(addonsQuery);
  const [search, setSearch] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const reorderMutation = useMutation({
    mutationFn: reorderAddons,
    onSuccess: async result => {
      queryClient.setQueryData(queryKeys.addons, result.items);
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalogs });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      setToken(null);
      queryClient.clear();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAddon,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.addons }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalogs }),
      ]);
    },
  });

  const filtered = useMemo(
    () =>
      (addons.data ?? []).filter((addon) => matchesAddonSearch(addon, search)),
    [addons.data, search],
  );

  return (
    <div className={cn(pageStack, "settings-area max-w-[1040px]")}>
      <header className="grid gap-6">
        <div>
          <Button
            variant="ghost"
            type="button"
            className="-ml-2 w-fit"
            onClick={() => navigate({ to: "/settings" })}
          >
            <ArrowLeft aria-hidden="true" />
            Back to profile settings
          </Button>
        </div>
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="m-0 text-[clamp(1.2rem,2vw,1.7rem)] font-[520] tracking-normal">
              Account settings
            </h1>
            <p className="m-0 text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut aria-hidden="true" />
            Logout
          </Button>
        </div>
      </header>

      <section className="grid gap-4 border-b border-border pt-2 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[1.05rem] font-[520] tracking-normal">
            Installed addons
          </h2>
          <Button
            type="button"
            onClick={() => navigate({ to: "/settings/account/add-addon" })}
          >
            <Plus aria-hidden="true" />
            Add addon
          </Button>
        </div>
        <Input
          type="search"
          placeholder="Search installed addons"
          className="h-10 max-w-md rounded-lg px-3 text-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {addons.isLoading ? <LoadingState label="Loading addons" /> : null}
        {addons.error ? <ErrorState error={addons.error} /> : null}
        {deleteMutation.error ? <ErrorState error={deleteMutation.error} /> : null}
        {reorderMutation.error ? <ErrorState error={reorderMutation.error} /> : null}
        <p className="text-xs text-muted-foreground">{search.trim() ? "Clear search to reorder addons." : "Drag to reorder addons. Changes save automatically."}</p>
        {filtered.length ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id || search.trim() || reorderMutation.isPending) return;
            const all = addons.data ?? [];
            const from = all.findIndex(addon => addon.id === active.id), to = all.findIndex(addon => addon.id === over.id);
            if (from >= 0 && to >= 0) reorderMutation.mutate(arrayMove(all, from, to).map(addon => addon.id));
          }}>
          <SortableContext items={filtered.map(addon => addon.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2.5">
            {filtered.map((addon) => (
              <AddonCard
                addon={addon}
                key={addon.id}
                dragDisabled={Boolean(search.trim()) || reorderMutation.isPending}
                onDelete={() => deleteMutation.mutate(addon.id)}
              />
            ))}
          </div>
          </SortableContext>
          </DndContext>
        ) : addons.data?.length && !addons.isLoading ? (
          <EmptyState
            title="No matching addons"
            body="Try a different search term."
          />
        ) : !addons.isLoading ? (
          <EmptyState
            title="No addons installed"
            body="Install a Stremio-compatible addon to unlock catalogs and streams."
          />
        ) : null}
      </section>
    </div>
  );
}

export function SettingsPage(props: { user?: Pick<User, "id" | "email"> }) {
  if (props.user) {
    return <AccountSettingsPage user={{ ...props.user, active_profile_id: "" }} />;
  }
  return <ProfileSettingsPage />;
}

function ProfileManager() {
  const queryClient = useQueryClient();
  const activeProfileId = useAppStore((state) => state.activeProfileId);
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId);
  const setSelectedListId = useAppStore((state) => state.setSelectedListId);
  const profiles = useQuery(profilesQuery);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(
    null,
  );
  const [openMenuProfileId, setOpenMenuProfileId] = useState<string | null>(
    null,
  );

  const createMutation = useMutation({
    mutationFn: ({ name, avatarKey }: { name: string; avatarKey: string }) =>
      createProfile(name, avatarKey, null),
    onSuccess: async () => {
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      profileId,
      name,
      avatarKey,
    }: {
      profileId: string;
      name: string;
      avatarKey: string;
    }) => updateProfile(profileId, name, avatarKey, null),
    onSuccess: async () => {
      setOpenMenuProfileId(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
      setEditingProfileId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProfile,
    onSuccess: async () => {
      setOpenMenuProfileId(null);
      setDeletingProfileId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      ]);
    },
  });

  const selectMutation = useMutation({
    mutationFn: selectProfile,
    onSuccess: async ({ active_profile_id }) => {
      setActiveProfileId(active_profile_id);
      setSelectedListId(null);
      setOpenMenuProfileId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
        queryClient.invalidateQueries({ queryKey: ["list-items"] }),
        queryClient.invalidateQueries({ queryKey: ["watch-data"] }),
        queryClient.invalidateQueries({ queryKey: ["continue-watching"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.browseLayout }),
      ]);
    },
  });
  const profileList = profiles.data ?? [];
  const isAtLimit = profileList.length >= 5;
  const editingProfile =
    profileList.find((value) => value.id === editingProfileId) ?? null;
  const deletingProfile =
    profileList.find((value) => value.id === deletingProfileId) ?? null;

  if (profiles.isLoading) {
    return <LoadingState label="Loading profiles" />;
  }
  if (profiles.error) {
    return <ErrorState error={profiles.error} />;
  }

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="m-0 text-sm text-muted-foreground">
          Profiles
        </h3>
      </div>
      <div className="flex gap-2 flex-wrap max-[800px]:flex-col">
        {profileList.map((profile) => {
          const isActive = profile.id === activeProfileId;
          return (
            <div key={profile.id} className="grid justify-items-center p-2 max-[800px]:justify-items-stretch max-[800px]:px-0">
              <div
                className={cn("grid justify-items-center gap-3 rounded-lg p-1 max-[800px]:grid-cols-[auto_minmax(0,1fr)] max-[800px]:justify-items-stretch")}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isActive || selectMutation.isPending) return;
                    selectMutation.mutate(profile.id);
                  }}
                  aria-label={`Switch to ${profile.name}`}
                >
                  <ProfileAvatar
                    name={profile.name}
                    avatarKey={profile.avatar_key}
                    themeColor={profile.theme_color}
                    className={cn(
                      "size-14 text-lg max-[800px]:size-11",
                      "transition ring-0 hover:ring-4 ring-muted-foreground/40",
                      isActive && "ring-4 ring-primary/60",
                    )}
                  />
                </button>
                <div className="flex min-w-0 items-center gap-1 ml-3 max-[800px]:ml-1 max-[800px]:justify-between">
                  <span className="truncate text-sm font-medium">{profile.name}</span>
                  <ProfileActionsMenu
                    open={openMenuProfileId === profile.id}
                    onToggle={() =>
                      setOpenMenuProfileId((current) =>
                        current === profile.id ? null : profile.id,
                      )
                    }
                    onEdit={() => {
                      setOpenMenuProfileId(null);
                      setEditingProfileId(profile.id);
                    }}
                    onDelete={() => {
                      setOpenMenuProfileId(null);
                      setDeletingProfileId(profile.id);
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {isAtLimit ? null : (
          <div className={cn("grid justify-items-center gap-2 p-3 max-[800px]:justify-items-stretch max-[800px]:p-0 max-[800px]:pt-2")}>
            <button
              onClick={() => setCreateOpen(true)}
              type="button"
              aria-label="Add profile"
              className="grid size-14 place-items-center rounded-full border border-dashed border-border bg-muted/40 hover:bg-muted transition max-[800px]:flex max-[800px]:h-11 max-[800px]:w-full max-[800px]:justify-center max-[800px]:gap-2 max-[800px]:rounded-lg"
            >
              <Plus aria-hidden="true" className="size-5" />
              <span className="hidden max-[800px]:inline text-sm font-medium">Add profile</span>
            </button>
            <span className="text-sm font-medium max-[800px]:hidden">Add profile</span>
          </div>
        )}
      </div>
      {createMutation.error || updateMutation.error || deleteMutation.error || selectMutation.error ? <p role="alert" className="text-sm text-destructive">{(createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? selectMutation.error)?.message}</p> : null}
      {isAtLimit ? (
        <p className="m-0 text-sm text-muted-foreground">
          Profile limit reached (5).
        </p>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add profile</DialogTitle>
            <DialogDescription>
              Create a new profile with its own history, lists, and layout.
            </DialogDescription>
          </DialogHeader>
          <ProfileEditorForm
            submitLabel="Create profile"
            isPending={createMutation.isPending}
            error={createMutation.error}
            initialName=""
            initialAvatarKey={PROFILE_AVATAR_OPTIONS[0].key}
            onSubmit={(value) => createMutation.mutate(value)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingProfile)}
        onOpenChange={(open) => !open && setEditingProfileId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Update profile name or avatar.
            </DialogDescription>
          </DialogHeader>
          {editingProfile ? (
            <ProfileEditorForm
              submitLabel="Save changes"
              isPending={updateMutation.isPending}
              error={updateMutation.error}
              initialName={editingProfile.name}
              initialAvatarKey={editingProfile.avatar_key}
              onSubmit={(value) =>
                updateMutation.mutate({
                  profileId: editingProfile.id,
                  name: value.name,
                  avatarKey: value.avatarKey,
                })
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletingProfile)}
        onOpenChange={(open) => !open && setDeletingProfileId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete profile?</DialogTitle>
            <DialogDescription>
              {deletingProfile
                ? `Are you sure you want to delete "${deletingProfile.name}"? This will remove that profile's lists and watch history.`
                : "Are you sure you want to delete this profile?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setDeletingProfileId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={dangerText}
              disabled={deleteMutation.isPending || !deletingProfile}
              onClick={() =>
                deletingProfile && deleteMutation.mutate(deletingProfile.id)
              }
            >
              Delete profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProfileActionsMenu({
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative grid justify-items-center">
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="Profile actions"
        onClick={onToggle}
      >
        <Ellipsis aria-hidden="true" />
      </Button>
      {open ? (
        <div className="absolute top-full max-[800px]:right-0 z-20 mt-1 grid min-w-[138px] gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg">
          <Button
            variant="ghost"
            type="button"
            className="justify-start"
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
            Edit
          </Button>
          <Button
            variant="ghost"
            type="button"
            className={cn("justify-start", dangerText)}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ProfileEditorForm({
  initialName,
  initialAvatarKey,
  submitLabel,
  isPending,
  error,
  onSubmit,
}: {
  initialName: string;
  initialAvatarKey: string;
  submitLabel: string;
  isPending: boolean;
  error?: Error | null;
  onSubmit: (value: { name: string; avatarKey: string }) => void;
}) {
  const form = useForm({
    defaultValues: { name: initialName, avatarKey: initialAvatarKey },
    validators: { onSubmit: profileSchema },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
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
            {fieldError(field) ? (
              <p className={fieldErrorClass}>{fieldError(field)}</p>
            ) : null}
          </div>
        )}
      </form.Field>
      <form.Field name="avatarKey">
        {(field) => (
          <div className="grid gap-2">
            <div className="flex items-center gap-4 rounded-xl bg-white/5 p-4">
              <form.Subscribe selector={state => state.values.name}>{name => <ProfileAvatar name={name || 'You'} avatarKey={field.state.value} themeColor={null} className="size-16 text-2xl" />}</form.Subscribe>
              <div><Label>Profile picture</Label><p className="mt-1 text-xs text-muted-foreground">Choose a colour or use your own image.</p></div>
            </div>
            <div className="grid grid-cols-3 min-[480px]:grid-cols-6 gap-2">
              {PROFILE_AVATAR_OPTIONS.map((option) => {
                const selected = field.state.value === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={cn(
                      "grid justify-items-center gap-1 rounded-lg p-1.5 transition hover:bg-muted/40",
                      selected && "ring-2 ring-primary/60",
                    )}
                    aria-label={`Use ${option.name} avatar`}
                    aria-pressed={selected}
                    onClick={() => field.handleChange(option.key)}
                  >
                    <ProfileAvatar
                      name={initialName || "P"}
                      avatarKey={option.key}
                      themeColor={null}
                      className="size-9 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">
                      {option.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <Label htmlFor="avatar-url" className="mt-3">Image URL</Label>
            <Input id="avatar-url" type="url" placeholder="https://example.com/photo.jpg" maxLength={2048} value={field.state.value.startsWith('avatar-') ? '' : field.state.value} onChange={event => field.handleChange(event.target.value || PROFILE_AVATAR_OPTIONS[0].key)} onBlur={field.handleBlur} />
            <p className="text-xs text-muted-foreground">Paste a direct link to an image. It will be cropped to a circle.</p>
            {fieldError(field) ? <p role="alert" className={fieldErrorClass}>{fieldError(field)}</p> : null}
          </div>
        )}
      </form.Field>
      {error ? <ErrorState error={error} /> : null}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddAddonPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewAddon>
  > | null>(null);

  const previewMutation = useMutation({
    mutationFn: (value: z.infer<typeof addonUrlSchema>) =>
      previewAddon(value.url),
    onSuccess: (data) => setPreview(data),
  });

  const installMutation = useMutation({
    mutationFn: (url: string) => installAddon(url),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.addons }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalogs }),
      ]);
      toast({
        title: preview?.installed_addon_id
          ? "Addon updated"
          : "Addon installed",
      });
      navigate({ to: "/settings/account" });
    },
  });

  const form = useForm({
    defaultValues: { url: "" },
    validators: { onSubmit: addonUrlSchema },
    onSubmit: ({ value }) => previewMutation.mutate(value),
  });

  const title =
    preview?.manifest.name ?? preview?.source_url ?? "Addon preview";
  const version = stringValue(preview?.manifest.version);
  const description = stringValue(preview?.manifest.description);

  return (
    <div className={cn(pageStack, "settings-area max-w-[1040px]")}>
      <section className="grid gap-4 border-b border-border pt-2 pb-6">
        <h1 className="m-0 text-[1.2rem] font-[520] tracking-normal">
          Add addon
        </h1>
        <form
          className="flex items-start gap-2.5 max-[800px]:flex-col max-[800px]:items-stretch [&_input]:max-w-[640px]"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
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
                  aria-invalid={
                    field.state.meta.errors.length ? true : undefined
                  }
                />
                {fieldError(field) ? (
                  <p className={fieldErrorClass}>{fieldError(field)}</p>
                ) : null}
              </div>
            )}
          </form.Field>
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {(state) => (
              <Button
                type="submit"
                disabled={!canSubmitForm(state, previewMutation.isPending)}
              >
                Preview
              </Button>
            )}
          </form.Subscribe>
        </form>
        {previewMutation.error ? (
          <ErrorState error={previewMutation.error} />
        ) : null}
      </section>

      {preview ? (
        <Card size="sm" className="rounded-xl border-white/8 bg-card/60 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <AddonAvatar
                manifest={preview.manifest}
                sourceUrl={preview.source_url}
                fallback={title}
              />
              {title}
              <span className="text-[11px] font-normal text-muted-foreground">{version ?? "Unknown"}</span>
            </CardTitle>
            <CardDescription>
              {description ?? `${preview.transport} addon`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className={mutedText}>URL: {preview.source_url}</p>
            <p className={mutedText}>
              Types:{" "}
              {Array.isArray(preview.manifest.types) &&
              preview.manifest.types.length
                ? preview.manifest.types.join(", ")
                : "None"}
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                onClick={() => installMutation.mutate(preview.source_url)}
                disabled={installMutation.isPending}
              >
                {preview.installed_addon_id ? "Update addon" : "Install addon"}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => navigate({ to: "/settings/account" })}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function AddonCard({
  addon,
  dragDisabled,
  onDelete,
}: {
  addon: AddonRecord;
  dragDisabled: boolean;
  onDelete: () => void;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: addon.id, disabled: dragDisabled });
  const queryClient = useQueryClient();
  const { openDialog } = useDialogManager();
  const { toast } = useToast();
  const fields = addon.manifest.config ?? [];
  const hasConfig = fields.length > 0;
  const title = addon.manifest.name ?? addon.source_url;
  const version = stringValue(addon.manifest.version);
  const description = addon.manifest.description ?? `${addon.transport} addon`;
  const configureMutation = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      configureAddon(addon.id, config),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.addons });
    },
  });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition: transition, opacity: isDragging ? 0.6 : 1 }}>
    <Card size="sm" className="rounded-xl border-white/8 bg-card/60 shadow-none">
      <CardHeader className="gap-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <button type="button" aria-label={`Reorder ${title}`} disabled={dragDisabled} {...attributes} {...listeners} className="touch-none cursor-grab rounded-md p-1 text-muted-foreground hover:bg-white/10 disabled:opacity-30"><GripVertical className="size-4" /></button>
          <AddonAvatar
            manifest={addon.manifest}
            sourceUrl={addon.source_url}
            fallback={title}
          />
          <span className="min-w-0 truncate" title={title}>{title}</span>
          <span className="hidden sm:inline text-[11px] font-normal text-muted-foreground">{version ?? "Unknown"}</span>
        </CardTitle>
        <CardDescription className="col-span-2 line-clamp-2 text-xs leading-5">{description}</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label="Share addon link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(addon.source_url);
                toast({ title: "Link copied" });
              } catch { toast({ title: "Could not copy link. Check clipboard permissions." }); }
            }}
          >
            <Copy aria-hidden="true" />
          </Button>
          {hasConfig ? (
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              aria-label="Configure addon"
              onClick={async () => {
                const result = await openDialog("addonConfigure", { addon });
                if (result.action !== "save") {
                  return;
                }
                configureMutation.mutate(result.config);
              }}
            >
              <Settings aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            className={dangerText}
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label="Delete addon"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </CardAction>
      </CardHeader>
      {configureMutation.error ? <CardContent><ErrorState error={configureMutation.error} /></CardContent> : null}
    </Card>
    </div>
  );
}

function AddonAvatar({
  manifest,
  sourceUrl,
  fallback,
}: {
  manifest: AddonManifest;
  sourceUrl: string;
  fallback: string;
}) {
  const [imageError, setImageError] = useState(false);
  const src = addonImageSrc(manifest, sourceUrl);
  return src && !imageError ? (
    <RevealedImage
      src={src}
      alt=""
      className="size-7 shrink-0 rounded-sm object-cover"
      onError={() => setImageError(true)}
    />
  ) : (
    <span className="grid size-7 place-items-center rounded-sm bg-muted text-[0.6rem] uppercase tracking-wide text-muted-foreground">
      {fallback.slice(0, 1)}
    </span>
  );
}

function addonImageSrc(manifest: AddonManifest, sourceUrl: string) {
  const logo = stringValue(manifest.logo);
  const icon = stringValue(manifest.icon);
  if (logo) return logo;
  if (icon) return icon;
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return `${parsed.origin}/favicon.ico`;
    }
  } catch {
    return null;
  }
  return null;
}

function matchesAddonSearch(addon: AddonRecord, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
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
  ];
  return fields.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle),
  );
}

function catalogNames(manifest: AddonManifest) {
  if (!Array.isArray(manifest.catalogs)) return [];
  return manifest.catalogs.flatMap((catalog) =>
    typeof catalog === "object" && catalog && "name" in catalog
      ? [String(catalog.name ?? ""), String(catalog.id ?? "")]
      : [],
  );
}

function resourceNames(manifest: AddonManifest) {
  if (!Array.isArray(manifest.resources)) return [];
  return manifest.resources.map((resource) =>
    typeof resource === "string" ? resource : JSON.stringify(resource),
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
