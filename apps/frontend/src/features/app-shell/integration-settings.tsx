import { useAppStore } from "@/store/app-store";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/api/client";
import { profilesQuery } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsSelect } from "@/components/ui/settings-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Connection = {
  id: string;
  kind: "api_key" | "oauth";
  name: string;
  profile_name: string;
  scopes: string;
  expires_at: string;
  last_used_at: string | null;
};
type Connections = { items: Connection[]; mcp_url: string; api_url: string };


export function IntegrationSettings() {
  const revision = useAppStore(state => state.authRevision);
  const queryKey = ["account-integrations", revision];
  const client = useQueryClient();
  const connections = useQuery({
    queryKey,
    queryFn: () => apiRequest<Connections>("/api/account/integrations"),
  });
  const profiles = useQuery(profilesQuery);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState("");
  const [write, setWrite] = useState(false);
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<Connection | null>(null);
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<{ key: string }>(
        "/api/account/integrations",
        {
          method: "POST",
          body: {
            name,
            profile_id: profile,
            scope: write ? "library:read library:write" : "library:read",
            expires_in_days: Number(days),
          },
        },
      );
      setKey(response.key);
      setName("");
      await client.invalidateQueries({ queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create key.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!revoke) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/account/integrations/${revoke.id}`, {
        method: "DELETE",
      });
      setRevoke(null);
      await client.invalidateQueries({ queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke access.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="api-keys" className="settings-panel grid gap-5">
      <div className="grid gap-2">
        <h2 className="text-base font-medium">API keys & connected apps</h2>
        <p className="text-sm text-muted-foreground">
          Keys belong to your account. Each key or app can access only the
          profile you choose, even when you switch profiles in Wadi. To change
          its profile or permissions, revoke it and connect again.
        </p>
      </div>
      {connections.data && (
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            MCP server URL
            <Input
              readOnly
              value={connections.data.mcp_url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <p className="text-muted-foreground">
            Add this URL to your MCP client. Your browser will open Wadi so you
            can sign in, choose a profile, and approve access. Connections
            expire after 90 days.
          </p>
          <label className="grid gap-1">
            REST API URL
            <Input
              readOnly
              value={connections.data.api_url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <a
            href="https://github.com/westbrookdaniel/wadi/blob/main/docs/integrations.md"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            API documentation and examples ↗
          </a>
        </div>
      )}
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <h3 className="text-sm font-medium">Create an API key</h3>
        <label className="grid gap-2 text-sm">
          Key name
          <Input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My automation"
          />
        </label>
        <label className="grid gap-2 text-sm">
          Profile
          <SettingsSelect
            aria-label="API key profile"
            value={profile}
            onValueChange={setProfile}
            required
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
        <label className="flex items-center gap-3 text-sm">
          <input
            className="size-5 accent-primary"
            type="checkbox"
            checked={write}
            onChange={(event) => setWrite(event.target.checked)}
          />
          Allow adding and removing saved items and creating lists
        </label>
        <p className="text-xs text-muted-foreground">
          Reading lists and searching installed catalogs is included. Keys
          cannot change account settings, install addons, play streams, or
          access other profiles.
        </p>
        <label className="grid gap-2 text-sm">
          Expires after
          <SettingsSelect
            aria-label="API key expiry"
            value={days}
            onValueChange={setDays}
          >
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </SettingsSelect>
        </label>
        <Button
          className="w-fit"
          disabled={
            busy ||
            !name.trim() ||
            !profile ||
            !profiles.data?.some((p) => p.id === profile)
          }
          type="submit"
        >
          Create key
        </Button>
      </form>
      {connections.isLoading && <p role="status">Loading connections…</p>}
      {(error || connections.error || profiles.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || connections.error?.message || profiles.error?.message}
        </p>
      )}
      <div className="grid gap-3">
        <h3 className="text-sm font-medium">Your keys and connections</h3>
        {connections.data?.items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No keys or apps connected.
          </p>
        )}
        {connections.data?.items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="grid gap-1">
              <p className="text-sm font-medium">
                {item.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {item.kind === "oauth" ? "MCP app" : "API key"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {item.profile_name} ·{" "}
                {item.scopes.includes("library:write")
                  ? "Read and write"
                  : "Read only"}{" "}
                ·{" "}
                {Date.parse(item.expires_at) <= connections.dataUpdatedAt
                  ? "Expired"
                  : "Expires"}{" "}
                {new Date(item.expires_at).toLocaleDateString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.last_used_at
                  ? `Last used ${new Date(item.last_used_at).toLocaleString()}`
                  : "Not used yet"}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setRevoke(item)}
            >
              Revoke <span className="sr-only">{item.name}</span>
            </Button>
          </div>
        ))}
      </div>
      <Dialog
        open={key !== null}
        onOpenChange={(open) => {
          if (!open) setKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>
              This key is shown only once. Store it securely; anyone with it can
              use the permissions you selected.
            </DialogDescription>
          </DialogHeader>
          <textarea
            aria-label="New API key"
            readOnly
            value={key ?? ""}
            className="w-full rounded-lg border p-3 font-mono text-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button onClick={() => setKey(null)}>Done</Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={revoke !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRevoke(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoke?.name}?</DialogTitle>
            <DialogDescription>
              This immediately stops this key or app from accessing Wadi. You
              can create a new connection later.
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            Revoke access
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setRevoke(null)}
          >
            Cancel
          </Button>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
