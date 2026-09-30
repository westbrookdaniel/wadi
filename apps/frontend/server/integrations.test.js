import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "./main.js";
import { testDatabase } from "./test-database.js";

async function setup(t, options = {}) {
  let verification;
  const { app, db } = createApp({
    database: await testDatabase(t),
    publicOrigin: "https://wadi.test",
    ...options,
    sendVerificationEmail: async ({ code }) => {
      verification = code;
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (
    path,
    token,
    method = "GET",
    body,
    status = 200,
    extra = {},
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const value = text ? JSON.parse(text) : null;
    assert.equal(response.status, status, `${method} ${path}: ${text}`);
    return value;
  };
  const register = async (email) => {
    const pending = await request(
      "/api/auth/register",
      null,
      "POST",
      { email, password: "test-password" },
      202,
    );
    return request("/api/auth/verify-email", null, "POST", {
      challenge: pending.challenge,
      code: verification,
    });
  };
  const alice = await register("alice@example.com");
  const key = (
    profile = alice.active_profile_id,
    scope = "library:read library:write",
    token = alice.token,
  ) =>
    request(
      "/api/account/integrations",
      token,
      "POST",
      {
        name: "Test automation",
        profile_id: profile,
        scope,
        expires_in_days: 90,
      },
      201,
    );
  return { request, db, base, alice, register, key };
}

test("API keys enforce account, profile, expiry, scopes and revocation; additions are idempotent", async (t) => {
  const { request, db, alice, register, key } = await setup(t);
  const bob = await register("bob@example.com");
  const second = await request(
    "/api/profiles",
    alice.token,
    "POST",
    { name: "Second" },
    201,
  );
  await request(
    "/api/account/integrations",
    alice.token,
    "POST",
    {
      name: "bad",
      profile_id: bob.active_profile_id,
      scope: "library:read",
      expires_in_days: 90,
    },
    400,
  );
  const write = await key();
  const read = await key(alice.active_profile_id, "library:read");
  const other = await key(second.id);
  assert.equal(
    (await request("/api/v1/profile", write.key)).id,
    alice.active_profile_id,
  );
  await request("/api/profiles/select", alice.token, "POST", {
    profile_id: second.id,
  });
  assert.equal(
    (await request("/api/v1/profile", write.key)).id,
    alice.active_profile_id,
  );
  for (const path of [
    "/api/account/export",
    "/api/profiles",
    "/api/account/integrations",
    "/api/addons",
  ])
    await request(path, write.key, "GET", undefined, 401);
  await request("/api/v1/profile", alice.token, "GET", undefined, 401);
  await request(
    "/api/v1/profile?profile_id=" + second.id,
    write.key,
    "GET",
    undefined,
    400,
  );
  await request("/api/v1/profile", write.key, "GET", undefined, 403, {
    Origin: "https://evil.test",
  });
  const lists = await request("/api/v1/lists", write.key);
  const saved = lists.items.find((x) => x.name === "Saved").id;
  await request(
    "/api/v1/lists/" + saved + "/items",
    other.key,
    "GET",
    undefined,
    404,
  );
  const item = {
    media_type: "series",
    media_id: "tt0944947",
    title: "Game of Thrones",
  };
  await request(
    "/api/v1/lists/" + saved + "/items",
    read.key,
    "POST",
    item,
    403,
  );
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(
        "/api/v1/lists/" + saved + "/items",
        write.key,
        "POST",
        item,
        201,
      ),
    ),
  );
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  assert.equal(
    (await request("/api/v1/lists/" + saved + "/items", read.key)).items.length,
    1,
  );
  await request(
    "/api/v1/lists/" + saved + "/items",
    write.key,
    "POST",
    { media_type: "movie", media_id: "tt0111161", title: "Another title" },
    201,
  );
  const page = await request(
    "/api/v1/lists/" + saved + "/items?limit=1",
    read.key,
  );
  assert.equal(page.next_offset, 1);
  const next = await request(
    "/api/v1/lists/" + saved + "/items?limit=1&offset=1",
    read.key,
  );
  assert.equal(next.next_offset, null);
  assert.notEqual(next.items[0].id, page.items[0].id);
  await request(
    "/api/v1/lists/" + saved + "/items/" + next.items[0].id,
    read.key,
    "DELETE",
    undefined,
    403,
  );
  await request(
    "/api/v1/lists/" + saved + "/items/" + next.items[0].id,
    write.key,
    "DELETE",
  );
  assert.equal(
    (
      await db.get(
        "SELECT profile_id FROM list_items WHERE list_id=? LIMIT 1",
        saved,
      )
    ).profile_id,
    alice.active_profile_id,
  );
  await request(
    "/api/v1/lists/" + saved + "/items",
    write.key,
    "POST",
    { ...item, profile_id: second.id },
    400,
  );
  await request(
    "/api/v1/lists/" + saved + "/items",
    write.key,
    "POST",
    { ...item, poster: "javascript:alert(1)" },
    400,
  );
  const list = await request(
    "/api/v1/lists",
    write.key,
    "POST",
    { name: "Weekend" },
    201,
  );
  assert.equal(list.name, "Weekend");
  const exported = await request("/api/account/export", alice.token);
  assert.equal(exported.integrations.length, 3);
  assert.ok(!JSON.stringify(exported).includes(write.key));
  const displayed = await request("/api/account/integrations", alice.token);
  assert.equal(displayed.items.length, 3);
  assert.ok(!JSON.stringify(displayed).includes(write.key));
  assert.ok(!JSON.stringify(displayed).includes("token_hash"));
  await request(
    "/api/account/integrations/" + write.id,
    bob.token,
    "DELETE",
    undefined,
    204,
  );
  await request("/api/v1/profile", write.key);
  await request(
    "/api/account/integrations/" + write.id,
    alice.token,
    "DELETE",
    undefined,
    204,
  );
  await request("/api/v1/profile", write.key, "GET", undefined, 401);
  await db.run(
    "UPDATE integration_grants SET expires_at=? WHERE id=?",
    "2000-01-01T00:00:00.000Z",
    read.id,
  );
  await request("/api/v1/profile", read.key, "GET", undefined, 401);
  await request(
    "/api/profiles/" + second.id,
    alice.token,
    "DELETE",
    undefined,
    204,
  );
  await request("/api/v1/profile", other.key, "GET", undefined, 401);
});

test("OAuth discovery, explicit consent, PKCE, client/resource binding, rotation, replay and revocation", async (t) => {
  const { request, alice, db } = await setup(t);
  const resource = "https://wadi.test/api/mcp";
  const metadata = await request("/.well-known/oauth-authorization-server");
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  assert.equal(
    (await request("/.well-known/oauth-protected-resource/api/mcp")).resource,
    resource,
  );
  await request(
    "/api/oauth/register",
    null,
    "POST",
    { client_name: "bad", redirect_uris: ["https://good.test/cb#fragment"] },
    400,
  );
  await request(
    "/api/oauth/register",
    null,
    "POST",
    { client_name: "bad", redirect_uris: ["http://evil.test/cb"] },
    400,
  );
  const client = await request(
    "/api/oauth/register",
    null,
    "POST",
    {
      client_name: "Test MCP",
      redirect_uris: ["https://client.test/callback"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
  const verifier = randomBytes(32).toString("base64url");
  const params = {
    client_id: client.client_id,
    redirect_uri: "https://client.test/callback",
    response_type: "code",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    scope: "library:read library:write",
    state: "test-state",
    resource,
  };
  await request(
    "/api/oauth/request",
    null,
    "POST",
    { ...params, redirect_uri: "https://evil.test/callback" },
    400,
  );
  await request(
    "/api/oauth/request",
    null,
    "POST",
    { ...params, scope: "account:admin" },
    400,
  );
  await request(
    "/api/oauth/request",
    null,
    "POST",
    { ...params, code_challenge_method: "plain" },
    400,
  );
  assert.equal(
    (await request("/api/oauth/request", null, "POST", params)).client_name,
    "Test MCP",
  );
  await request(
    "/api/account/oauth/authorize",
    null,
    "POST",
    { request: params, profile_id: alice.active_profile_id, approve: true },
    401,
  );
  const denied = await request(
    "/api/account/oauth/authorize",
    alice.token,
    "POST",
    { request: params, approve: false },
  );
  assert.equal(
    new URL(denied.redirect_uri).searchParams.get("error"),
    "access_denied",
  );
  assert.equal(
    (await request("/api/account/integrations", alice.token)).items.length,
    0,
  );
  const approved = await request(
    "/api/account/oauth/authorize",
    alice.token,
    "POST",
    { request: params, profile_id: alice.active_profile_id, approve: true },
  );
  const callback = new URL(approved.redirect_uri);
  assert.equal(callback.searchParams.get("state"), "test-state");
  assert.equal(callback.searchParams.get("iss"), "https://wadi.test");
  const body = {
    grant_type: "authorization_code",
    client_id: client.client_id,
    code: callback.searchParams.get("code"),
    redirect_uri: params.redirect_uri,
    code_verifier: verifier,
    resource,
  };
  await request(
    "/api/oauth/token",
    null,
    "POST",
    { ...body, code_verifier: randomBytes(32).toString("base64url") },
    400,
  );
  await request(
    "/api/oauth/token",
    null,
    "POST",
    { ...body, client_id: randomUUID() },
    400,
  );
  await request(
    "/api/oauth/token",
    null,
    "POST",
    { ...body, resource: "https://evil.test/mcp" },
    400,
  );
  const issued = await request("/api/oauth/token", null, "POST", body);
  assert.equal(issued.expires_in, 3600);
  await request("/api/oauth/token", null, "POST", body, 400);
  await request("/api/v1/profile", issued.access_token, "GET", undefined, 401);
  await request(
    "/api/account/integrations",
    issued.access_token,
    "GET",
    undefined,
    401,
  );
  const call = (token) =>
    request(
      "/api/mcp",
      token,
      "POST",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_profile", arguments: {} },
      },
      200,
      { Accept: "application/json, text/event-stream" },
    );
  assert.equal(
    JSON.parse((await call(issued.access_token)).result.content[0].text).id,
    alice.active_profile_id,
  );
  const refresh = {
    grant_type: "refresh_token",
    client_id: client.client_id,
    resource,
    refresh_token: issued.refresh_token,
  };
  await request(
    "/api/oauth/token",
    null,
    "POST",
    { ...refresh, scope: "library:read account:admin" },
    400,
  );
  const rotated = await request("/api/oauth/token", null, "POST", refresh);
  assert.notEqual(rotated.refresh_token, issued.refresh_token);
  await call(rotated.access_token);
  await request("/api/oauth/token", null, "POST", refresh, 400);
  await request(
    "/api/mcp",
    rotated.access_token,
    "POST",
    { jsonrpc: "2.0", id: 1, method: "ping" },
    401,
    { Accept: "application/json, text/event-stream" },
  );
  assert.equal(
    (await request("/api/account/integrations", alice.token)).items.length,
    0,
  );
  // A second connection can be revoked through the standard OAuth endpoint.
  const again = await request(
    "/api/account/oauth/authorize",
    alice.token,
    "POST",
    { request: params, profile_id: alice.active_profile_id, approve: true },
  );
  const token = await request("/api/oauth/token", null, "POST", {
    ...body,
    code: new URL(again.redirect_uri).searchParams.get("code"),
  });
  const hashes = await db.all("SELECT token_hash FROM integration_tokens");
  assert.ok(hashes.every((row) => row.token_hash.length === 64));
  await request("/api/oauth/revoke", null, "POST", {
    token: token.refresh_token,
    client_id: client.client_id,
  });
  await request(
    "/api/oauth/token",
    null,
    "POST",
    { ...refresh, refresh_token: token.refresh_token },
    400,
  );
});

test("official MCP client can discover and call scoped tools; read-only tools exclude mutations", async (t) => {
  const { base, key, alice, request } = await setup(t);
  const writable = await key();
  const readonly = await key(alice.active_profile_id, "library:read");
  for (const credential of [writable, readonly]) {
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/api/mcp"), {
        requestInit: { headers: { Authorization: `Bearer ${credential.key}` } },
      }),
    );
    t.after(() => client.close());
    const tools = await client.listTools();
    assert.equal(
      tools.tools.some((x) => x.name === "add_item"),
      credential === writable,
    );
    const lists = await client.callTool({ name: "list_lists", arguments: {} });
    const list = JSON.parse(lists.content[0].text).items[0];
    if (credential === writable) {
      const added = await client.callTool({
        name: "add_item",
        arguments: {
          list_id: list.id,
          media_type: "movie",
          media_id: "tt0111161",
          title: "The Shawshank Redemption",
        },
      });
      assert.ok(!added.isError);
      assert.equal(
        JSON.parse(added.content[0].text).profile_id,
        alice.active_profile_id,
      );
    } else {
      const forbidden = await client.callTool({
        name: "add_item",
        arguments: {
          list_id: list.id,
          media_type: "movie",
          media_id: "tt0111161",
          title: "Test",
        },
      });
      assert.equal(forbidden.isError, true);
    }
    await client.close();
  }
  await request("/api/account/password", alice.token, "POST", {
    currentPassword: "test-password",
    newPassword: "replacement-password",
  });
  await request("/api/v1/profile", writable.key, "GET", undefined, 401);
});

test("watch reads return only the connected profile's stored state without stream URLs", async (t) => {
  const { base, request, key, alice } = await setup(t);
  const second = await request("/api/profiles", alice.token, "POST", { name: "Second" }, 201);
  const firstKey = await key(alice.active_profile_id, "library:read");
  const secondKey = await key(second.id, "library:read");
  await request("/api/watch-progress", alice.token, "PUT", {
    media_type: "series", media_id: "show", video_id: "show:1", position_seconds: 42, duration_seconds: 100,
  });
  await request("/api/watch-state", alice.token, "PUT", {
    media_type: "series", media_id: "show", video_id: "show:2", watched: true,
  });
  await request("/api/watch-state", alice.token, "PUT", {
    media_type: "movie", media_id: "film", watched: true,
  });
  await request("/api/profiles/select", alice.token, "POST", { profile_id: second.id });
  await request("/api/watch-state", alice.token, "PUT", {
    media_type: "series", media_id: "show", video_id: "show:3", watched: true,
  });
  const page = await request("/api/v1/watch-history?limit=1", firstKey.key);
  assert.equal(page.profile_id, alice.active_profile_id);
  assert.equal(page.items.length, 1);
  assert.equal(page.next_offset, 1);
  const rest = await request("/api/v1/watch-history?limit=2&offset=1", firstKey.key);
  assert.equal(rest.items.length, 2);
  assert.equal(rest.next_offset, null);
  assert.ok(!JSON.stringify([page, rest]).includes("show:3"));
  const status = await request("/api/v1/watch-status/series/show", firstKey.key);
  assert.deepEqual(status.items.map(item => item.video_id).sort(), ["show:1", "show:2"]);
  const statusPage = await request("/api/v1/watch-status/series/show?limit=1", firstKey.key);
  assert.equal(statusPage.items.length, 1);
  assert.equal(statusPage.next_offset, 1);
  assert.equal((await request("/api/v1/watch-status/series/show?limit=1&offset=1", firstKey.key)).next_offset, null);
  assert.equal(status.items.find(item => item.video_id === "show:1").position_seconds, 42);
  assert.equal(status.items.find(item => item.video_id === "show:2").watched, true);
  assert.deepEqual((await request("/api/v1/watch-status/series/missing", firstKey.key)).items, []);
  await request("/api/v1/watch-status/series/show?media_id=film", firstKey.key, "GET", undefined, 400);
  assert.deepEqual((await request("/api/v1/watch-status/series/show", secondKey.key)).items.map(item => item.video_id), ["show:3"]);
  await request("/api/v1/watch-history?profile_id=" + second.id, firstKey.key, "GET", undefined, 400);

  const client = new Client({ name: "watch-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + "/api/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${firstKey.key}` } },
  }));
  t.after(() => client.close());
  const tools = await client.listTools();
  assert.ok(tools.tools.some(tool => tool.name === "list_watch_history"));
  assert.ok(tools.tools.some(tool => tool.name === "get_watch_status"));
  const history = await client.callTool({ name: "list_watch_history", arguments: { limit: 10 } });
  assert.equal(JSON.parse(history.content[0].text).items.length, 3);
  const lookup = await client.callTool({ name: "get_watch_status", arguments: { media_type: "series", media_id: "show" } });
  assert.equal(JSON.parse(lookup.content[0].text).items.length, 2);
  assert.ok(!JSON.stringify([history, lookup]).includes("stream_url"));
});

test("integration search uses installed catalogs, validates metadata and isolates other accounts", async (t) => {
  let requests = 0;
  const provider = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/manifest.json")
      return res.end(
        JSON.stringify({
          id: "qa",
          name: "QA",
          version: "1.0.0",
          resources: ["catalog"],
          types: ["series"],
          catalogs: [
            { id: "shows", type: "series", extra: [{ name: "search" }] },
          ],
        }),
      );
    assert.equal(req.headers.authorization, undefined);
    assert.ok(req.url.includes("search=Breaking+Bad"));
    requests++;
    res.end(
      JSON.stringify({
        metas: [
          {
            id: "tt0903747",
            name: "Breaking Bad",
            poster: "https://images.example.com/poster.jpg",
            releaseInfo: "2008",
            secret: "private-metadata",
          },
          { id: "tt0903747", name: "Duplicate" },
          { id: 42, name: "Invalid" },
        ],
      }),
    );
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  t.after(() => {
    provider.closeAllConnections();
    provider.close();
  });
  const { request, key, alice, register } = await setup(t, {
    allowPrivateAddons: true,
  });
  await request(
    "/api/addons/install",
    alice.token,
    "POST",
    { url: `http://127.0.0.1:${provider.address().port}/manifest.json` },
    201,
  );
  const credential = await key();
  const result = await request(
    "/api/v1/search?query=Breaking%20Bad&type=series",
    credential.key,
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].media_id, "tt0903747");
  assert.equal(result.searched_catalogs, 1);
  assert.equal(requests, 1);
  assert.ok(!JSON.stringify(result).includes("private-metadata"));
  const bob = await register("bob@example.com");
  const other = await key(bob.active_profile_id, "library:read", bob.token);
  assert.equal(
    (await request("/api/v1/search?query=Breaking%20Bad", other.key))
      .searched_catalogs,
    0,
  );
  assert.equal(requests, 1);
});

test('official MCP OAuth client completes discovery, dynamic registration, PKCE and form token exchange', async t => {
  const {base,request,alice}=await setup(t);
  let information, tokens, verifier, authorizationUrl;
  const provider={
    redirectUrl:'http://127.0.0.1:9000/callback',
    clientMetadata:{client_name:'SDK OAuth QA',redirect_uris:['http://127.0.0.1:9000/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'library:read'},
    clientInformation:()=>information, saveClientInformation:value=>{information=value;},
    tokens:()=>tokens,saveTokens:value=>{tokens=value;},
    saveCodeVerifier:value=>{verifier=value;},codeVerifier:()=>verifier,
    redirectToAuthorization:url=>{authorizationUrl=url;},
  };
  const makeTransport=()=>new StreamableHTTPClientTransport(new URL('https://wadi.test/api/mcp'),{authProvider:provider,fetch:(url,init)=>{ const target=new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url); assert.equal(target.origin,'https://wadi.test'); return fetch(base+target.pathname+target.search,init); }});
  const transport=makeTransport();
  t.after(()=>transport.close());
  const initialClient=new Client({name:'SDK OAuth QA',version:'1.0.0'});
  await assert.rejects(()=>initialClient.connect(transport), /Unauthorized/);
  assert.ok(authorizationUrl);
  const params=Object.fromEntries(authorizationUrl.searchParams);
  assert.equal(params.code_challenge_method,'S256');
  const approved=await request('/api/account/oauth/authorize',alice.token,'POST',{request:params,profile_id:alice.active_profile_id,approve:true});
  await transport.finishAuth(new URL(approved.redirect_uri).searchParams.get('code'));
  assert.ok(tokens.access_token); assert.ok(tokens.refresh_token);
  await initialClient.close();
  const client=new Client({name:'SDK OAuth QA',version:'1.0.0'}); await client.connect(makeTransport()); t.after(()=>client.close());
  const tools=await client.listTools(); assert.ok(tools.tools.some(tool=>tool.name==='get_profile')); assert.equal(tools.tools.some(tool=>tool.name==='add_item'),params.scope.split(' ').includes('library:write'));
  assert.equal(tokens.scope,params.scope);
  await client.close();
});
