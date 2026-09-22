import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
import { fail } from "./integration-library.js";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
const secret = (prefix) => prefix + randomBytes(32).toString("base64url");
const now = () => new Date().toISOString();
const after = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
export const scopes = ["library:read", "library:write"];
const parseScope = (value) => {
  const list = [
    ...new Set(z.string().max(200).parse(value).split(" ").filter(Boolean)),
  ];
  if (!list.includes("library:read") || list.some((s) => !scopes.includes(s)))
    fail(400, "Request library:read and optionally library:write.");
  return list.join(" ");
};
const redirectUri = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        !url.hash &&
        !url.username &&
        !url.password &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS callback, or HTTP on loopback only.");
const oauthError = (error, description, status = 400) =>
  Object.assign(new Error(description), { oauthError: error, status });
const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res
      .status(error.status ?? (error instanceof z.ZodError ? 400 : 500))
      .json({
        error:
          error.oauthError ??
          (error instanceof z.ZodError || error.status === 400
            ? "invalid_request"
            : "server_error"),
        error_description:
          error.status === 500 ||
          (!error.status && !(error instanceof z.ZodError))
            ? "Request could not be completed."
            : error.message,
      });
  }
};

export function integrationAuth(app, { db, publicOrigin }) {
  const parsedOrigin = new URL(publicOrigin);
  if (
    parsedOrigin.origin !== publicOrigin ||
    (parsedOrigin.protocol !== "https:" &&
      !(
        parsedOrigin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname)
      ))
  )
    throw new Error(
      "WADI_PUBLIC_ORIGIN must be an HTTPS origin (or HTTP loopback for development).",
    );
  const resource = publicOrigin + "/api/mcp";
  const rate = async (key, max, seconds = 60) => {
    const row = await db.get(
      "INSERT INTO integration_rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN integration_rate_limits.expires_at<=? THEN 1 ELSE integration_rate_limits.count+1 END,expires_at=CASE WHEN integration_rate_limits.expires_at<=? THEN excluded.expires_at ELSE integration_rate_limits.expires_at END RETURNING count",
      key,
      after(seconds),
      now(),
      now(),
    );
    if (row.count > max) fail(429, "Too many requests. Try again later.");
  };
  const cleanup = async () => {
    await db.run(
      "DELETE FROM integration_rate_limits WHERE expires_at<?",
      after(-86400),
    );
    await db.run("DELETE FROM integration_grants WHERE expires_at<?", now());
    await db.run(
      "DELETE FROM integration_grants WHERE kind='oauth' AND id IN (SELECT grant_id FROM integration_codes WHERE expires_at<?)",
      now(),
    );
    await db.run("DELETE FROM integration_tokens WHERE expires_at<?", now());
    // Retain consumed refresh tokens until expiry to detect replay.
    await db.run(
      "DELETE FROM integration_refresh_tokens WHERE expires_at<?",
      now(),
    );
    await db.run(
      "DELETE FROM integration_clients WHERE created_at<? AND NOT EXISTS (SELECT 1 FROM integration_grants WHERE client_id=integration_clients.id)",
      after(-30 * 86400),
    );
  };
  const validateRequest = async (input) => {
    const params = z
      .object({
        client_id: z.string().max(100),
        redirect_uri: redirectUri,
        response_type: z.literal("code"),
        code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        code_challenge_method: z.literal("S256"),
        scope: z.string().default("library:read"),
        state: z.string().max(2048).optional(),
        resource: z.literal(resource),
      })
      .parse(input);
    const client = await db.get(
      "SELECT * FROM integration_clients WHERE id=?",
      params.client_id,
    );
    if (
      !client ||
      !JSON.parse(client.redirect_uris).includes(params.redirect_uri)
    )
      throw oauthError("invalid_request", "Unknown client or callback URL.");
    return {
      ...params,
      scope: parseScope(params.scope),
      client_name: client.name,
    };
  };
  app.get(
    ["/api/oauth/metadata", "/.well-known/oauth-authorization-server"],
    (_req, res) =>
      res.json({
        issuer: publicOrigin,
        authorization_endpoint: publicOrigin + "/oauth/authorize",
        token_endpoint: publicOrigin + "/api/oauth/token",
        registration_endpoint: publicOrigin + "/api/oauth/register",
        revocation_endpoint: publicOrigin + "/api/oauth/revoke",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
        authorization_response_iss_parameter_supported: true,
        scopes_supported: scopes,
      }),
  );
  app.get(
    [
      "/api/oauth/resource",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ],
    (_req, res) =>
      res.json({
        resource,
        authorization_servers: [publicOrigin],
        scopes_supported: scopes,
        bearer_methods_supported: ["header"],
        resource_name: "Wadi library",
      }),
  );
  app.post(
    "/api/oauth/register",
    wrap(async (req, res) => {
      await rate("register:" + digest(req.ip ?? "unknown"), 30, 86400);
      await rate("register:global", 500, 86400);
      const input = z
        .object({
          client_name: z.string().trim().min(1).max(100),
          redirect_uris: z.array(redirectUri).min(1).max(5),
          token_endpoint_auth_method: z.literal("none").default("none"),
          grant_types: z
            .array(z.enum(["authorization_code", "refresh_token"]))
            .default(["authorization_code", "refresh_token"]),
          response_types: z.array(z.literal("code")).default(["code"]),
        })
        .parse(req.body);
      const client_id = randomUUID();
      await cleanup();
      await db.run(
        "INSERT INTO integration_clients(id,name,redirect_uris) VALUES(?,?,?)",
        client_id,
        input.client_name,
        JSON.stringify(input.redirect_uris),
      );
      res
        .status(201)
        .json({
          ...input,
          client_id,
          client_id_issued_at: Math.floor(Date.now() / 1000),
        });
    }),
  );
  app.post(
    "/api/oauth/request",
    wrap(async (req, res) => {
      await rate("request:" + digest(req.ip ?? "unknown"), 120);
      const value = await validateRequest(req.body);
      res.json({
        client_name: value.client_name,
        redirect_uri: value.redirect_uri,
        scope: value.scope,
      });
    }),
  );
  const issue = async (tx, grant) => {
    const access_token = secret("wadi_at_"),
      refresh_token = secret("wadi_rt_");
    await tx.run(
      "INSERT INTO integration_tokens(token_hash,grant_id,audience,expires_at) VALUES(?,?,?,?)",
      digest(access_token),
      grant.id,
      resource,
      after(3600),
    );
    await tx.run(
      "INSERT INTO integration_refresh_tokens(token_hash,grant_id,expires_at) VALUES(?,?,?)",
      digest(refresh_token),
      grant.id,
      after(30 * 86400),
    );
    return {
      access_token,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token,
      scope: grant.scopes,
    };
  };
  app.post(
    "/api/oauth/token",
    express.urlencoded({ extended: false, limit: "16kb" }),
    wrap(async (req, res) => {
      await rate("token:" + digest(req.ip ?? "unknown"), 120);
      const input = z
        .object({
          grant_type: z.enum(["authorization_code", "refresh_token"]),
          client_id: z.string().max(100),
          resource: z.literal(resource),
          code: z.string().max(100).optional(),
          redirect_uri: redirectUri.optional(),
          code_verifier: z
            .string()
            .regex(/^[A-Za-z0-9._~-]{43,128}$/)
            .optional(),
          refresh_token: z.string().max(100).optional(),
          scope: z.string().optional(),
        })
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        if (input.grant_type === "authorization_code") {
          if (!input.code || !input.code_verifier || !input.redirect_uri)
            throw oauthError(
              "invalid_request",
              "Code, callback and PKCE verifier are required.",
            );
          const code = await tx.get(
            "DELETE FROM integration_codes WHERE code_hash=? AND challenge=? AND redirect_uri=? AND resource=? AND expires_at>? AND grant_id IN (SELECT id FROM integration_grants WHERE client_id=?) RETURNING grant_id",
            digest(input.code),
            createHash("sha256")
              .update(input.code_verifier)
              .digest("base64url"),
            input.redirect_uri,
            resource,
            now(),
            input.client_id,
          );
          const grant =
            code &&
            (await tx.get(
              "SELECT * FROM integration_grants WHERE id=? AND expires_at>?",
              code.grant_id,
              now(),
            ));
          if (!grant)
            throw oauthError(
              "invalid_grant",
              "Authorization code is invalid or expired.",
            );
          return issue(tx, grant);
        }
        if (!input.refresh_token)
          throw oauthError("invalid_request", "Refresh token is required.");
        // Lock the grant so simultaneous refreshes serialize; replay revokes the entire connection.
        const grant = await tx.get(
          "SELECT g.* FROM integration_grants g JOIN integration_refresh_tokens r ON r.grant_id=g.id WHERE r.token_hash=? AND g.client_id=? AND g.expires_at>? AND r.expires_at>? FOR UPDATE OF g",
          digest(input.refresh_token),
          input.client_id,
          now(),
          now(),
        );
        if (!grant)
          throw oauthError(
            "invalid_grant",
            "Refresh token is invalid or expired.",
          );
        if (
          input.scope !== undefined &&
          parseScope(input.scope) !== grant.scopes
        )
          throw oauthError("invalid_scope", "Reconnect to change permissions.");
        const refresh = await tx.get(
          "SELECT used_at FROM integration_refresh_tokens WHERE token_hash=?",
          digest(input.refresh_token),
        );
        if (refresh.used_at) {
          await tx.run("DELETE FROM integration_grants WHERE id=?", grant.id);
          return null; // Commit revocation before returning the OAuth error.
        }
        await tx.run(
          "UPDATE integration_refresh_tokens SET used_at=? WHERE token_hash=?",
          now(),
          digest(input.refresh_token),
        );
        return issue(tx, grant);
      });
      if (!result)
        throw oauthError(
          "invalid_grant",
          "Refresh token was reused. Reconnect this application.",
        );
      res.json(result);
    }),
  );
  app.post(
    "/api/oauth/revoke",
    express.urlencoded({ extended: false, limit: "16kb" }),
    wrap(async (req, res) => {
      await rate("revoke:" + digest(req.ip ?? "unknown"), 120);
      const input = z
        .object({ token: z.string().max(100), client_id: z.string().max(100) })
        .parse(req.body);
      await db.run(
        "DELETE FROM integration_grants WHERE client_id=? AND id IN (SELECT grant_id FROM integration_tokens WHERE token_hash=? UNION SELECT grant_id FROM integration_refresh_tokens WHERE token_hash=?)",
        input.client_id,
        digest(input.token),
        digest(input.token),
      );
      res.status(200).json({});
    }),
  );
  const authenticate = (audience) => async (req, res, next) => {
    if (req.headers.origin && req.headers.origin !== publicOrigin)
      return res.status(403).json({ error: "Origin is not allowed." });
    const token = /^Bearer ([A-Za-z0-9_-]{1,100})$/i.exec(
      req.headers.authorization ?? "",
    )?.[1];
    const grant =
      token &&
      (await db.get(
        "SELECT g.* FROM integration_tokens t JOIN integration_grants g ON g.id=t.grant_id JOIN profiles p ON p.id=g.profile_id AND p.user_id=g.user_id JOIN users u ON u.id=g.user_id WHERE t.token_hash=? AND t.expires_at>? AND g.expires_at>? AND (t.audience=? OR (g.kind='api_key' AND t.audience='api')) AND u.email_verified_at IS NOT NULL",
        digest(token),
        now(),
        now(),
        audience,
      ));
    if (!grant)
      return res
        .set(
          "WWW-Authenticate",
          `Bearer resource_metadata="${publicOrigin}/.well-known/oauth-protected-resource/api/mcp"`,
        )
        .status(401)
        .json({ error: "A valid integration token is required." });
    await rate("grant:" + grant.id, 120);
    await db.run(
      "UPDATE integration_grants SET last_used_at=? WHERE id=? AND (last_used_at IS NULL OR last_used_at<?)",
      now(),
      grant.id,
      after(-300),
    );
    req.integration = grant;
    next();
  };
  const management = () => {
    app.get("/api/account/integrations", async (req, res) => {
      const items = await db.all(
        "SELECT g.id,g.kind,g.name,g.scopes,g.profile_id,p.name AS profile_name,g.created_at,g.expires_at,g.last_used_at FROM integration_grants g JOIN profiles p ON p.id=g.profile_id WHERE g.user_id=? ORDER BY g.created_at DESC",
        req.user.id,
      );
      res.json({ items, mcp_url: resource, api_url: publicOrigin + "/api/v1" });
    });
    app.post("/api/account/integrations", async (req, res) => {
      const input = z
        .object({
          name: z.string().trim().min(1).max(100),
          profile_id: z.string().min(1).max(100),
          scope: z.string(),
          expires_in_days: z.number().int().min(1).max(365),
        })
        .strict()
        .parse(req.body);
      const scope = parseScope(input.scope);
      const key = secret("wadi_key_"),
        id = randomUUID(),
        expires = after(input.expires_in_days * 86400);
      await db.transaction(async (tx) => {
        await tx.get("SELECT id FROM users WHERE id=? FOR UPDATE", req.user.id);
        if (
          !(await tx.get(
            "SELECT id FROM profiles WHERE id=? AND user_id=?",
            input.profile_id,
            req.user.id,
          ))
        )
          fail(400, "Choose one of your profiles.");
        const count = await tx.get(
          "SELECT count(*)::int AS count FROM integration_grants WHERE user_id=? AND expires_at>?",
          req.user.id,
          now(),
        );
        if (count.count >= 50)
          fail(
            400,
            "Revoke an existing key or connection before creating another.",
          );
        await tx.run(
          "INSERT INTO integration_grants(id,user_id,profile_id,kind,name,scopes,expires_at) VALUES(?,?,?,'api_key',?,?,?)",
          id,
          req.user.id,
          input.profile_id,
          input.name,
          scope,
          expires,
        );
        await tx.run(
          "INSERT INTO integration_tokens(token_hash,grant_id,audience,expires_at) VALUES(?,?,?,?)",
          digest(key),
          id,
          "api",
          expires,
        );
      });
      res.status(201).json({ id, key, expires_at: expires });
    });
    app.delete("/api/account/integrations/:id", async (req, res) => {
      await db.run(
        "DELETE FROM integration_grants WHERE id=? AND user_id=?",
        req.params.id,
        req.user.id,
      );
      res.sendStatus(204);
    });
    app.post("/api/account/oauth/authorize", async (req, res) => {
      await rate("consent:" + req.user.id, 30);
      const input = z
        .object({
          request: z.unknown(),
          profile_id: z.string().max(100).optional(),
          approve: z.boolean(),
        })
        .strict()
        .parse(req.body);
      const params = await validateRequest(input.request);
      const callback = new URL(params.redirect_uri);
      if (params.state !== undefined) callback.searchParams.set("state", params.state);
      callback.searchParams.set("iss", publicOrigin);
      if (!input.approve) {
        callback.searchParams.set("error", "access_denied");
        return res.json({ redirect_uri: callback.href });
      }
      const code = secret(""),
        id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.get("SELECT id FROM users WHERE id=? FOR UPDATE", req.user.id);
        if (
          !(await tx.get(
            "SELECT id FROM profiles WHERE id=? AND user_id=?",
            input.profile_id ?? "",
            req.user.id,
          ))
        )
          fail(400, "Choose one of your profiles.");
        const count = await tx.get(
          "SELECT count(*)::int AS count FROM integration_grants WHERE user_id=? AND expires_at>?",
          req.user.id,
          now(),
        );
        if (count.count >= 50)
          fail(
            400,
            "Revoke an existing key or connection before connecting another.",
          );
        await tx.run(
          "INSERT INTO integration_grants(id,user_id,profile_id,kind,name,scopes,client_id,expires_at) VALUES(?,?,?,'oauth',?,?,?,?)",
          id,
          req.user.id,
          input.profile_id,
          params.client_name,
          params.scope,
          params.client_id,
          after(90 * 86400),
        );
        await tx.run(
          "INSERT INTO integration_codes(code_hash,grant_id,redirect_uri,challenge,resource,expires_at) VALUES(?,?,?,?,?,?)",
          digest(code),
          id,
          params.redirect_uri,
          params.code_challenge,
          resource,
          after(300),
        );
      });
      callback.searchParams.set("code", code);
      res.json({ redirect_uri: callback.href });
    });
  };
  return { authenticate, management, resource };
}
