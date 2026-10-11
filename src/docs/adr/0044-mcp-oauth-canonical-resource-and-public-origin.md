# ADR-0044: The MCP Worker has one OAuth resource, `<public origin>/mcp`, and its public origin is configuration

- **Status**: Accepted 2026-10-11 (server 0.68.0, `@cloudflare/workers-oauth-provider` 1.2.3)
- **Source initiative**: none — forced by the library's 0.10.3 → 1.2.3 major upgrade (dependabot PR #534). Extends [ADR-0008](0008-mcp-oauth-embedded-authorization-server.md), which stays the decision record for the embedded authorization server itself.

## Context

`@cloudflare/workers-oauth-provider` 1.x changed what an authorization server has to know about itself. Under 0.x the provider needed no resource: it derived one per request from whatever URL the client fetched, and accepted any `apiRoute`. Under 1.x:

- one **canonical protected resource** is required at construction, every token is bound to it, and a token is only valid where its audience matches both that resource and the request URL;
- every `apiRoute` must be that resource's path or a descendant of it;
- the RFC 9728 metadata document is served at exactly one URL, derived from the resource, and every other path under `/.well-known/oauth-protected-resource` is 404;
- the helpers the provider hands to our consent and admin code (`env.OAUTH_PROVIDER`) are created once per isolate and stay bound to the provider instance that created them.

The Worker met none of that. `oauth/provider.ts` was a module-level singleton with no resource and two API routes, `/mcp` and `/radar/snapshot`. And the Worker had no notion of its own public origin: the issuer, the M2M audience and both metadata documents were read off each request's `url.origin`. Measured on the live deployment on 2026-10-11, that meant:

- `https://status.mcp.globalstrategic.tech/.well-known/oauth-protected-resource` answered 200 with `resource: https://status.mcp.globalstrategic.tech` — an alias hostname presenting itself as an OAuth resource and able to mint M2M tokens with its own audience;
- `http://mcp.globalstrategic.tech/health` answered 200 with no redirect — cleartext requests reach the Worker, so the same inference would have produced an `http` issuer;
- three different resources were advertised on one host (`…/mcp`, `…/radar/snapshot`, and the bare origin at the root path), depending on which well-known URL a client asked for.

Two facts made the choice free rather than constrained. Production `OAUTH_KV` held no `grant:`, `token:` or `client:` key on 2026-10-11 — one trial M2M record and nothing else — so no existing session depended on any of the three advertised resources. And nothing sends an OAuth access token to `/radar/snapshot`: its one real caller is the website's SSR island, with a static key.

## Decision

1. **The OAuth protected resource is the MCP endpoint: `<public origin>/mcp`.** It is the value the M2M path already used as its audience (`canonicalAudience`), the URL clients are told to connect to, and what RFC 9728 §3.3 expects the metadata `resource` to equal.
2. **`/radar/snapshot` is not an OAuth resource.** It is a machine endpoint; it keeps static keys and M2M tokens, which is every caller it has. A grant's `resource:radar:read` scope stays meaningful for MCP `resources/read` on `/mcp`.
3. **The public origin is configuration.** `PUBLIC_ORIGIN` is a `[vars]` entry per environment in `mcp-server/wrangler.toml`. One provider instance is built from it, lazily, per isolate.
4. **The OAuth surface exists on that origin only.** `/authorize`, `/token`, `/.well-known/oauth-*`, `/admin/oauth/*` and `/oauth/introspect` answer 404 on any other origin — an alias hostname, cleartext `http`, or every origin when the variable is unbound (fail closed). Token credentials (OAuth access tokens and M2M JWTs) are honoured on the public origin only. Static keys are origin-agnostic, as before.
5. **Every 401 for `/mcp` on the public origin carries the `resource_metadata` pointer**, including the no-bearer case, with `error="invalid_token"` added only when a bearer was presented. A client's first request has no bearer, and with the metadata document at a single path the pointer is what makes discovery deterministic. This replaces ADR-0008's "401s on token-present failures" rule for `/mcp`; `/radar/snapshot` and off-origin requests keep the bare challenge.

**Rejected:**

- **A bare-origin resource** (`https://mcp.globalstrategic.tech`). One line, and it covers both routes — the library's own error message suggests it. But it depends on clients tolerating a metadata `resource` that is not the URL they connected to, and it makes every path later added to the host an OAuth audience by default.
- **The split `OAuthAuthorizationServer` + `OAuthResourceServer` classes**, declaring `/mcp` and `/radar/snapshot` as two resources. It preserves the old shape exactly, at the cost of routing code we would own, for a second resource with no consumer. **This is the growth path**: if a second OAuth-protected resource is ever needed, adopt these classes rather than widening the resource to the origin.
- **Inferring the origin per request and caching a provider per origin.** It keeps the alias-host and cleartext identities alive, and it is unsafe with sticky helpers: the first provider to reach the default handler would own `env.OAUTH_PROVIDER` for the isolate, so one request on an alias host could bind every later `/authorize` to the wrong resource.
- **Rewriting an `http` request to `https` before delegating**, so the test harness (which presented `http://mcp-staging.globalstrategic.tech`) would satisfy the library's https-only rule. That would also have made the deployed Worker treat cleartext OAuth traffic as TLS. The harness was changed instead: `[dev] upstream_protocol = "https"` in `wrangler.toml` makes `unstable_dev` present the staging host over https, as the deployed Worker sees it.

**Not adopted, on purpose:** the library's optional 1.x consent helpers and `AuthorizationError.redirectTo`. The consent page keeps rendering a failed authorization request locally (`oauth/consent.ts`); nothing here needed them.

## Consequences

- **Wire changes** (server 0.68.0; listed in `mcp-server/BREAKING_CHANGES.md`): the metadata document moved to `/.well-known/oauth-protected-resource/mcp` and the root path is 404; `/radar/snapshot` no longer accepts an OAuth access token; the OAuth surface is 404 on `status.mcp.globalstrategic.tech` and over cleartext; an authorization or token request naming any `resource` other than `<public origin>/mcp` is refused; no-bearer 401s on `/mcp` gained a `WWW-Authenticate` parameter.
- **Existing sessions**: none existed at the decision. A grant created under 0.10.3 between this ADR and the production deploy would be bound to whichever resource its client was shown; if that was not `…/mcp`, the session re-consents once. Checked again immediately before the production approval.
- **A new environment needs `PUBLIC_ORIGIN`** in its `[env.<name>.vars]` block. Without it the Worker serves static keys only. That is deliberately the state of plain `wrangler dev` (no `--env`): it has no route to infer a host from, and a guessed loopback value did not match what the Worker saw when tried. Local OAuth work uses `npm run dev:worker` (`--env staging`), which presents the staging origin.
- **Hostnames are not interchangeable.** A new alias route is not an OAuth origin and will not become one by being added to `routes`. Moving the canonical hostname is a migration: every stored grant is bound to the old resource.
- **Test harness**: `unstable_dev` suites see `https://mcp-staging.globalstrategic.tech` as the request origin (previously `http://…`). Wrangler's dev proxy rewrites that origin inside _response headers_ to its local address, so header assertions there match the path, and `tests/integration/oauth-origin-gate.test.ts` (node pool, direct `fetch`) pins the full strings and the off-origin cases the harness cannot present.
- **Not addressed here**: cleartext requests still reach the Worker and are served for static-key callers. Refusing them belongs at the zone ("Always Use HTTPS"), not in the Worker.
- **Code/docs that carry this decision**: `mcp-server/src/oauth/public-origin.ts`, `mcp-server/src/oauth/provider.ts`, `mcp-server/src/worker.ts` (OAuth-surface branch and the authentication fall-through), `mcp-server/src/auth/bearer.ts` (`authFailureResponse`), `mcp-server/wrangler.toml` (`PUBLIC_ORIGIN`, `[dev]`), `mcp-server/src/docs/ARCHITECTURE.md` § Auth, `mcp-server/src/docs/operations/AUTH.md`, and the suites `tests/integration/oauth-origin-gate.test.ts`, `oauth-metadata.test.ts`, `oauth-flow.test.ts`, `tests/unit/oauth/public-origin.test.ts`.
- **Revisit triggers**: a second resource that needs OAuth (adopt the split classes); a second public hostname that must be a first-class OAuth origin (the single-origin rule, and the single provider, would both have to go).
