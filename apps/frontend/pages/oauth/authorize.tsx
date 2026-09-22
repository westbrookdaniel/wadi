import { useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { AuthPage, AuthShell } from "@/features/auth/auth-pages";
import { apiRequest } from "@/api/client";
import { profilesQuery } from "@/api/queries";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { SettingsSelect } from "@/components/ui/settings-select";

function Consent() {
  const router = useRouter();
  const token = useAppStore((state) => state.token);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [profile, setProfile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const details = useQuery({
    queryKey: ["oauth-request", router.query],
    enabled: router.isReady,
    retry: false,
    queryFn: () =>
      apiRequest<{ client_name: string; redirect_uri: string; scope: string }>(
        "/api/oauth/request",
        { method: "POST", body: router.query },
      ),
  });
  const profiles = useQuery({ ...profilesQuery, enabled: Boolean(token) });
  const account = useQuery({
    queryKey: ["oauth-account"],
    enabled: Boolean(token),
    queryFn: () => apiRequest<{ email: string }>("/api/auth/me"),
  });
  if (details.error)
    return (
      <AuthShell
        title="Cannot connect this app"
        body="The authorization request is invalid or expired."
      >
        <p role="alert">Return to your MCP client and start again.</p>
      </AuthShell>
    );
  if (!details.data)
    return (
      <AuthShell
        title="Connect to Wadi"
        body="Checking the connection request…"
      >
        {null}
      </AuthShell>
    );
  if (!token) return <AuthPage mode={mode} onModeChange={setMode} />;
  const authorize = async (approve: boolean) => {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ redirect_uri: string }>(
        "/api/account/oauth/authorize",
        {
          method: "POST",
          body: {
            request: router.query,
            profile_id: profile || undefined,
            approve,
          },
        },
      );
      window.location.assign(result.redirect_uri);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not connect. Try again.",
      );
      setBusy(false);
    }
  };
  return (
    <AuthShell
      title={`Connect ${details.data.client_name}?`}
      body={`Signed in as ${account.data?.email ?? "…"}`}
    >
      <p className="text-sm text-muted-foreground">
        This app can search your installed catalogs and read saved lists
        {details.data.scope.includes("library:write")
          ? ", create lists, and add or remove saved shows and movies"
          : ""}{" "}
        in the profile below. It cannot access your other profiles or account
        settings.
      </p>
      <label className="grid gap-2 text-sm">
        Allow access to profile
        <SettingsSelect
          aria-label="Connected profile"
          value={profile}
          onValueChange={setProfile}
        >
          <option value="" disabled>
            Choose a profile
          </option>
          {profiles.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SettingsSelect>
      </label>
      <p className="break-all text-xs text-muted-foreground">
        The app name is supplied by its developer and is not verified by Wadi.
        After approval you will return to{" "}
        <strong>{new URL(details.data.redirect_uri).origin}</strong>. Continue
        only if you started this connection.
      </p>
      <p className="text-xs text-muted-foreground">
        Access expires in 90 days. Revoke it anytime in Account settings → API
        keys & connected apps.
      </p>
      <div className="flex gap-3">
        <Button
          disabled={
            busy || !profile || !profiles.data?.some((p) => p.id === profile)
          }
          onClick={() => void authorize(true)}
        >
          Allow access
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void authorize(false)}
        >
          Cancel
        </Button>
      </div>
      {(error || profiles.error || account.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || profiles.error?.message || account.error?.message}
        </p>
      )}
    </AuthShell>
  );
}
export default function OAuthAuthorize() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Consent />
    </QueryClientProvider>
  );
}
// Next.js page data export is required for consent security headers.
// eslint-disable-next-line react-refresh/only-export-components
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  return { props: {} };
};
