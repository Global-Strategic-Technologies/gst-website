# ADR-0013: The MCP Worker serves protocol `2026-07-28` only; stdio keeps serving the legacy era

- **Status**: Accepted (2026-08-03, `@gst/mcp-server` 0.44.0)
- **Source initiative**: BL-106 (design doc: [`../development/MCP_SERVER_SPEC_2026_07_28_ALIGNMENT_BL-106.md`](../development/MCP_SERVER_SPEC_2026_07_28_ALIGNMENT_BL-106.md) — open at time of writing; archive on closure per the initiative-doc lifecycle)

## Context

MCP released protocol revision `2026-07-28`, removing sessions and the `initialize` handshake. Our server spoke `2025-11-25`, capped by `@modelcontextprotocol/sdk@1.30.0`.

The deadline was never the specification's. Deprecated features there sit behind a twelve-month floor (earliest removal on or after 2027-07-28). The actual forcing function was our own dependency: `mcp-server/src/pipeline/handle-authenticated.ts` passed a v1 `McpServer` instance to `agents`' `createMcpHandler`, an overload `agents@0.20.1` marks `@deprecated` with removal "in the next major version" — a release we do not control. That warning fired on every request.

Two operator directives shaped the response (2026-08-03): **do not maintain backwards compatibility**, since no external clients exist; and **simplicity, elegance and maintainability** as the governing design policy.

The client picture is asymmetric, and that asymmetry is the substance of this ADR:

- **Remote Worker** — verified to have no external consumers. The website reads `GET /radar/snapshot` over plain HTTP, not MCP RPC (`src/components/radar/RadarFeed.astro`), and no M2M or OAuth clients are provisioned.
- **stdio** — has an active, committed client. The git-tracked `.mcp.json` at the repo root registers this server as `gst` for every Claude Code session in the project, and `mcp-server/README.md` documents Claude Desktop besides. Their protocol revision is third-party and not ours to schedule.

## Decision

**Migrate to `@modelcontextprotocol/server@2.0.0` and set the protocol era per transport rather than globally.**

1. **Worker: `legacy: 'reject'`.** Modern-only. A compatibility lane would serve nobody, and carrying it would preserve the deprecated dependency path this migration exists to leave.

2. **stdio: `legacy: 'serve'`** (the `serveStdio` default). _Rejected: applying `reject` here for consistency._ That was the initial choice and it was wrong. Directive 6's active-client rule requires a coordinated migration of every known caller **or** a compat shim at the same boundary; `reject` on stdio has neither, and `'serve'` **is** the shim. It costs nothing structurally — `serveStdio` pins one instance from the same factory per connection, so there is no second code path, no duplicated registration, no divergent handler. The failure modes are also not comparable: the Worker's is caught by CI or a probe, stdio's is a human noticing their tools vanished mid-session. Consistency is a weaker value than not breaking a client we ship the registration for.

3. **`src/auth/cors.ts` becomes the sole origin authority**, via `allowedOriginHostnames: '*'` and `corsOptions: false` on the handler. _Rejected: letting the SDK handler keep its own gate._ Its default accepted-origin set is the localhost trio, so on a custom domain it answers **403** to every request carrying `Origin: https://claude.ai` — precisely the browser clients our allowlist exists to serve, and a failure mode the legacy handler did not have. Its default CORS additionally emits `Access-Control-Allow-Origin: *`, which `withCors` only overwrote for allowlisted origins; disabling it closes that pre-existing wildcard leak. Two origin policies were never going to stay consistent; one is simpler and the one we audit.

4. **Keep the `agents` dependency.** _Rejected: dropping it for `@modelcontextprotocol/server` directly._ Note the tempting reason for keeping it is false — after decision 3 the wrapper performs no origin or host gating at all, so "we would have to re-implement its security gate" is empty. The reasons that hold: it is the Cloudflare-supported seam for the v2 factory; removing it is a separate change with its own risk profile; and if the deferred Tasks work activates, `agents` is the Durable Objects / Workflows path. What remains of the wrapper is exact `/mcp` route matching plus the `AsyncLocalStorage` auth-context wrapper.

5. **Keep the Logging capability** that carries the 80%-consumed soft-limit warning ([ADR-0010](0010-per-client-rate-limit-tiers.md)), despite SEP-2577 deprecating it. _Rejected: folding the signal into the `RateLimit-*` headers._ Not like-for-like — headers reach client code, the notification reaches the model's context. Collapsing them loses a signal rather than removing a concept. The twelve-month window makes this revisitable, not urgent.

6. **Keep the body-parse tool-name dispatch** in `src/dispatch/extract-tool-name.ts`. _Rejected: reading the new `Mcp-Name` header instead._ The header is allowed to carry a base64 sentinel (`=?base64?…?=`) which the SDK decodes before its own cross-check — so a naive header read would see an encoded `search_radar` as an opaque string, miss `RADAR_TOOLS`, and fall through to the general rate-limit tier, bypassing the bucket that protects the Inoreader budget for a request the SDK then executes. The header's value is at the Cloudflare edge, a different layer from this in-Worker gate.

**Deferred with triggers** (unchanged from BL-106): the Tasks extension and MRTR. Both fit real surfaces — Tasks for `compose_dossier_envelope` and XLSX generation, MRTR for mid-call clarification — and neither has a consuming client. Triggers: a client times out on a long-running tool, or a design partner appears.

## Consequences

**Code and config citing this decision**: `mcp-server/src/pipeline/handle-authenticated.ts` (era, origin, CORS options), `mcp-server/src/index.ts` (stdio era), `mcp-server/src/auth/cors.ts`, `mcp-server/src/dispatch/extract-tool-name.ts`, `mcp-server/wrangler.toml` (`nodejs_compat` rationale), `mcp-server/src/docs/ARCHITECTURE.md` § SDK and § Streamable HTTP binding.

**Compatibility**: the remote Worker no longer serves `2025-11-25`. This is a breaking wire change, recorded in `mcp-server/BREAKING_CHANGES.md`. Rollback is one token — but note the two enums differ: `agents` takes `'stateless' | 'reject'`, `serveStdio` takes `'serve' | 'reject'`.

**Known spec deviation, accepted**: revision `2026-07-28` says servers **MUST** validate the `Origin` header and respond `403` when it is present and invalid. `src/auth/cors.ts` does not — it omits the `Access-Control-Allow-*` headers instead, so the browser blocks the cross-origin _read_ while the request itself still executes. That behaviour predates this ADR, but decision 3 makes `cors.ts` the sole origin authority, so the deviation is now wholly ours and is recorded here rather than left implicit. Accepted because the exposure the MUST targets (DNS rebinding) needs an ambient credential to be worth stealing, and `/mcp` has none: authentication is a bearer token the attacker page cannot supply, and the one cookie in the server (`mcp_reauth_session`) is path-scoped to `/admin/inoreader/reauth/`. Revisit if `/mcp` ever accepts cookie or session auth — at which point returning `403` for a present-and-disallowed `Origin` becomes the correct behaviour, not just defence in depth.

**Operational edges**:

- `nodejs_compat` cannot be retired. The `agents` stateless handler imports `node:async_hooks` at module top; the flag is load-bearing for the handler, not just its transitive dependencies. The pre-BL-106 comment in `wrangler.toml` claiming otherwise was wrong and is corrected.
- `@modelcontextprotocol/sdk@1.30.0` remains in the dependency tree as an `agents` peer, so the root `package.json` `overrides` entry pinning its `hono` / `express-rate-limit` transitives **must stay**.
- The instance→factory move means construction-time throws now surface per request inside the handler as `-32603` rather than once at build time. This is why the BL-076 IRL body cache resolves lazily: eagerly, one tool's Upstash dependency turned every request — including `tools/list`, and the fourteen tools that never read it — into an internal error. The R-3 invariant is unchanged (an unbound Worker still throws rather than silently degrading to in-memory), only its timing.

**Accepted trade-off**: modern-only on the Worker bets that no future consumer of the remote surface predates `2026-07-28`. Cheap, because the fallback is one token and there is nobody to coordinate with. Should a prospective client turn up on an older revision, flipping to `'stateless'` restores the lane without a redesign.

**Revisit triggers**: a client requires `2025-11-25` on the remote surface; `agents` ships the major that removes the v1 path (verify nothing else regressed); SEP-2577's Logging removal is actually scheduled (decision 5); or the Tasks deferral fires (decision 4's reversibility note).
