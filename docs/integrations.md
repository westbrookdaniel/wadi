# Wadi API and MCP

Connect automations from **Settings → Account → API keys & connected apps**.

## Account ownership, profile access

Keys and connected apps belong to your account, but each is pinned to **one explicitly chosen profile**. That is the default and only profile the credential can access. Switching profiles in Wadi does not retarget an integration. Create separate keys/connections for separate profiles. To change profile or permissions, revoke the old credential and create another.

- `library:read`: identify the connected profile, search installed catalogs, read lists and saved items.
- `library:write`: also create lists and add/remove saved movies or shows. Requires `library:read`.
- No access to account management, addon configuration/secrets, playback URLs, history or other profiles.
- Keys are shown once, stored only as SHA-256 hashes, and expire after 30/90/365 days in the UI (API accepts 1–365).
- Account settings shows permissions, profile, expiry and last use (updated at most every five minutes). Revocation takes effect on subsequent requests. Deleting the selected profile revokes its connections, without moving them to a replacement profile. Changing your account password revokes all keys and OAuth connections.
- Maximum 50 active keys/connections per account. Each credential is limited to 120 requests per minute; handle HTTP 429 with backoff.

## REST API

Base URL: `https://watchwadi.com/api/v1`. Send `Authorization: Bearer <API_KEY>` on each request. Tokens in query parameters and normal Wadi session tokens are not accepted. Treat API keys as secrets; do not embed them in public websites or source control.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/profile` | Confirm the profile this key accesses |
| GET | `/search?query=...&type=series` | Search shows (`series`, default) or `movie` in installed search-capable catalogs |
| GET | `/lists` | Read lists, including the default Saved list |
| POST | `/lists` | Create a list: `{ "name": "Weekend", "description": "Optional" }` |
| GET | `/lists/{list_id}/items` | Read items in a list |
| POST | `/lists/{list_id}/items` | Add a show/movie |
| DELETE | `/lists/{list_id}/items/{item_id}` | Remove an item |

List and item reads accept `limit` (1–100, default 50) and `offset` (default 0). Follow `next_offset` until null. IDs of lists/items from another profile or account return 404. A `profile_id` override in a query/body, or `X-Profile-Id` header, is rejected.

Example (set `WADI_API_KEY` securely in your environment):

```sh
curl --fail-with-body https://watchwadi.com/api/v1/profile \
  -H "Authorization: Bearer $WADI_API_KEY"

curl --fail-with-body 'https://watchwadi.com/api/v1/search?query=Breaking%20Bad&type=series' \
  -H "Authorization: Bearer $WADI_API_KEY"

curl --fail-with-body https://watchwadi.com/api/v1/lists \
  -H "Authorization: Bearer $WADI_API_KEY"

# Replace LIST_ID with the Saved (or another) list id returned above.
curl --fail-with-body https://watchwadi.com/api/v1/lists/LIST_ID/items \
  -H "Authorization: Bearer $WADI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"media_type":"series","media_id":"tt0903747","title":"Breaking Bad"}'
```

An add accepts `media_type` (`movie` or `series`), `media_id`, `title`, and optional HTTPS `poster` and `release_info`. Use IDs returned by search or known IDs supported by your addons. Repeating an add for the same media in the same list returns the existing item without duplicates, including concurrent requests. Additions appear in Wadi's normal watchlists. This API saves titles; it does not download or start playback.

Search uses up to 10 installed search-capable catalogs, returns up to 100 deduplicated items, and reports `searched_catalogs` and `unavailable_catalogs`. Empty results may mean no compatible addon is installed. Partial provider outages do not hide successful results. Only title metadata is returned, never addon configuration or source URLs. Search terms are sent to those providers.

## Remote MCP

Server URL: **`https://watchwadi.com/api/mcp`** (Streamable HTTP).

Add the URL to a client that supports OAuth with dynamic client registration. Wadi opens a browser sign-in/consent page. Choose a profile and approve the requested read-only or read/write permissions. The app name is unverified client metadata; inspect the displayed callback origin. Declining issues no credentials. Connections can be revoked in Account settings.

Tools: `get_profile`, `search_media`, `list_lists`, `list_items`, `create_list`, `add_item`, `remove_item`. Read-only connections do not expose mutation tools. Tools use the same profile checks and operations as REST. Results include the selected profile where relevant, and mutation annotations distinguish add/create from removal.

For clients that allow a manual Authorization header, an API key also works at the MCP endpoint. OAuth access tokens are audience-bound to MCP and cannot be reused against REST or the internal account API. Legacy SSE transport is not supported; stateless Streamable HTTP uses JSON responses and does not require server affinity or persistent sessions. Browser-origin MCP/REST requests are restricted to Wadi's configured origin; use server-side or native clients.

### OAuth details

- Protected resource metadata: `/.well-known/oauth-protected-resource/api/mcp` (also available at the root well-known URL).
- Authorization server metadata: `/.well-known/oauth-authorization-server`.
- Public dynamic registration: `/api/oauth/register`, `token_endpoint_auth_method: none`. Supported redirects are exact-match HTTPS URLs and HTTP loopback URLs; no wildcards, fragments or embedded credentials. Client metadata documents and confidential-client secret authentication are not supported in this release.
- Browser authorization: `/oauth/authorize`. Requires `response_type=code`, client ID, exact redirect URI, `scope`, `resource` equal to the MCP URL, and `code_challenge_method=S256` with a PKCE challenge. `state` is echoed when supplied; clients should generate and verify it. Mandatory PKCE binds the authorization to the initiating client. User consent always requires an explicit profile selection.
- Token endpoint: `/api/oauth/token` (form-encoded or JSON). Authorization-code exchange requires the same client ID, redirect URI and resource, plus code and verifier. Codes expire after five minutes and can be consumed once.
- Access tokens last one hour; refresh tokens rotate on every use and expire after 30 days. Reusing a consumed refresh token revokes the entire connection. Store the replacement refresh token atomically; do not refresh concurrently. The connection itself expires after 90 days and requires renewed browser consent.
- Revocation endpoint: `/api/oauth/revoke`, form-encoded or JSON `token` and `client_id`. Revokes the whole matching connection, including access and refresh tokens. Unknown tokens return success without disclosing ownership.
- Registration is limited to 30 requests/day per server-observed IP and 500/day globally; token/request/revocation endpoints have per-IP limits. Configure trusted proxy handling deliberately before changing IP attribution; forwarded headers are not trusted by default.
- Expired records and abandoned authorizations are cleaned during registration. Consumed refresh hashes remain until expiry for replay detection. No client-secret, implicit or password grant, token passthrough, or automatic consent.

## Deployment and validation

Apply `pnpm db:migrate` before deploying. The migration adds integration tables/indexes and is safe to reapply; it does not modify existing user/profile data. Set server-only `WADI_PUBLIC_ORIGIN` to the canonical HTTPS origin (defaults to `https://watchwadi.com`). Never derive the OAuth issuer from request Host or forwarded headers. Local development allows an explicit HTTP loopback origin. Preview deployments need a matching origin to run a full OAuth flow; never point them at production data for testing.

Next.js rewrites serve the well-known metadata through the same API handler. Consent responses disable framing, caching and referrer transmission. Keep authorization codes and bearer credentials out of hosting/request logs. The official MCP SDK handles protocol parsing and the HTTP transport. Tests run against disposable PostgreSQL schemas and cover profile/account isolation, scopes, expiry, concurrent additions, PKCE, callback/client/resource binding, consent denial, one-time codes, refresh replay, password-change revocation and real SDK calls.

Specifications: [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [official TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).
