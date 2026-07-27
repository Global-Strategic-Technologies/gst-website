# MCP Server Architecture

> **Audience**: engineers working on the `@gst/mcp-server` workspace; agents needing system context.
>
> **Status**: **maintained** — this is the living architecture reference for the MCP server. It replaces ~380KB of frozen initiative prose (BL-031, BL-032, BL-032.5, BL-032.75, BL-032.8 design docs, all archived at [`src/docs/development/_archive/`](../../../src/docs/development/_archive/README.md)) with the distilled, verified current state. Update this doc when the architecture changes; per-initiative rationale for _why_ a decision was made lives in the archived originals and in ADRs under `src/docs/adr/`.
>
> **Companions**: [`README.md`](README.md) (doc navigator) · [`operations/`](operations/) (procedures: DEPLOY, AUTH, RATE_LIMITS, REMOTE_CLIENT_SETUP, SENTRY_ALERT_RULES) · [`tools/README.md`](tools/README.md) (input contracts) · [`../../observability/`](../../observability/) (SLO baselines + runbooks)

**Contents**: [System shape](#system-shape) · [Remote transport & request flow](#remote-transport--request-flow) · [Auth, CORS & deploy topology](#auth-cors--deploy-topology) · [Rate limiting & Inoreader budget](#rate-limiting--inoreader-budget) · [Resources & Prompts on the remote transport](#resources--prompts-on-the-remote-transport) · [Radar pipeline](#radar-pipeline-single-caller-unification) · [Observability](#observability)

---

## System shape

The GST MCP server (`@gst/mcp-server`, the `mcp-server/` workspace) exposes GST's Hub engines to any MCP-aware client — Claude Desktop, Claude Code, Cursor — as native tools inside the conversation, eliminating the browser round-trip through the website's wizards.

### The three MCP primitives, as GST uses them

MCP servers publish three capability kinds, and GST registers all three. **Tools** are the core surface: 17 registered tools wrapping the pure engines — diligence agenda generation, portfolio search + facets, ICG assessment, TechPar, tech-debt cost estimation, regulation search + facets, live radar (`search_radar`, `get_latest_insights`), and the IRL family (`generate_information_request_list_xlsx`, `list_irl_requests`, `validate_irl_provenance`, `prepare_irl_body`, `compose_dossier_envelope`), plus the stdio-only `search_radar_offline` (and its deprecated `search_radar_cache` alias). **Resources** expose read-only content under `gst://` URIs — Library articles, regulation records, and radar snapshots. **Prompts** are 9 named consultant workflows (`gst_*`-prefixed, registered in `src/prompts/_registry.ts`) that orchestrate the Tools and Resources into repeatable engagements — kickoffs, quick-looks, memos, briefs, IRL ingestion.

### Repo placement and single source of truth

`mcp-server/` is an npm workspace inside the `gst-website` repo (root `package.json` declares `"workspaces": [".", "mcp-server"]`). This is deliberate: the engines the tools wrap live in the website's `src/utils/` (`diligence-engine.ts`, `filterLogic.ts`, `icg-engine.ts`, `irl/*`, …) and the Zod contracts in `src/schemas/`, and the MCP wrappers reach them via **relative imports** (e.g. `import { generateScript } from '../../../src/utils/diligence-engine'` in `src/tools/diligence.ts`). One source of truth means one PR updates wizard config, engine, schema, and MCP surface atomically — engine drift between website and MCP output, the dominant risk of a split repo, is structurally impossible. The operating rule: **engines are the truth; the MCP layer is a thin adapter; schemas are the contract**. Splitting the repo is re-evaluated only if external source review, compliance blast-radius, or a second engine consumer demands it.

### Register-once, transport-twice

The server surface is built by a single factory, `createServer(env, ctx)` in `src/server.ts`, which constructs an `McpServer` (name `gst-mcp`) and registers every transport-portable Tool, Resource, and Prompt. Two entrypoints consume it:

- **stdio** — `src/index.ts` calls `createServer()` plus `registerLocalOnlyTools(server)` from `src/tools/_local-only.ts`, then connects a `StdioServerTransport`. The local-only module holds registrations that depend on `node:fs`/`node:crypto`/`node:path` at module load (the offline radar tool and the filesystem-backed radar Resource reader over `<repo>/.cache/inoreader/`).
- **Worker** — `src/worker.ts` (remote Streamable HTTP on Cloudflare Workers) calls only `createServer(env, { scopes, radarSource: 'worker', metricsSink, keyOwner })`, so the Worker bundle never transitively imports Node-only modules; radar Resources register there with an Upstash-backed reader instead.

`ServerContext` threads per-request concerns (scope grants, metrics sink, key attribution, IRL body cache) into the registry; stdio passes nothing and gets full-grant defaults with no-op metrics. The stdio-vs-Worker registry difference is asserted by the tool-name list in `tests/integration/protocol-roundtrip.test.ts` (a `registry-snapshot.test.ts` was described here and in `src/tools/_local-only.ts` but never existed — dangling cite removed in BL-090).

### SDK

The server is built on the official TypeScript SDK, **`@modelcontextprotocol/sdk` v1.x** (`^1.29.0` in `mcp-server/package.json`), importing `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` and `StdioServerTransport` from `.../server/stdio.js`, with Zod v4 schemas. (The frozen BL-031 doc anticipated a v2 `@modelcontextprotocol/server` package split; that never became the shipped dependency — the single-package SDK remains current.) Handlers return structured MCP errors, never thrown exceptions. Since 0.43.0 (BL-090) every result — success and failure alike — is built by `toolOk()` / `toolFail()` in `src/tools/_result.ts`: the payload (or `{ error, message, … }`) goes to `structuredContent`, and `content[0].text` carries a one-line caption on success or the verbatim message on failure. See [ADR-0011](../../../src/docs/adr/0011-tool-response-channel-policy.md).

### Local stdio discovery and connection

There is no registry for the local path: each client's config file names the compiled entrypoint, e.g. `claude_desktop_config.json` → `mcpServers.gst-tools = { command: "node", args: ["<abs-path>/mcp-server/dist/index.js"] }` (Claude Code uses `.mcp.json` at the repo root; see `mcp-server/README.md` for snippets). The client spawns the server as a child process and speaks JSON-RPC over stdin/stdout — no port, no network, process-level trust. Two invariants follow: stdout is protocol-only (all logging goes to `console.error`), and paths resolve via `import.meta.url`, never `process.cwd()`, because the client spawns the process from an arbitrary cwd. Build is `npm run build` in `mcp-server/` (typecheck + esbuild to `dist/`); updates ship by `git pull` + rebuild, picked up at the next client launch.

_Distilled from MCP_SERVER_ARCHITECTURE_BL-031.md (April 2026) — archived at `src/docs/development/_archive/`._

---

## Remote transport & request flow

The MCP server ships as one codebase with two entrypoints (register-once-transport-twice): `src/index.ts` serves stdio for local clients, and `src/worker.ts` is the Cloudflare Worker (`gst-mcp`) that serves MCP over Streamable HTTP. Both call the same `createServer()` factory in `src/server.ts` — the single source of truth for the transport-portable tool / resource / prompt registry.

### Streamable HTTP binding

MCP-over-HTTP is served by Cloudflare's `agents` SDK (`agents@^0.17.3`): `createMcpHandler` from `agents/mcp` adapts an `McpServer` instance to the Worker's Web `Request`/`Response` runtime, serving JSON-RPC at `/mcp` (prefix-matched — the handler may use sub-paths for session resume). Under the hood the `agents` SDK depends on `@modelcontextprotocol/sdk@^1.29.0` (the v1 single-package family), whose `WebStandardStreamableHTTPServerTransport` is the Workers-compatible transport. `nodejs_compat` in `mcp-server/wrangler.toml` exists solely for the `agents` SDK's transitive Node deps (`mimetext`, `mime-types`); our own Worker code path stays Web-API-only.

The MCP handler is built **per-request** (`createMcpHandler(createServer(env, {...}))`), not per-isolate: radar-live tools capture `env` in handler closures for credential reads and circuit-breaker checks, and Worker isolates process concurrent requests. Construction is registry assembly only (sub-millisecond, no I/O).

### Request pipeline (`src/worker.ts` fetch handler)

Requests pass through, in order:

1. **CORS preflight** — `OPTIONS` with `Access-Control-Request-Method` gets a 204 with origin-checked headers. Never authenticated, never logged.
2. **Public endpoints (no auth)** — `GET /health` returns the JSON health payload (`src/observability/health.ts`: Upstash probe + cached Inoreader status + `GIT_SHA` build provenance); `GET /status` renders a public HTML status page over the same payload plus the alert evaluator's last-run summary, edge-cached 60s (`src/observability/status-page.ts`). Health deliberately never calls Inoreader — it reads a 5-minute-TTL Upstash status cache written by real radar calls, so uptime monitors can't burn API budget.
3. **OAuth surface** (BL-033 Slice 2) — `/authorize`, `/token`, `/.well-known/*`, `/oauth/introspect`, and `/admin/oauth/*` delegate to the embedded authorization server (`src/oauth/provider.ts`, sub-router pattern — see § OAuth below). `grant_type=client_credentials` is intercepted ahead of delegation and served by `src/oauth/m2m-token.ts`.
4. **Admin re-auth surface** — `/admin/inoreader/reauth/*` (operator-driven Inoreader OAuth recovery) is gated by the separate `MCP_ADMIN_KEY`, not team bearers.
5. **Routed-path allowlist** — anything other than `/mcp` (prefix), `/radar/snapshot` (exact), and the OAuth surface 404s _before_ auth runs (`isRoutedPath()` / `isOAuthSurfacePath()` in `worker.ts`). This kills bot-probe noise (`/favicon.ico`, `/.env`, `/wp-admin`) at the source: no auth attempt, no Sentry event, no quota burn.
6. **Authentication — dual validation, cheap-first** — (1) static `MCP_KEY_*` scan (`authenticate()` from `src/auth/bearer.ts`; constant-time, zero I/O, byte-identical to the pre-OAuth behavior); (2) `mcp_m2m_*` self-contained JWT verify (local HMAC, zero I/O); (3) OAuth access-token validation via the provider (KV-backed), whose api-handler re-enters the shared pipeline. Failures 401 with the structured envelope; when a bearer was actually presented, the challenge carries the RFC 9728 `resource_metadata` pointer so OAuth-capable clients auto-discover the flow. `auth.failed` telemetry (safeLog + conditional Sentry) fires only after every path has failed.
7. **Post-auth pipeline** (`src/pipeline/handle-authenticated.ts` — shared by all three auth paths, keyed on the `AuthSuccess {keyOwner, scopes}` contract): per-key sliding-window rate limit (`src/ratelimit/limiter.ts`; tool name extracted from a cloned-body JSON-RPC parse so radar tools hit the stricter tier; exceeded → 429 with `RateLimit-*` headers) → `GET /radar/snapshot` (plain-HTTP convenience endpoint for the website's SSR, gated on `resource:radar:read`) → `createMcpHandler` dispatch. Every response is wrapped with CORS + rate-limit headers on the way out; every request emits a structured `safeLog` line and (when bound) an Analytics Engine event.

The `scheduled` handler dispatches three production crons by `event.cron` (see the deploy-topology table below), with a single-flight Upstash lock keyed on `cron:scheduledTime` deduplicating Cloudflare's documented double-invocations.

### Transport binding per tool (Q12)

Tools whose implementations need `node:fs` / `node:crypto` are **stdio-only**: `src/tools/_local-only.ts` registers `search_radar_offline` (plus its deprecated `search_radar_cache` alias) and the node:fs-backed radar Resource reader, and is called only by `src/index.ts` — never by `worker.ts`. Everything registered inside `createServer()` is transport-portable. The live/offline radar split: `search_radar` (Upstash + Inoreader via `content/radar-live-store.ts`) is the canonical tool on both transports; `search_radar_offline` (filesystem snapshot via `content/radar-snapshot.ts`) remains the dev/CI/budget-exhausted fallback, stdio-only. The rename decision record (`search_radar_cache` → `search_radar_offline`) lives in the archived BL-032 doc, Q2. A schema-drift CI test (`tests/integration/registry-snapshot.test.ts`) snapshots both registries and asserts the diff is exactly the declared local-only set.

**Public-contract discipline**: any change to the public surface (tool names, input schemas, endpoint paths, auth semantics) ships with a version bump and an entry in `mcp-server/BREAKING_CHANGES.md`.

## Auth, CORS & deploy topology

### Dual auth: static bearers + OAuth 2.1 (Q11/Q13 → BL-033)

Two credential families validate on the same endpoints, cheap-first (decision record: [ADR-0008](../../../src/docs/adr/0008-mcp-oauth-embedded-authorization-server.md)):

**Static bearer tokens** — one per teammate/integration, stored as Wrangler secrets named `MCP_KEY_<INITIALS>` (e.g. `MCP_KEY_RP`). `src/auth/bearer.ts` enumerates all `MCP_KEY_*` bindings at runtime via `Object.entries(env)` — adding a teammate is one `wrangler secret put`, no code change. The matched secret's suffix becomes the `keyOwner` used for log attribution and rate-limit bucketing; the token value itself is never logged or returned; comparison is constant-time (`src/auth/timing-safe-equal.ts`). This path is byte-identical to the pre-OAuth behavior — the website's `MCP_KEY_WEBSITE_RADAR`, the latency probe's `MCP_KEY_PROBE`, and legacy bridge configs keep working unchanged.

**OAuth 2.1 (embedded authorization server)** — `@cloudflare/workers-oauth-provider` (exact-pinned) mounted as a sub-router from `worker.ts`, backed by the `OAUTH_KV` namespace. The MCP-spec surface: RFC 8414 AS metadata + RFC 9728 protected-resource metadata at `/.well-known/*`, PKCE S256-only, DCR disabled (pre-registration via admin endpoints + CIMD for Claude-family clients), 1h access tokens with rotating 30-day refresh tokens. **Identity is a delegation layer over the key roster**: the `/authorize` consent page authenticates the human via their existing `MCP_KEY_*` value (same constant-time `matchToken` core), grants scopes = requested ∩ key scopes, and stamps `keyOwner OAUTH:<owner>`. This is what makes Claude's native Connectors UI work against the Worker (see `operations/REMOTE_CLIENT_SETUP.md`).

**M2M client_credentials** — headless machine clients (`/admin/oauth/m2m-clients` registry in OAUTH_KV) exchange `grant_type=client_credentials` at `/token` (our branch — the library has no such grant) for **self-contained HS256 JWTs** (`mcp_m2m_*`, signed with `OAUTH_M2M_SIGNING_KEY`, 1h, audience-bound, no refresh token). Client auth: RFC 7523 `private_key_jwt` (preferred; ES256 vs registered JWKS, ≤5-min assertions, jti replay check) or hashed-secret compare. Verification is zero-I/O on the request path; revocation semantics (record-delete vs signing-key rotation) in ADR-0008 + `operations/AUTH.md`.

**Introspection** — `POST /oauth/introspect` (RFC 7662, `MCP_ADMIN_KEY`-gated) reports token liveness/scopes for support; M2M tokens are cross-checked against the client record so revoked clients report inactive during their ≤1h residual.

**Scopes** (`src/auth/scopes.ts`): coarse-grained permission strings carried on the auth result — `tool:*`, `prompt:*`, and per-family `resource:<family>:read`, with `prefix:*` wildcard matching — **identical strings across all three auth paths**; the `AuthSuccess {keyOwner, scopes}` contract feeds the shared post-auth pipeline. Every team key gets `DEFAULT_SCOPES` (full grant) unless a companion `MCP_KEY_<OWNER>_SCOPES` env var (JSON string array) narrows it — the mechanism behind `MCP_KEY_WEBSITE_RADAR`, the website's SSR key that carries only `resource:radar:read`; OAuth grants are bounded by the consenting key's scopes; M2M tokens by the client record's `allowedScopes`. Malformed `_SCOPES` JSON fails loud as a 401 at auth time. Scope denials surface as JSON-RPC error `-32002` (`MissingScopeError`).

### CORS (Q5)

`src/auth/cors.ts` holds an explicit origin allowlist: `https://claude.ai`, `https://chatgpt.com`, `https://cursor.sh`, plus the website's `https://globalstrategic.tech` / `https://www.globalstrategic.tech`. Native MCP clients (Claude Desktop, Claude Code, Cursor CLI) send no `Origin` header, so CORS is a no-op for them; the allowlist exists for web-based clients. `Access-Control-Allow-Origin: *` is deliberately forbidden — a wildcard would let any website read MCP responses on a user's behalf. Disallowed origins are not 4xx'd; they simply get no `Access-Control-Allow-*` headers, so the browser blocks the cross-origin read while non-browser callers are unaffected.

### Deploy topology (Q10)

Two Cloudflare Workers environments, declared in `mcp-server/wrangler.toml`:

| Env        | Worker name       | Route (custom_domain)              | Crons                                                                                                          |
| ---------- | ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| staging    | `gst-mcp-staging` | `mcp-staging.globalstrategic.tech` | none (deliberate — staging shares production's Inoreader OAuth app; a staging cron doubles Zone-1 budget burn) |
| production | `gst-mcp`         | `mcp.globalstrategic.tech`         | `0 */6 * * *` radar refresh · `0 14 * * 1` alert-rule synthetic · `*/15 * * * *` SLO alert evaluator           |

The `globalstrategic.tech` DNS zone is on Cloudflare (the website itself deploys to Vercel); the Worker routes are `custom_domain = true` bindings, so DNS records and TLS certs are Cloudflare-managed. Secrets are provisioned per environment via `wrangler secret put <NAME> --env <staging|production>` — the full matrix (bearer keys, Upstash MCP DB, Inoreader OAuth, Sentry DSN, `CF_AE_TOKEN`) is commented in `wrangler.toml` and operationalized in [`operations/DEPLOY.md`](operations/DEPLOY.md).

**CI/CD**: staging auto-deploys via `.github/workflows/deploy-mcp-staging.yml` (`workflow_run` chained off a green "MCP Server Test Suite"); production deploys via `.github/workflows/deploy-mcp-production.yml` on push to `master` touching MCP paths, gated by the `mcp-production` GitHub Environment's required-reviewer approval. Both delegate to `mcp-server/scripts/deploy.mjs`, which injects `GIT_SHA` / `SENTRY_RELEASE` vars and uploads source maps. `rollback-mcp.yml` provides operator rollback. Never manually rebuild/redeploy staging — CI owns it.

### Sentry split (Q6)

The Worker reports to its own Sentry project, `gst-mcp-server` (org `gst-7o`) — separate from the website's project. Two reasons: quota isolation (MCP probe noise and cron events can't crowd out website error budget, and vice versa), and a different runtime SDK — the Worker uses `@sentry/cloudflare` (`withSentry` wrapping the fetch handler only) while the website uses the Node/Astro SDK. The scheduled handler is deliberately SDK-free, posting Sentry envelopes directly (`src/observability/sentry-envelope.ts`) after the SDK's scheduled-wrapper produced spurious `Exception Thrown` reports. Setup and alert rules: `src/docs/development/SENTRY_MANUAL_SETUP.md` § MCP Worker (website repo) + [`operations/SENTRY_ALERT_RULES.md`](operations/SENTRY_ALERT_RULES.md).

### Security boundary vs. the website

The Worker does **not** inherit the website's Content-Security-Policy (the `vercel.json` / `src/middleware.ts` headers documented in `src/docs/security/SECURITY_HEADERS.md`). It is a separate deployment serving a JSON-RPC API to MCP clients, not HTML pages with scripts and styles — CSP doesn't meaningfully apply. Its security posture is instead the stack above: bearer auth, scope gating, the CORS allowlist, the routed-path 404 wall, and per-key rate limits.

## Rate limiting & Inoreader budget

Rationale for the tier design + the soft-limit transport: [ADR-0010](../../../src/docs/adr/0010-per-client-rate-limit-tiers.md). This section records what ships and where.

### Per-key sliding windows (Q7), tier-aware (BL-033 Slice 5)

`src/ratelimit/limiter.ts` uses `@upstash/ratelimit` (`Ratelimit.slidingWindow`, per Q7's "use the library" resolution) against the MCP Upstash DB, keyed by `keyOwner` under the `mcp:ratelimit:*` prefix. Two tool classes:

- **general** — checked on every authenticated request
- **radar** (`search_radar`, `get_latest_insights`; BL-038) — an _additional_ pair, checked on top of the general buckets (additive — radar calls consume from all four)

The four ceilings are **per-client tier-aware** (`src/ratelimit/tiers.ts`, `resolveTierLimits(auth.tier)` → `createLimiter(env, limits)`). The tier (`free-pilot`/`paid`/`enterprise`) is carried on the M2M token claim — not re-fetched from KV — so the limiter reads it locally with no eventual-consistency hazard (the ADR-0008 corollary; ADR-0010 §1). Static `MCP_KEY_*` keys and OAuth human-consent carry no tier → the generous `internal` tier (= the pre-Slice-5 60/1000/5/50, so no regression).

The binding tier (whichever bucket exhausted, or has fewest remaining) drives the 429 envelope's `RateLimit-*` / `Retry-After` headers (`src/ratelimit/headers.ts`); every authenticated response (200 and 429) also carries **`RateLimit-Policy`** advertising the tier ceilings. When any bucket is ≥80% consumed (`CheckResult.minRemainingRatio`), the tool-metrics wrapper (`src/metrics/with-metrics.ts`) emits a best-effort **`notifications/message`** soft-limit warning on the request's SSE stream — which requires the server to declare the `logging` capability (`src/server.ts`); the always-present headers are the guaranteed fallback (ADR-0010 §2). When Upstash credentials aren't bound, the limiter fails open with a `ratelimit.skipped` warning — local `wrangler dev` works without setup; production must have credentials wired. Contract details: [`operations/RATE_LIMITS.md`](operations/RATE_LIMITS.md).

### Inoreader budget

- **Zone-1 hard cap**: `ZONE1_DAILY_HARD_CAP = 100` in `src/lib/inoreader-egress.ts` — the single exported source of truth; the `inoreader-budget-exhausted` alert rule tickets at 70% and pages at 90% of this value.
- **Cron budget math**: the 6-hourly radar refresh (cadence ≥ cache TTL by rule) spends 4 firings × 6 calls = 24/day; the single-flight dedup lock in `worker.ts` keeps Cloudflare double-invocations from doubling that spend.
- **Radar rate tier**: the 5/min + 50/day radar buckets above are defense-in-depth for the same shared budget — one valid bearer can't exhaust upstream quota through cold cache-miss radar calls.

### Circuit breaker

Every Inoreader call site (cron, live tool, the `gst://radar/*` Resources reader, and the `/radar/snapshot` SSR endpoint) routes failures through `src/lib/inoreader-failure-handler.ts`, which opens the breaker in `src/ratelimit/circuit-breaker.ts` on `inoreader-rate-limit` signals and tags a Sentry message with the zone-diagnostic headers; while open, radar reads serve cached data and skip upstream calls until the cool-down elapses.

**How "serve cached data" is enforced (BL-091).** `src/content/radar-live-store.ts` exposes two reader families: the cache-first-then-fetch `readWireLive`/`readFyiLive`, and the cache-only `readWireCached`/`readFyiCached` which are _structurally incapable_ of calling Inoreader (their miss case is a `cache-empty` failure, deliberately not assignable to `InoreaderFailure` so it can never reach `openCircuit`). Every read surface — tools, `gst://radar/*` Resources via `createWorkerSnapshotReader`, and `/radar/snapshot` — checks `isCircuitOpen` and switches families; results carry `liveInfo.degraded` (a tier with nothing cached reports `null` for its `fetchedAt`/`cacheHit`). A hard 503 is now the _last_ resort, returned only when nothing is cached. `tests/integration/radar-store-callers-breaker-gated.test.ts` freezes this structurally: any module importing the fetch-capable readers must also import `isCircuitOpen`, so a new call site can't silently reopen the leak that BL-091 closed on two surfaces. Operator visibility: `circuitOpen` on `/health` and a row on `/status` — deliberately **not** folded into `health.ok`, which is already false in this state. Rationale + the rejected half-open probe: [ADR-0006](../../../src/docs/adr/0006-inoreader-zone1-budget-protection.md).

_Distilled from MCP_SERVER_REMOTE_BL-032.md (May 2026, Q1–Q13 decision records) — archived at `src/docs/development/_archive/`._

---

## Resources & Prompts on the remote transport

Resources and Prompts ride the exact same transport, auth, rate-limit, and metrics substrate as Tools — the Worker's fetch handler runs bearer auth and rate limiting first, then builds a per-request server via `createServer(env, { scopes, radarSource: 'worker', metricsSink, keyOwner })` and adapts it with `createMcpHandler`.

Three `gst://` URI families are published: **library** (`gst://library/<slug>`, 4 articles from `src/content/library-loader.ts`), **regulations** (`gst://regulations/<jurisdiction>/<id>`, 120+ frameworks), and **radar** (`gst://radar/fyi/latest`, `gst://radar/wire/latest`, plus per-category wire URIs — `RADAR_URIS` in `src/resources/radar.ts` is the source of truth). Nine `gst_*` Prompts are registered from `src/prompts/_registry.ts` (`ALL_PROMPTS`). Radar is the only transport-conditional family: the Worker passes `radarSource: 'worker'` so radar Resources register with the Upstash-backed snapshot reader (`src/content/radar-snapshot-reader-worker.ts`), while stdio registers them separately in `src/tools/_local-only.ts` with a `node:fs` reader.

### Server-side resource caching

Because the transport is JSON-RPC over a single POST endpoint, there is no HTTP-level caching (no ETag / `304`). Caching is a server-side read-through in `src/cache/resource-cache.ts`: every Resource handler wraps its compute step with `readThroughCache(...)`, keyed `mcp:resource:<sha256(uri)>` in the Upstash MCP DB. Hits short-circuit recomputation; the layer is invisible to clients and fail-open (no Upstash binding, or any cache error, degrades to a plain compute). Per-family TTLs live in `RESOURCE_TTL_SECONDS`: 24 h for library and regulations, 15 min for radar list snapshots. Radar bodies additionally sit atop the snapshot store keys `mcp:radar:cache:{wire,fyi}` (`src/content/radar-live-store.ts`, 6 h TTL matching the website's former ISR window), which the cron below keeps warm.

### Scope gating

`src/auth/scopes.ts` is the unified scope catalog for the whole surface: `tool:*` (with per-tool and `tool:radar:*` narrowing via wildcard prefix matching), `resource:library:read`, `resource:regulations:read`, `resource:radar:read`, and `prompt:*`. Bearer auth (`src/auth/bearer.ts`) returns `scopes` on `AuthSuccess`; the Worker threads them into `createServer` so handlers can `assertScope(...)` before doing work, throwing `MissingScopeError` (JSON-RPC code `-32002`, carrying `missingScope` + `ownedScopes`). Scope strings are frozen — BL-033's OAuth tokens reuse them verbatim. Today every wrangler-issued key carries the full `DEFAULT_SCOPES` grant, with one production exception: narrow keys holding only `resource:radar:read` serve the website's `GET /radar/snapshot` convenience endpoint, which reuses the same scope that gates MCP reads of radar Resources.

### URI stability and the manifest hash

Published URIs and prompt `name@version` tuples are a public contract — a rename breaks every pinned conversation on every authenticated client. `tests/integration/manifest-stability.test.ts` computes a deterministic sha256 over the sorted union of all library, regulation, and radar URIs plus all prompt name+version tuples and compares it to `EXPECTED_MANIFEST_HASH`, which must match the value recorded in `mcp-server/BREAKING_CHANGES.md`. Any drift fails the test with instructions: document the change in `BREAKING_CHANGES.md`, update the hash in both places, and bump the `mcp-server/package.json` version (semver-as-contract). Per-family URI/count/canary assertions live alongside in `tests/integration/resource-uri-stability.test.ts`; the manifest hash catches renames that keep counts constant.

### Cron substrate

BL-032.5 introduced the Worker's `scheduled` handler and its first trigger: the radar snapshot refresh, now `0 */6 * * *` in `mcp-server/wrangler.toml` (`[env.production.triggers]`). The handler (`src/cron/radar-refresh.ts`) force-refreshes `mcp:radar:cache:{wire,fyi}` and carries the Inoreader budget guards: circuit-breaker short-circuit, a `mcp:inoreader:day-counter:<date>` soft cap, proactive OAuth-token refresh when TTL runs low, and a single-flight Upstash lock keyed on `cron:scheduledTime` (Cloudflare may invoke `scheduled` twice per firing; losers exit as `deduplicated`). The cadence deliberately equals the 6 h snapshot TTL — firing faster re-fetches Inoreader against a warm cache. The cron surface has since grown to three production triggers: the radar refresh, the weekly alert-rule synthetic (`0 14 * * 1`, BL-047), and the 15-minute SLO alert evaluator (`*/15 * * * *`, BL-032.75 Phase 3); dispatch on `event.cron` lives in `src/worker.ts`. Staging runs no crons at all — both environments share one Inoreader OAuth app, and a staging cron doubles the daily budget burn.

### Prompt fan-out and rate limits

Prompts that orchestrate Tools declare their downstream calls in an `orchestrates` field (`src/prompts/types.ts`); the heaviest fan-out (`gst_target_quick_look`, 4 Tools) has ~15× margin under the 60 req/min per-key sliding window, so no burst allowance is implemented.

_Distilled from MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md (May 2026) — archived at `src/docs/development/_archive/`._

---

## Radar pipeline (single-caller unification)

The MCP Worker is the **sole Inoreader API consumer** for all GST traffic (BL-032.8). One OAuth identity, one token-storage path, one protective substrate — every consumer surface (website ISR, Claude Desktop / Claude Code, remote MCP clients) flows through the same rate limit, circuit breaker, day-counter, and 429 header capture. No second caller can invisibly starve the shared 100/day Zone-1 budget.

### Consumer surfaces

| Consumer                          | Transport             | Bearer                  | Scopes                    |
| --------------------------------- | --------------------- | ----------------------- | ------------------------- |
| Claude Desktop / Code             | MCP-RPC `POST /mcp`   | `MCP_KEY_<INITIALS>`    | `DEFAULT_SCOPES`          |
| Website `/hub/radar` (Vercel SSR) | `GET /radar/snapshot` | `MCP_KEY_WEBSITE_RADAR` | `["resource:radar:read"]` |
| Future pilot clients (BL-033)     | MCP-RPC `POST /mcp`   | `MCP_KEY_<TEAM>`        | per-contract subset       |

The website's `src/components/radar/RadarFeed.astro` fetches `GET https://mcp.globalstrategic.tech/radar/snapshot` at SSR with the `MCP_KEY_WEBSITE_RADAR` bearer, replacing the website's retired direct Inoreader client (`src/lib/inoreader/client.ts`, deleted in Phase B). The route handler in `src/worker.ts` authenticates and gates on `resource:radar:read` — the same scope that gates MCP `resources/read` of `gst://radar/snapshot` — and returns `{ wire, fyi, fetchedAt }` from the Upstash caches.

### Token storage and OAuth refresh

All Inoreader state lives under the `mcp:*` namespace in the single **Upstash MCP DB** (`UPSTASH_MCP_REST_*` bindings): `mcp:inoreader:access_token` (TTL `expires_in − 60s`), `mcp:inoreader:refresh_token` (no TTL), plus the radar caches, day-counter, and circuit-breaker keys. `src/lib/inoreader-token-store.ts` owns all token I/O and enforces the single-writer invariant (read cascade: Upstash → `INOREADER_ACCESS_TOKEN`/`INOREADER_REFRESH_TOKEN` env fallbacks).

Refresh is Worker-direct against Inoreader's `/oauth2/token`, implemented in `src/lib/inoreader-oauth.ts::refreshAccessToken(env, source)`:

- **Single-flight lock** — Upstash `SET mcp:inoreader:refresh-lock NX EX 10` (generic primitive in `src/lib/single-flight-lock.ts`). Why: concurrent cron + live-tool 401s previously fanned out into 5+ parallel refresh calls (BL-040); losers of the acquire race now poll the access-token key (200ms interval, 15s timeout) and return `refreshSource: 'cached-by-peer'` — exactly one `/oauth2/token` POST per stale-token event.
- **Module split** — `inoreader-client.ts` (HTTP + retry), `inoreader-oauth.ts` (refresh orchestration), `inoreader-token-store.ts` (persistence), `single-flight-lock.ts` (lock primitive), `inoreader-failure-handler.ts` (429/breaker plumbing).
- **Rotation handling** — Inoreader conditionally rotates the refresh token; it is compared and written _before_ the access token, only when changed.
- **Grace-window hedge** (BL-047) — `src/lib/inoreader-oauth-grace-cache.ts` caches the previous refresh token in-isolate for 60s (empirically verified window) and retries once on `invalid_grant`, absorbing rotation races before they page.

Failure variants (`invalid-refresh-token`, `inoreader-error`, `upstash-write-failed`, `lock-timeout`, `token-missing`) route through `handleInoreaderFailure` with mapped Sentry severities; `invalid-refresh-token` / `token-missing` are paging-class and recovered via the `/admin/inoreader/reauth` flow.

### Bearer scope resolution (per-key subsets)

`src/auth/bearer.ts` (~lines 100–160) matches the `Authorization: Bearer` token against every `MCP_KEY_*` secret on the env, skipping `*_SCOPES` companion vars during the scan. On match, `resolveKeyScopes` reads the optional `MCP_KEY_<OWNER>_SCOPES` env var (JSON-encoded string array): present → the key's grant is narrowed to that subset; absent → `DEFAULT_SCOPES` (full grant); malformed JSON → auth fails loudly with a `malformed-scopes` 401 rather than silently falling back. This is how `MCP_KEY_WEBSITE_RADAR` carries only `resource:radar:read` — limiting blast radius if the website env leaks and keeping tool-call telemetry clean. The same mechanism serves future per-tenant grants.

### Snapshot model: cron refresh, live vs offline

A Worker cron (`0 */6 * * *`, `src/cron/radar-refresh.ts`) keeps the Upstash radar caches warm: it checks breaker state and day-counter headroom, proactively refreshes the OAuth token when `PTTL < 300s` (avoiding a user-visible 401 on first post-expiry call), then force-refreshes `mcp:radar:cache:wire` / `mcp:radar:cache:fyi` (6h TTL, matching the website's former ISR cadence). Live reads go through `src/content/radar-live-store.ts` (cache-first, Inoreader on miss, reactive 401→refresh→retry-once).

- `search_radar` / `get_latest_insights` (`src/tools/radar-live.ts`) — remote Worker tools serving the live Upstash-backed pipeline.
- `search_radar_offline` (`src/tools/radar-offline.ts`, reading `src/content/radar-snapshot.ts`) — stdio-only, registered via `registerLocalOnlyTools`; reads the locally seeded `.cache/inoreader/` snapshot (`npm run radar:seed`), makes zero Inoreader calls. See [Transport binding per tool](#transport-binding-per-tool-q12).

### Decommissioned (Phase B, 2026-05-27)

The legacy `gst-radar-tokens` Upstash DB (`inoreader:*` namespace), the website's Inoreader client and `/api/inoreader/refresh` endpoint, Vercel `INOREADER_*` env vars, and the `INOREADER_REFRESH_SECRET` / `UPSTASH_INOREADER_REST_*` Worker secrets were all retired — historical record in [`operations/_archive/BL-032_8_SOAK_GATE.md`](operations/_archive/BL-032_8_SOAK_GATE.md).

_Distilled from MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md (May 2026) — archived at `src/docs/development/_archive/`._

---

## Observability

The MCP server's observability stack (BL-032.75, fully shipped as of 0.39.0) has three layers: typed metrics into Cloudflare Analytics Engine, SLO targets calibrated from measured baselines, and a Worker-cron alert evaluator that posts fingerprinted Sentry events. Everything is config-as-code in this repo — schema, thresholds, rules, and runbooks are TypeScript/markdown under version control, not dashboard clicks.

### Metric substrate — Analytics Engine

Metrics are written to Cloudflare Analytics Engine (positional-columnar, SQL-queryable, native Workers binding), one dataset per environment: `mcp_events` (production), `mcp_events_staging`, `mcp_events_dev` — selected by `datasetForEnv()` in `src/observability/alert-rules.ts`, mirroring `wrangler.toml`.

The column map is pinned in `src/metrics/_schema.ts` — the single source of truth for emitters, the runtime guard, test fixtures, baseline queries, and alert SQL:

| Column  | Field                                                                                                                                                                                                                 |     | Column    | Field                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------- | ----------------------------------------------------------- |
| `blob1` | `event_type` (discriminator: `tool_invocation`, `resource_read`, `prompt_invocation`, `prompt_span`, `rate_limit_decision`, `inoreader_call`, `health_check`, `cron_outcome`, `audit_batch`, + BL-045 counter events) |     | `blob6`   | `status_code` (string)                                      |
| `blob2` | `name` (tool/prompt/cron slug/egress category)                                                                                                                                                                        |     | `blob7`   | `zone1` (`'1'`/`'0'`, `inoreader_call` only)                |
| `blob3` | `keyOwner` (PII-free `MCP_KEY_*` suffix)                                                                                                                                                                              |     | `double1` | `duration_ms`                                               |
| `blob4` | `outcome` (`success`/`error`/per-type enum)                                                                                                                                                                           |     | `double2` | `seq` (prompt-span step index)                              |
| `blob5` | `correlation_id` (`prompt_span` only)                                                                                                                                                                                 |     | `index1`  | `keyOwner` mirror (AE sampling key; `__none__` when absent) |

Handlers never touch positional columns. Typed emitters — the `withToolMetrics` / resource / prompt HOFs in `src/metrics/with-metrics.ts` wrap handlers at registration time and emit one event per invocation; `src/metrics/prompt-span.ts` emits correlation-id-linked per-step events (a lightweight trace substitute). Sinks implement the `MetricSink` interface: `AnalyticsEngineSink` in production, `InMemorySink` in tests. A `schema.test.ts` snapshot pins the column map — changing it is a breaking change to every downstream consumer and forces deliberate review.

This is the same schema the baseline tooling queries — `scripts/invoke-ae-baseline.mjs` groups latency by `blob1/blob2/blob4` and reads spend from `blob2/blob7/blob6` to answer "what production traffic looks like."

### Cardinality discipline & fail-open

`src/metrics/guard.ts` enforces the substrate at runtime: unknown `outcome` values (per-event-type enums in `OUTCOME_VALUES`), out-of-allowlist `name` values for bounded event types (`NAME_VALUES` — e.g. the five Inoreader egress categories), and oversize strings (per-slot `maxChars` truncation) are rejected or clamped before emission, with a `safeLog` line rather than a throw.

The contract is fail-open throughout: **metrics never break a tool call**. Emission is best-effort, the sink never throws, and a wrapped handler behaves identically to an unwrapped one — the cost is one `Date.now()` and one synchronous `sink.write()`. `safeLog` continues to dual-write alongside metric events.

### SLO baselines & targets

SLO targets are measured, not guessed. `npm -w @gst/mcp-server run ae:baseline` (`scripts/invoke-ae-baseline.mjs`) pulls a trailing-7-day window from the AE SQL API and emits paste-ready baseline tables plus proposed targets, pre-applying the per-metric-kind calibration rules (latency = p95 × 1.5; availability = 0.5% sustained error-budget floor; freshness = 2 × the 6h radar cron = 43,200 s; throughput handled by the rolling traffic-spike alert rather than a fixed SLO).

Results live in `observability/slo-baselines.md` with operator sign-off (2026-07-14). Key signed-off targets: `cron-radar` p95 ≤ 899 ms, radar-refresh cron p95 ≤ ~37 s, error rate < 0.5% sustained, snapshot age ≤ 12 h, Zone-1 spend ticket > 70/day, page > 90/day. Tool/resource/prompt latency SLOs are explicitly deferred: the baseline window showed 100% cron-driven production traffic (team usage runs the local stdio server), so those calibrate when real client traffic exists.

### Alerting

`src/observability/alert-rules.ts` defines the 7 canonical rules — `inoreader-budget-exhausted`, `radar-snapshot-stale`, `health-check-failing`, `traffic-spike-detected`, `scope-mismatch-403-rate`, `oauth-refresh-failure-rate`, `sentry-envelope-post-failure-rate` — as TypeScript config-as-code, each threshold constant citing its signed-off `slo-baselines.md` row (change the doc first, then the constant).

`src/observability/alert-evaluator.ts` runs them on a `*/15 * * * *` production cron: it queries AE (4 s timeout), Upstash, and in-process health, then posts one fingerprinted Sentry **issue event** per un-suppressed breach (`['slo-alert', ruleId, severity, utcDate]` — one issue per rule per UTC day). Free-tier constraints shape the design: severities route via two Sentry email rules (`slo-alert — page` / `slo-alert — ticket`) — no Slack/PagerDuty, and never a Crons check-in, since the single free-tier cron monitor belongs to radar-refresh. Per-severity cooldowns (page 2 h / ticket 6 h, `SET NX EX`) bound event volume, and each run writes a summary to Upstash key `mcp:alerts:last-eval` (24 h TTL). Every rule and the evaluator itself fail open — an unreachable data source records a gap, never a throw, and one broken rule cannot mask the other six.

Each rule links a runbook in `observability/runbooks/` (7 files: Symptom / Diagnosis / Mitigation / Resolution shape). `tests/unit/observability/runbook-freshness.test.ts` fails CI when a runbook's `lastReviewedAt` goes stale relative to its rule.

### Status page

`GET /status` (`src/observability/status-page.ts`) renders server-side HTML from two sources the Worker already holds: the live `buildHealthPayload()` probes and the evaluator's `mcp:alerts:last-eval` summary — overall status, env/version, dependency health, snapshot age vs the 12 h SLO, Zone-1 spend vs cap, and the per-rule alert table. No client JS, no secrets, and it never throws (degraded sources render as unknowns).

### Sentry envelope delivery

All Sentry traffic from scheduled paths goes through direct envelope POSTs — `postSentryEvent` / `postSentryCheckIn` in `src/observability/sentry-envelope.ts` — never the SDK's `withSentry` scheduled wrapper, which caused false "Exception Thrown" reports on the cron dashboard (BL-032.76 lesson). Delivery is itself observed: `mcp:sentry-envelope:{ok|fail}:<day>` counters (48 h TTL) feed the `sentry-envelope-post-failure-rate` rule, with `/status` and Workers Logs as the fallback surfaces when envelope delivery itself is what broke.

### Inoreader spend accounting

Spend accounting is complete by construction: `recordInoreaderEgress()` in `src/lib/inoreader-egress.ts` is the single chokepoint through which **every** Worker-side Inoreader call is counted — cron refresh, live tool calls, the `/radar/snapshot` endpoint, 401 retries, and OAuth refresh — by category and Zone-1 membership (`blob7`), not just the radar-refresh cron (the pre-Phase-0 counter's 15–25% undercount). Zone-1 day-counters in Upstash are guarded by `ZONE1_DAILY_HARD_CAP` (100/day), cross-checked against Inoreader's `X-Reader-Zone1-Usage` header with drift detection, and drive both the budget alert and the `/status` spend readout.

### Deferred, and what lives elsewhere

The Grafana dashboard is the one deliberately deferred item — it needs a Grafana Cloud account (Infinity datasource → AE SQL API); the `/status` page and alert rules cover the operational need meanwhile. Operational procedure detail is deliberately not here: Sentry rule setup and maintenance live in [`operations/SENTRY_ALERT_RULES.md`](operations/SENTRY_ALERT_RULES.md), and per-alert response procedure lives in `observability/runbooks/`.

_Distilled from MCP_SERVER_OBSERVABILITY_BL-032_75.md (May–July 2026) — archived at `src/docs/development/_archive/`._

---

## Audit logging (BL-033 Slice 3a)

Distinct from Observability above: metrics/AE are the **ops** surface (aggregation-shaped, 3-month retention, feeds Sentry/CF logs); the audit log is the **compliance** surface — a tamper-evident, hash-chained, immutable record of every tool invocation, deliberately kept off the ops sinks. Decision record: [`../../../src/docs/adr/0009-compliance-audit-log-hash-chain.md`](../../../src/docs/adr/0009-compliance-audit-log-hash-chain.md). Operator runbook: [`operations/AUDIT_LOG.md`](operations/AUDIT_LOG.md). This slice ships **emission + durable store**; signed-URL export, the quarterly integrity-check automation, and the `?audit_full_payload=true` retention flag are deferred.

**Separate path off the shared chokepoint.** `withMetricsCore` (`src/metrics/with-metrics.ts`) already wraps every tool handler with `{name, args[0], result, duration, outcome, keyOwner}` in scope. A per-request `AuditContext` (`{sink, requestId, ipPrefix, keyOwner}`) is threaded alongside the metrics sink via `createServer` → `ServerContext` → `MetricsContext`; for `tool_invocation` only, the chokepoint builds a full `AuditEntry` (incl. `inputParams` + `outputBytes`) and hands it to a fire-and-forget `AuditSink` — a path wholly separate from `emit()`/`MetricSink`, so **full input params never reach AE/Sentry/CF logs**. `requestId` (a fresh UUID minted in `handle-authenticated.ts`) correlates the audit entries with the request's `safeLog` line; `ipPrefix` is the GDPR-truncated caller IP.

**Enqueue → consumer → R2.** `QueueAuditSink.write` enqueues to `AUDIT_QUEUE` via `ctx.waitUntil` (off the latency path, best-effort — a documented first-hop loss window, ADR-0009). The Worker's `queue` handler (`src/audit/consumer.ts`) is a single writer (`max_concurrency=1` + single-flight lock) that hash-chains each entry and writes one immutable object per entry to `AUDIT_R2` at `audit/<env>/<yyyy>/<mm>/<dd>/<paddedSeq(16)>.json` (a Cloudflare Bucket Lock rule at 7-yr retention configured on the bucket; create-only writes mean versioning is unnecessary). It owns its own SDK-free Sentry-envelope lifecycle (like `scheduled`) but — unlike the retry-less cron — **never swallows a failure**: any error (including a null/unreachable Upstash) `retryAll`s the batch → DLQ, never an ack-drop.

**Crash-safe hash chain.** Sequencing is authoritative via an `entryId→{seq,prevHash,entryHash}` ledger in Upstash committed atomically with the chain tip (`mcp:audit:chain-tip:<env>`) in a single `MULTI`; R2 is an idempotent per-seq projection (`If-None-Match: *` → `put()` returns `null` for an already-written object). An entry's `seq` is fixed the instant its `seqOf` commits and never shifts on redelivery, so a recomposed redelivered batch can neither fork nor duplicate the chain. `seq` (not the wall-clock `tsIso`) is the canonical chain order. Consumer-batch outcomes emit an `audit_batch` AE event for ops visibility (the records themselves never touch AE). Upstash (not KV) because KV is eventually consistent and lacks multi-key transactions — see ADR-0009 for the full crash-interleaving analysis and rejected alternatives.

**First-of-kind bindings.** R2 and Cloudflare Queues are introduced here; the operator provisions each env's Queue + DLQ + R2 bucket **before** deploy (a `[[queues.consumers]]` on a missing queue fails `wrangler deploy`). Steps in `operations/AUDIT_LOG.md`.

---

_Last updated: 2026-07-26 (BL-033 Slice 3a — added § Audit logging). Previously 2026-07-17 (BL-088 PR 2 — initial distillation). Maintained: update this doc in the same PR as architecture changes._
