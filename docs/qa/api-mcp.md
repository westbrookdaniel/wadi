# API and MCP QA — 0.1.9

Validated on 22 September 2026 against disposable PostgreSQL 18 and a production Next.js build.

- Frontend: 176 tests passed; lint and TypeScript passed.
- API: 18 tests passed, including real PostgreSQL isolation, account/profile boundaries, read/write permissions, expiry, revocation, password-change revocation, pagination, concurrent idempotent adds, and addon search sanitization.
- MCP: official SDK client exercised tool discovery and calls, plus OAuth discovery, dynamic registration, PKCE, form token exchange and reconnect.
- OAuth: rejected invalid redirects, resources, scopes and PKCE; verified denial, single-use codes, refresh rotation and replay revocation.
- Desktop: build and 7 tests passed. Web production build passed.
- Browser: created a write-enabled key for the explicitly selected Family profile, verified one-time secret display and revocation; approved a separate MCP connection for Main, followed its callback and exchanged the code, then verified the MCP profile response. All credentials and accounts used for this check were disposable local fixtures.

Review fixes include account-sensitive query cache keys, clickjacking protection, suppression of the third-party Cast script on consent pages, optional OAuth state for SDK interoperability with PKCE, issuer response metadata, and refresh replay revocation that commits before returning an error. Secrets are stored only as hashes and are excluded from account export.

See [integration documentation](../integrations.md) for deployment requirements and supported client limitations. Production credentials were not created during QA.
