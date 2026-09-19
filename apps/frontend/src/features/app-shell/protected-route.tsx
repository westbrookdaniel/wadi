import { rememberedProfile, rememberProfile } from './remembered-profile';
import { useDeviceStore } from '@/store/device-store';
import { Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import type { User } from "@/api/types";
import {
  meQuery,
  profilesQuery,
  queryKeys,
  selectProfile,
} from "@/api/queries";
import { LoadingState } from "@/components/status";
import { appBackground } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { ProfileAvatar } from "./profile-avatar";

export function ProtectedRoute({
  children,
}: {
  children: (user: User) => ReactNode;
}) {
  const askForProfile = useDeviceStore(state => state.askForProfile);
  const token = useAppStore((state) => state.token);
  const activeProfileId = useAppStore((state) => state.activeProfileId);
  const setActiveProfileId = useAppStore((state) => state.setActiveProfileId);
  const setSelectedListId = useAppStore((state) => state.setSelectedListId);
  const queryClient = useQueryClient();
  const me = useQuery(meQuery(Boolean(token)));
  const profiles = useQuery({
    ...profilesQuery,
    enabled: Boolean(token && me.data),
  });
  const selectProfileMutation = useMutation({
    mutationFn: selectProfile,
    onSuccess: async (data) => {
      setActiveProfileId(data.active_profile_id);
      setSelectedListId(null);
      if (token && typeof window !== "undefined") {
        window.sessionStorage.setItem("wadi.profile.selected_token", token);
        if (me.data) rememberProfile(me.data.id, data.active_profile_id);
      }
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

  const remembered = me.data ? activeProfileId ?? rememberedProfile(me.data.id) : null;
  const desiredProfile = profiles.data?.length === 1 ? profiles.data[0]?.id
    : !askForProfile && profiles.data?.some(profile => profile.id === remembered) ? remembered : null;
  const { mutate: restoreProfile, isPending: restoring, isError: restoreFailed } = selectProfileMutation;
  useEffect(() => {
    if (!desiredProfile || !me.data || restoring || restoreFailed) return;
    if (me.data.active_profile_id !== desiredProfile) restoreProfile(desiredProfile);
    else {
      if (activeProfileId !== desiredProfile) setActiveProfileId(desiredProfile);
      rememberProfile(me.data.id, desiredProfile);
    }
  }, [desiredProfile, activeProfileId, me.data, restoreProfile, restoring, restoreFailed, setActiveProfileId]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (me.isLoading) {
    return (
      <main
        className={cn(
          "grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]",
          appBackground,
        )}
      >
        <LoadingState label="Restoring session" />
      </main>
    );
  }

  if (me.isError) {
    return <main className="grid min-h-screen place-content-center gap-4 p-8"><p>Could not reach your account. Check your connection and try again.</p><button className="underline" onClick={() => void me.refetch()}>Retry</button></main>;
  }

  if (!me.data) {
    return (
      <main
        className={cn(
          "grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]",
          appBackground,
        )}
      >
        <LoadingState label="Preparing app" />
      </main>
    );
  }

  if (profiles.isLoading) {
    return (
      <main
        className={cn(
          "grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]",
          appBackground,
        )}
      >
        <LoadingState label="Loading profiles" />
      </main>
    );
  }

  if (profiles.error || !profiles.data) {
    return <main className="grid min-h-screen place-content-center gap-4 p-8"><p>Could not load profiles.</p><button className="underline" onClick={() => void profiles.refetch()}>Retry</button></main>;
  }

  if (desiredProfile && (me.data.active_profile_id !== desiredProfile || activeProfileId !== desiredProfile)) {
    return <main className="grid min-h-svh place-content-center gap-4 p-8">
      {selectProfileMutation.error ? <><p>Could not restore your profile.</p><button onClick={() => selectProfileMutation.mutate(desiredProfile)}>Retry</button></> : <LoadingState label="Restoring profile" />}
    </main>;
  }

  const selectedToken =
    typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem("wadi.profile.selected_token");
  const requiresSelection =
    profiles.data.length > 1 &&
    (!desiredProfile && (selectedToken !== token || activeProfileId !== me.data.active_profile_id));

  if (requiresSelection) {
    return (
      <main
        className={cn(
          "grid min-h-svh content-center justify-items-center gap-6 px-6 py-[clamp(36px,8vw,96px)]",
          appBackground,
        )}
      >
        <section className="grid w-[min(760px,100%)] gap-6">
            <h1 className=" text-center m-0 text-[clamp(1.5rem,3vw,2.1rem)] font-[560]">
              Who&apos;s watching?
            </h1>
          {selectProfileMutation.error ? <p role="alert">Could not select profile. Please try again.</p> : null}
          <div className="flex flex-wrap justify-center items-center gap-8">
            {profiles.data.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="grid justify-items-center gap-3 p-3 group"
                disabled={selectProfileMutation.isPending}
                onClick={() => selectProfileMutation.mutate(profile.id)}
              >
                <ProfileAvatar
                  name={profile.name}
                  avatarKey={profile.avatar_key}
                  themeColor={profile.theme_color}
                  className="size-16 text-xl transition ring-0 group-hover:ring-4 ring-muted-foreground/40"
                />
                <span className="text-sm font-medium">{profile.name}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return children(me.data);
}
