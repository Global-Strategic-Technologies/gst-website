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

`ServerContext` threads per-request concerns (scope grants, metrics sink, key attribution, IRL body cache) into the registry; stdio passes nothing and gets full-grant defaults with no-op metrics. A CI registry-snapshot test (`tests/integration/registry-snapshot.test.ts`) asserts the stdio-vs-Worker registry diff is exactly the declared local-only set.

### SDK

The server is built on the official TypeScript SDK, **`@modelcontextprotocol/sdk` v1.x** (`^1.29.0` in `mcp-server/package.json`), importing `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` and `StdioServerTransport` from `.../server/stdio.js`, with Zod v4 schemas. (The frozen BL-031 doc anticipated a v2 `@modelcontextprotocol/server` package split; that never became the shipped dependency — the single-package SDK remains current.) Handlers return structured MCP errors (`{ isError: true, content: [...] }`), never thrown exceptions.

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
3. **Admin re-auth surface** — `/admin/inoreader/reauth/*` (operator-driven Inoreader OAuth recovery) is gated by the separate `MCP_ADMIN_KEY`, not team bearers.
4. **Routed-path allowlist** — anything other than `/mcp` (prefix) and `/radar/snapshot` (exact) 404s _before_ auth runs (`isRoutedPath()` in `worker.ts`). This kills bot-probe noise (`/favicon.ico`, `/.env`, `/wp-admin`) at the source: no auth attempt, no Sentry event, no quota burn.
5. **Bearer auth** — `authenticate()` from `src/auth/bearer.ts` (see next section). Failures 401 with a structured envelope; probe-class failures (missing/empty header) are safeLog-only, actionable ones (`invalid-token`, `malformed-scopes`) also go to Sentry.
6. **Rate limit** — per-key sliding-window check via `src/ratelimit/limiter.ts`; the tool name is extracted at the Worker boundary from a cloned-body JSON-RPC parse (`src/dispatch/extract-tool-name.ts`) so radar tools hit the stricter tier. Exceeded → 429 with `RateLimit-*` headers.
7. **`GET /radar/snapshot`** — plain-HTTP convenience endpoint for the website's SSR, gated on the `resource:radar:read` scope; slotted after auth + rate limit, before MCP framing.
8. **MCP handler** — everything else delegates to `createMcpHandler`. Every response is wrapped with CORS + rate-limit headers on the way out; every request emits a structured `safeLog` line and (when bound) an Analytics Engine event.

The `scheduled` handler dispatches three production crons by `event.cron` (see the deploy-topology table below), with a single-flight Upstash lock keyed on `cron:scheduledTime` deduplicating Cloudflare's documented double-invocations.

### Transport binding per tool (Q12)

Tools whose implementations need `node:fs` / `node:crypto` are **stdio-only**: `src/tools/_local-only.ts` registers `search_radar_offline` (plus its deprecated `search_radar_cache` alias) and the node:fs-backed radar Resource reader, and is called only by `src/index.ts` — never by `worker.ts`. Everything registered inside `createServer()` is transport-portable. The live/offline radar split: `search_radar` (Upstash + Inoreader via `content/radar-live-store.ts`) is the canonical tool on both transports; `search_radar_offline` (filesystem snapshot via `content/radar-snapshot.ts`) remains the dev/CI/budget-exhausted fallback, stdio-only. The rename decision record (`search_radar_cache` → `search_radar_offline`) lives in the archived BL-032 doc, Q2. A schema-drift CI test (`tests/integration/registry-snapshot.test.ts`) snapshots both registries and asserts the diff is exactly the declared local-only set.

**Public-contract discipline**: any change to the public surface (tool names, input schemas, endpoint paths, auth semantics) ships with a version bump and an entry in `mcp-server/BREAKING_CHANGES.md`.

## Auth, CORS & deploy topology

### Bearer-token auth (Q11/Q13)

Auth is static bearer tokens, one per teammate, stored as Wrangler secrets named `MCP_KEY_<INITIALS>` (e.g. `MCP_KEY_RP`). `src/auth/bearer.ts` enumerates all `MCP_KEY_*` bindings at runtime via `Object.entries(env)` — adding a teammate is one `wrangler secret put`, no code change. The matched secret's suffix becomes the `keyOwner` used for log attribution and rate-limit bucketing; the token value itself is never logged or returned.

**Why bearer, not OAuth**: for an internal team of <10, `wrangler secret put` is the simplest safe issuance-and-revocation surface. OAuth 2.1 (and therefore compatibility with Claude Desktop's Connectors OAuth UI) is deferred to the BL-033 external-pilot scope. Rotation is manual, on demand or on suspected compromise — runbook in [`operations/AUTH.md`](operations/AUTH.md).

**Scopes** (`src/auth/scopes.ts`): coarse-grained permission strings carried on the auth result — `tool:*`, `prompt:*`, and per-family `resource:<family>:read`, with `prefix:*` wildcard matching. Every team key gets `DEFAULT_SCOPES` (full grant) unless a companion `MCP_KEY_<OWNER>_SCOPES` env var (JSON string array) narrows it — the mechanism behind `MCP_KEY_WEBSITE_RADAR`, the website's SSR key that carries only `resource:radar:read`. Malformed `_SCOPES` JSON fails loud as a 401 at auth time. Scope denials surface as JSON-RPC error `-32002` (`MissingScopeError`).

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

Deep rationale for the numbers below is deferred to a future ADR; this section records what ships and where.

### Per-key sliding windows (Q7)

`src/ratelimit/limiter.ts` uses `@upstash/ratelimit` (`Ratelimit.slidingWindow`, per Q7's "use the library" resolution) against the MCP Upstash DB, keyed by `keyOwner` under the `mcp:ratelimit:*` prefix. Two tool classes:

- **general** — 60/min + 1000/day, checked on every authenticated request
- **radar** (`search_radar`, `get_latest_insights`; BL-038) — an _additional_ 5/min + 50/day pair, checked on top of the general buckets (additive — radar calls consume from all four)

The binding tier (whichever bucket exhausted, or has fewest remaining) drives the 429 envelope's `RateLimit-*` / `Retry-After` headers (`src/ratelimit/headers.ts`), so agents can distinguish "slow my radar polling" from "slow everything." When Upstash credentials aren't bound, the limiter fails open with a `ratelimit.skipped` warning — local `wrangler dev` works without setup; production must have credentials wired. Contract details: [`operations/RATE_LIMITS.md`](operations/RATE_LIMITS.md).

### Inoreader budget

- **Zone-1 hard cap**: `ZONE1_DAILY_HARD_CAP = 100` in `src/lib/inoreader-egress.ts` — the single exported source of truth; the `inoreader-budget-exhausted` alert rule tickets at 70% and pages at 90% of this value.
- **Cron budget math**: the 6-hourly radar refresh (cadence ≥ cache TTL by rule) spends 4 firings × 6 calls = 24/day; the single-flight dedup lock in `worker.ts` keeps Cloudflare double-invocations from doubling that spend.
- **Radar rate tier**: the 5/min + 50/day radar buckets above are defense-in-depth for the same shared budget — one valid bearer can't exhaust upstream quota through cold cache-miss radar calls.

### Circuit breaker

Every Inoreader call site (cron or live tool) routes failures through `src/lib/inoreader-failure-handler.ts`, which opens the breaker in `src/ratelimit/circuit-breaker.ts` on `inoreader-rate-limit` signals and tags a Sentry message with the zone-diagnostic headers; while open, radar reads serve cached data and skip upstream calls until the cool-down elapses.

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

| Column  | Field                                                                                                                                                                                                  |     | Column    | Field                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | --------- | ----------------------------------------------------------- |
| `blob1` | `event_type` (discriminator: `tool_invocation`, `resource_read`, `prompt_invocation`, `prompt_span`, `rate_limit_decision`, `inoreader_call`, `health_check`, `cron_outcome`, + BL-045 counter events) |     | `blob6`   | `status_code` (string)                                      |
| `blob2` | `name` (tool/prompt/cron slug/egress category)                                                                                                                                                         |     | `blob7`   | `zone1` (`'1'`/`'0'`, `inoreader_call` only)                |
| `blob3` | `keyOwner` (PII-free `MCP_KEY_*` suffix)                                                                                                                                                               |     | `double1` | `duration_ms`                                               |
| `blob4` | `outcome` (`success`/`error`/per-type enum)                                                                                                                                                            |     | `double2` | `seq` (prompt-span step index)                              |
| `blob5` | `correlation_id` (`prompt_span` only)                                                                                                                                                                  |     | `index1`  | `keyOwner` mirror (AE sampling key; `__none__` when absent) |

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

_Last updated: 2026-07-17 (BL-088 PR 2 — initial distillation from the five archived initiative docs). Maintained: update this doc in the same PR as architecture changes._
