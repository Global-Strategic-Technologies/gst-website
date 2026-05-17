# MCP Server — Radar Consumer Unification (BL-032.8)

> **Backlog initiative**: [BL-032.8: Radar Consumer Unification — MCP Worker as sole Inoreader caller](BACKLOG.md#bl-0328-radar-consumer-unification--mcp-worker-as-sole-inoreader-caller)
> **Predecessors**:
>
> - [MCP_SERVER_REMOTE_BL-032.md](MCP_SERVER_REMOTE_BL-032.md) — substrate (Worker scaffold, dual-DB Upstash, auth, rate-limit, circuit breaker)
> - [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) — Resources/Prompts on remote, scope catalog, radar Resources, Cron substrate
> - BL-032.7 (in BACKLOG.md) — Inoreader substrate safety & observability (T.Z.1/2/3); single-failure-handler module already in production
> - BL-039 (in BACKLOG.md) — Worker → website refresh trigger; the interim solution this initiative supersedes
>
> **Sequel**: BL-033 (multi-tenant pilot clients) — unblocked by this initiative
> **Supersedes**: BL-040 (parallel-refresh debounce) — obsoleted by the single-flight lock introduced here
> **Scope**: makes the MCP Worker the sole Inoreader API consumer; retires the website's direct Inoreader access; introduces a Worker-owned OAuth refresh path with single-flight coordination via Upstash `SET ... NX EX`; exposes a lightweight `GET /radar/snapshot` HTTP endpoint authenticated through the existing unified scope catalog with a new narrow-scope bearer for the website.
> **Status**: Open — implementation kickoff pending operator scheduling.

## Context — why this earns its own initiative

BL-032.7 (shipped 2026-05-16) closed three observability + safety gaps surfaced during the 2026-05-15 BL-032.6 demo-day RCA:

- **T.Z.1**: day-counter only increments on actual successful fetches
- **T.Z.2**: unified `handleInoreaderFailure` so cron 429s trip the breaker
- **T.Z.3**: 429 X-Reader-\* headers captured as structured Sentry tags + 200-char body excerpt in `extra`

Each of those fixes protects the **MCP Worker code path** end-to-end. None of them protect the **website's `/hub/radar` ISR**, which runs a parallel Inoreader client at [`src/lib/inoreader/client.ts`](../../../src/lib/inoreader/client.ts), shares the same 100/day Zone-1 budget, but bypasses every substrate protection: different OAuth resolution path, different cache (none — just ISR), no breaker awareness, no day-counter contribution, no 429-header capture, no Sentry attribution to the Worker's mcp-server project.

The structural fix isn't another protection bolted onto the website caller; it's eliminating the second caller. After BL-032.8 the Worker is the sole Inoreader consumer for all GST traffic — website ISR, Claude Desktop, OpenClaw, and future BL-033 pilot clients all flow through the same protective substrate via either MCP-RPC (`/mcp`) or a lightweight HTTP convenience endpoint (`/radar/snapshot`). Onboarding a paying pilot client onto a substrate where one consumer can invisibly starve everyone else's budget is unacceptable; BL-032.8 closes that gap before BL-033 ramps.

This initiative also delivers a **module-split refactor** of the OAuth refresh logic that's been growing inside `inoreader-worker.ts`. Splitting it now — alongside the structural change that motivates it — prevents the dual-write window from creating deferred tech debt: the new modules ship in Phase A with the BL-039 fallback retained behind a clean abstraction; Phase B deletes the fallback without touching the new modules at all.

## Architecture: before and after

### Diagram 1 — BEFORE (today, May 2026)

```
                              ┌──────────────────────────┐
                              │      Inoreader API        │
                              │   /oauth2/token + radar   │
                              └──────────┬───────────────┘
                                         │
                  ┌──────────────────────┼──────────────────────┐
                  │                      │                      │
                  │ direct calls         │                      │ direct calls
                  │ (radar + refresh)    │                      │ (radar only)
                  │                      │                      │
        ┌─────────▼────────────┐         │            ┌─────────▼──────────────┐
        │  Website (Vercel)    │ POST    │            │  MCP Worker            │
        │                      │ /api/   │            │                        │
        │  RadarFeed.astro     ◄─────────┴────────────┤  search_radar tool     │
        │  inoreader/client.ts │ inoreader/refresh    │  get_latest_insights   │
        │                      │ (BL-039)             │  inoreader-worker.ts   │
        │  Q4: sole refresh-   │ Bearer:              │                        │
        │   writer (today)     │ INOREADER_REFRESH_   │  Read-only on          │
        │                      │ SECRET               │   inoreader:* keys     │
        └──────────┬───────────┘                      └──────────┬─────────────┘
                   │                                              │
                   │ writes inoreader:access_token                │ reads inoreader:access_token
                   │ writes inoreader:refresh_token               │
                   ▼                                              │
        ┌──────────────────────────┐                              │
        │  Upstash Inoreader DB    │◄─────────────────────────────┘
        │  inoreader:access_token  │
        │  inoreader:refresh_token │
        │  (TTL: 30 days)          │
        └──────────────────────────┘

        ┌──────────────────────────────┐
        │   Upstash MCP DB             │   ← Worker-owned mcp:* keys
        │   mcp:radar:cache:wire       │
        │   mcp:radar:cache:fyi        │
        │   mcp:inoreader:day-counter  │
        │   mcp:radar:circuit-open     │
        └──────────────────────────────┘

Failure modes today:
  - Inoreader 429: each consumer hits it independently; circuit breaker
    only protects MCP path. Website ISR can blow the budget on its own.
  - Token-stale: Worker MUST call website to refresh; website outage =
    Worker MCP outage even though the MCP Worker is technically healthy.
  - Parallel 401 from Worker fan-out: 5+ POSTs to /api/inoreader/refresh
    per single search_radar call (BL-040 known issue).
```

### Diagram 2 — AFTER (BL-032.8 target state)

```
                              ┌──────────────────────────┐
                              │      Inoreader API        │
                              │   /oauth2/token + radar   │
                              └──────────┬───────────────┘
                                         │
                                         │ SINGLE OAuth identity
                                         │ ALL Inoreader traffic
                                         │ (radar fetch + token refresh)
                                         │
                              ┌──────────▼───────────────┐
                              │     MCP Worker            │
                              │  (sole Inoreader caller)  │
                              │                           │
                              │  /mcp     (MCP-RPC)       │
                              │  /radar/snapshot (HTTP)   │
                              │  /health  (public)        │
                              │                           │
                              │  mcp.globalstrategic.tech │
                              └──────────┬───────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            │                            │                            │
            │ MCP-RPC                    │ HTTP GET                   │ MCP-RPC
            │ /mcp                       │ /radar/snapshot            │ /mcp
            │                            │                            │
  ┌─────────▼───────────┐    ┌───────────▼─────────┐      ┌──────────▼──────────┐
  │  Claude Desktop /   │    │  Website (Vercel)    │      │  OpenClaw           │
  │  Claude Code        │    │  RadarFeed.astro     │      │  (Tools-only)       │
  │                     │    │   (SSR fetch)        │      │                     │
  │  MCP_KEY_<USER>     │    │  MCP_KEY_WEBSITE_    │      │  MCP_KEY_OPENCLAW   │
  │  scopes: DEFAULT_   │    │   RADAR              │      │  scopes: tool:*     │
  │   SCOPES (full)     │    │  scopes: [resource:  │      │                     │
  │                     │    │   radar:read]        │      │                     │
  └─────────────────────┘    └─────────────────────┘      └─────────────────────┘

  ┌──────────────────────────┐
  │  BL-033 pilot clients     │  ← future consumers slot in via the same MCP key model
  │  MCP_KEY_<TEAM>          │     with per-team scope subsets (no Inoreader account work)
  │  scopes: per contract    │
  └──────────────────────────┘

              ┌──────────────────────────────────┐
              │   Upstash MCP DB                  │  ← sole Inoreader-token writer: Worker
              │                                   │
              │   mcp:inoreader:access_token      │  TTL: expires_in - 60s
              │   mcp:inoreader:refresh_token     │  no TTL (long-lived)
              │   mcp:inoreader:refresh-lock      │  TTL: 10s (transient single-flight)
              │   mcp:radar:cache:wire / :fyi     │  TTL: 6h (existing)
              │   mcp:inoreader:day-counter:DATE  │  (existing)
              │   mcp:radar:circuit-open          │  (existing)
              └──────────────────────────────────┘

  [DELETED after Phase B]
      Upstash Inoreader DB (the `inoreader:*` namespace can be retired entirely
        once both consumers stop reading from it)
      src/lib/inoreader/client.ts (website)
      src/pages/api/inoreader/refresh.ts (website)
      INOREADER_REFRESH_SECRET (both envs)
      INOREADER_* env vars on Vercel

Failure modes (improved):
  - Inoreader 429: ONE circuit-breaker open event protects every consumer
    identically (T.Z.2 from BL-032.7 — now fully load-bearing across surfaces).
  - Token-stale: Worker self-heals via direct /oauth2/token; no website
    dependency in the refresh path.
  - Parallel 401 from fan-out: Upstash SET-NX-EX lock coalesces refreshes
    to exactly ONE /oauth2/token call (supersedes BL-040).
  - All BL-032.7 protections (rate limit, day-counter, 429 header capture)
    automatically extend to website traffic.
```

### Key invariant changes from before → after

| Invariant                                  | BEFORE                                                             | AFTER                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Q4 single-writer (Inoreader OAuth tokens)  | Website is sole refresh-writer                                     | Worker is sole refresh-writer (token-store module enforces)                       |
| Inoreader OAuth identity                   | One app, two callers sharing one budget invisibly                  | One app, one caller — usage attributable in the Inoreader Developer dashboard     |
| Refresh-token rotation handling            | Website's `client.ts` handles conditionally                        | Worker's `inoreader-oauth.ts` handles with single-flight + sequential persistence |
| Cache key namespace                        | `inoreader:*` (website-owned) + `mcp:radar:cache:*` (Worker-owned) | `mcp:*` only — `inoreader:*` namespace can retire                                 |
| Bearer key scope model                     | All keys carry `DEFAULT_SCOPES`                                    | Per-key subsets via optional `MCP_KEY_<OWNER>_SCOPES` env var                     |
| Website → radar data path                  | Direct `https://inoreader.com/reader/api/0/*` calls + ISR          | `GET https://mcp.globalstrategic.tech/radar/snapshot` (Worker-mediated)           |
| BL-040 parallel-refresh fan-out (5+ POSTs) | Open known issue                                                   | Closed structurally — exactly ONE `/oauth2/token` call per stale-token event      |

## Client consumer matrix

```
┌────────────────────────────┬──────────────────┬────────────────────┬─────────────────────┐
│ Consumer                   │ Transport         │ Bearer key         │ Scopes              │
├────────────────────────────┼──────────────────┼────────────────────┼─────────────────────┤
│ Claude Desktop / Claude    │ MCP-RPC          │ MCP_KEY_<USER>     │ DEFAULT_SCOPES      │
│ Code (internal team)       │ POST /mcp        │ (per team member)  │ (full grant)        │
├────────────────────────────┼──────────────────┼────────────────────┼─────────────────────┤
│ OpenClaw                   │ MCP-RPC          │ MCP_KEY_OPENCLAW   │ tool:*              │
│ (Tools-only client)        │ POST /mcp        │                    │ (no prompts/        │
│                            │                  │                    │  resources)         │
├────────────────────────────┼──────────────────┼────────────────────┼─────────────────────┤
│ Website /hub/radar         │ HTTP GET         │ MCP_KEY_WEBSITE_   │ resource:radar:read │
│ (Vercel SSR)               │ /radar/snapshot  │  RADAR             │ (narrow)            │
├────────────────────────────┼──────────────────┼────────────────────┼─────────────────────┤
│ BL-033 pilot clients       │ MCP-RPC          │ MCP_KEY_<TEAM>     │ per-contract        │
│ (future)                   │ POST /mcp        │                    │  subset             │
├────────────────────────────┼──────────────────┼────────────────────┼─────────────────────┤
│ Inoreader API              │ (egress)         │ OAuth refresh_     │ N/A — OAuth         │
│ (sole consumer: Worker)    │  /oauth2/token   │  token + app_id /  │                     │
│                            │  + stream APIs   │  app_key           │                     │
└────────────────────────────┴──────────────────┴────────────────────┴─────────────────────┘
```

Audit-log narrative per consumer (helpful for tracing in Sentry / Cloudflare Logs):

- `keyOwner=USER_<INITIALS>, scopes=DEFAULT_SCOPES, path=/mcp` → full MCP traffic
- `keyOwner=OPENCLAW, scopes=[tool:*], path=/mcp` → tool calls only (any non-tool: 403 `MissingScopeError`)
- `keyOwner=WEBSITE_RADAR, scopes=[resource:radar:read], path=/radar/snapshot` → snapshot reads (any other scope-requirement: 403)
- `keyOwner=<TEAM>, scopes=<subset>, path=/mcp` → per-contract surface

## OAuth refresh flow design

### Single-flight coordination via Upstash `SET ... NX EX`

```
t=0      Cron isolate fires                  Live-tool isolate (Claude search_radar)
         (every 6h: 0 */6 * * *)              receives 401 from Inoreader
         │                                    │
         ▼                                    ▼
         refreshAccessToken('cron')           refreshAccessToken('live-tool')
         │                                    │
         ▼                                    ▼
         SET mcp:inoreader:                   SET mcp:inoreader:
         refresh-lock <uuid>                  refresh-lock <uuid>
         NX EX 10                             NX EX 10
         │                                    │
         │ ◄─ Upstash arbitrates ──►          │
         │                                    │
   "OK"  ▼                                    ▼ null
         │                                    │
         POST inoreader.com/oauth2/token      poll mcp:inoreader:access_token
         (form-encoded body)                  every 200ms, max 15s
         │                                    │
         ▼ ~1s                                │
         Response:                            │
           { access_token,                    │
             refresh_token?, ◄ optional       │
             expires_in }                     │
         │                                    │
         ▼                                    │
         SET mcp:inoreader:                   │
         refresh_token (if rotated)           │
         │                                    │
         SET mcp:inoreader:                   │
         access_token EX                      │
         (expires_in - 60)                    │
         │                                    │
         ▼                                    ▼ (sees access_token change)
         DEL mcp:inoreader:                   return { ok: true,
         refresh-lock                          refreshSource: 'cached-by-peer' }
         │
         emit safeLog + Sentry
         breadcrumb (source: cron)
         │
         ▼
         return { ok: true,
           refreshSource: 'fresh',
           accessToken,
           expiresAt }

Net Inoreader calls: 1 (not 2). Worst-case loser latency: ~1.2s.
```

### Cron proactive refresh (TTL-watch — avoids the user-visible 401 on first call after expiry)

```
t=0      Cron fires (every 6h: 0 */6 * * *)
         │
         ▼
         circuit breaker open? ─── YES ──► skip; safeLog 'cron.skipped'
         │
         NO
         ▼
         day-counter < 100 - 6? ─── NO ──► skip; safeLog 'cron.skipped'
         │
         YES
         ▼
         === BL-032.8 NEW STEP ===
         PTTL mcp:inoreader:access_token
         │
         ▼
         remaining TTL < 300s? (5 min)
         │
   NO ───┼─── YES
         │   │
         │   ▼
         │   refreshAccessToken('cron')   ◄── proactive: avoid 401 latency on first call
         │   │ (see Single-flight diagram for full flow)
         │   ▼
         │   { ok: true, refreshSource: 'fresh' | 'cached-by-peer' }
         │
         ▼ ───────────────────────────────┐
         readWireLive(env, {forceRefresh:true})   │
         readFyiLive(env, 30, {forceRefresh:true})│  ← existing radar-refresh code
         (parallel via Promise.all)               │
         │                                        │
         ▼                                        │
         per-tier success accounting:             │
           wire ok → +5 to day-counter            │
           fyi ok → +1 to day-counter             │
         │                                        │
         ▼                                        │
         cache mcp:radar:cache:wire (6h TTL)      │
         cache mcp:radar:cache:fyi (6h TTL)       │
         │                                        │
         ▼                                        │
         return RefreshOutcome                    │
```

### Live tool reactive refresh (401 + retry — no proactive TTL check on live path)

Live calls don't pay the TTL-check overhead on every invocation. They observe the 401 and trigger refresh reactively. The single-flight lock means a live-tool call arriving during an in-flight cron refresh gets the new token from the polling path — only one `/oauth2/token` POST lands.

```
Claude → search_radar({query: "cybersecurity"})
         │
         ▼
         MCP Worker /mcp endpoint
         │
         ▼
         search_radar handler
         │
         ▼
         readWireLive(env) → cache miss
         │
         ▼
         fetchAllStreams(env)
         │
         ├──► Inoreader 200 ──► happy path → return
         │
         ├──► Inoreader 401 (token stale)
         │   │
         │   ▼
         │   === BL-032.8 REPLACES "triggerWebsiteRefresh" with: ===
         │   refreshAccessToken('live-tool')
         │   │ (see Single-flight diagram)
         │   │
         │   ├──► ok: true ──► re-resolve config + retry ONCE
         │   │                  │
         │   │                  ├──► Inoreader 200 ──► return payload
         │   │                  └──► still 401 ──► return token-stale envelope
         │   │
         │   └──► ok: false (invalid-refresh-token / upstash-write-failed / lock-timeout)
         │       │
         │       ▼
         │       handleInoreaderFailure(env, failure, 'live-search-radar')
         │       │ ← existing BL-032.7 plumbing; opens circuit breaker on
         │       │   invalid-refresh-token, emits Sentry capture with severity
         │       ▼
         │       return token-stale envelope (with rateLimitInfo if 429)
         │
         └──► Inoreader 429 ──► handleInoreaderFailure (BL-032.7 path)
                                circuit opens; 503 envelope with Retry-After
```

### Error taxonomy + Sentry severity mapping

`refreshAccessToken(env, source)` returns a discriminated union. The handler at the call site (cron, live-tool, or manual operator) routes the failure variant through the existing `handleInoreaderFailure` plumbing from BL-032.7 plus source-specific structured logs.

| `reason`                | Upstream signal                    | Sentry severity       | Retry?                               | Operator action                                                     |
| ----------------------- | ---------------------------------- | --------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `invalid-refresh-token` | 401 + `invalid_grant`              | **critical** (paging) | no                                   | manual OAuth re-link required                                       |
| `inoreader-error` (5xx) | 5xx on `/oauth2/token`             | warning               | next 401                             | none (transient)                                                    |
| `inoreader-error` (429) | 429 on `/oauth2/token`             | warning               | respect `Retry-After`                | none (rare — `/oauth2/token` doesn't count against Zone-1 normally) |
| `upstash-write-failed`  | refresh succeeded but `SET` failed | error (non-paging)    | no — token lost from this invocation | investigate Upstash status                                          |
| `lock-timeout`          | peer didn't finish refresh in 15s  | info                  | yes (next call)                      | none — usually transient                                            |

Every refresh attempt emits a `safeLog` entry with `{ event, source, outcome, durationMs }` plus a Sentry breadcrumb with the same fields. BL-032.75 dashboards consume these via the existing log pipeline.

## Module layout

```
mcp-server/src/lib/
├── inoreader-client.ts             ← RENAMED from inoreader-worker.ts
│                                     HTTP calls + retry + response mapping
│                                     (Phase A: still imports triggerWebsiteRefresh
│                                      from inoreader-bl039-fallback.ts as fallback;
│                                      Phase B: deletes the fallback import + module)
│
├── inoreader-oauth.ts              ← NEW
│   refreshAccessToken(env, source) — single-flight via Upstash lock,
│   POST /oauth2/token, persistence delegation to inoreader-token-store
│
├── inoreader-token-store.ts        ← NEW
│   readAccessToken(env) / readRefreshToken(env)
│   writeAccessToken(env, token, expiresIn) / writeRefreshToken(env, token)
│   Q4 SINGLE-WRITER INVARIANT lives in this module's docstring
│
├── single-flight-lock.ts           ← NEW (generic — reusable beyond OAuth)
│   acquire(env, key, ttl, value?) / pollForChange(env, key, opts) / release(env, key, value)
│
├── inoreader-failure-handler.ts    ← UNCHANGED (from BL-032.7)
│
└── inoreader-bl039-fallback.ts     ← NEW in Phase A only — DELETED in Phase B
    Contains the old triggerWebsiteRefresh() pulled out of inoreader-worker.ts
    so the Phase B deletion is a single file removal + import cleanup.
```

## Phase 0: Pre-kickoff verification

**Goal**: resolve the last unknowns about Inoreader's OAuth response shape before Phase 1 code lands.

**Deliverables**:

- [x] **Context7 docs lookup** (resolved 2026-05-17 via `/websites/inoreader_developers` Library ID — see Q0.1/Q0.2 below)
- [x] **Custom-domain smoke test** (production): `curl https://mcp.globalstrategic.tech/health` returned `{"ok":true,"version":"0.1.0","upstashMcp":"ok","upstashInoreader":"ok","radarSnapshotAgeSeconds":6281,...}` — healthy
- [x] **Staging custom-domain smoke test**: `curl https://mcp-staging.globalstrategic.tech/health` returned the same shape — both domains resolve to the expected Worker over HTTPS

**Verification**:

- [x] Q-stanza filled with concrete answers (no TBDs carried into Phase 1)
- [x] Both custom domains resolve to the expected Worker with HTTPS

**Q0.1 — Does Inoreader always return `expires_in` in the `/oauth2/token` response?**

> **Yes** (resolved 2026-05-17, Context7 lookup against `/websites/inoreader_developers`). The Inoreader OAuth docs list `expires_in (integer)` as a guaranteed field in the success response body: _"The expiration time of the new access token in seconds."_ No conditional language. `inoreader-oauth.ts` reads `expires_in` directly; the fallback `expiresIn ?? 3600` is defensive belt-and-suspenders for malformed responses (e.g. Inoreader API drift), not the expected path.

**Q0.2 — Does Inoreader rotate the `refresh_token` on every refresh call?**

> **Conditional rotation** (resolved 2026-05-17). The Inoreader docs document the response field as: _"refresh_token (string) — The refresh token (may be the same as the one provided)."_ So the response **always contains a `refresh_token` field**, but the value may equal the previously-stored token (no rotation this round) or differ (rotation). The new `inoreader-oauth.ts` module's persistence logic:
>
> 1. Always read `refresh_token` from the response if present
> 2. Compare to the currently-stored value via `inoreader-token-store.ts`
> 3. Only `SET` the new value if it differs — avoids redundant Upstash writes when no rotation happened
>
> Test coverage matrix needs both cases (Phase 2): rotation present (new value written) AND rotation absent (value-equal — no write). This is now a definitive contract, not defensive-paranoia coverage.

## Phase 1: Module-split refactor + single-flight-lock primitive

**Goal**: split `inoreader-worker.ts` into focused modules + introduce the generic Upstash lock helper. **No behavior change** — this is a pure refactor PR.

**Deliverables**:

- [ ] Rename `mcp-server/src/lib/inoreader-worker.ts` → `inoreader-client.ts`
- [ ] Create `mcp-server/src/lib/inoreader-token-store.ts` — move all Upstash token I/O here (currently inside `resolveConfig` in the old module)
- [ ] Create `mcp-server/src/lib/single-flight-lock.ts` — `acquire(env, key, ttl, value?)`, `pollForChange(env, key, opts)`, `release(env, key, value)` API
- [ ] Create `mcp-server/src/lib/inoreader-bl039-fallback.ts` — pull `triggerWebsiteRefresh` out of the old file into its own module so Phase B is a single-file deletion
- [ ] Update imports across `mcp-server/src/` (search-and-replace)
- [ ] Test fixtures: ensure `inoreader-worker.test.ts` migrates cleanly to `inoreader-client.test.ts`; new unit tests for the lock helper

**Verification**:

- [ ] 519/519 MCP tests pass (current baseline)
- [ ] `npx astro check` clean
- [ ] `npm run lint` clean
- [ ] Worker bundles to the same gzipped size ±5% (no accidental code bloat from the split)
- [ ] No production deploy in this PR — verify in staging via smoke test (`/health` returns the BL-032.7 payload; `search_radar` tool call succeeds end-to-end)

## Phase 2: `inoreader-oauth.ts` + `bearer.ts` per-key scope subset extension

**Goal**: introduce the Worker-owned refresh module + bearer.ts extension. The refresh path runs **alongside** the BL-039 fallback (Phase A dual-write — Phase B retires the fallback).

**Deliverables**:

- [ ] `inoreader-oauth.ts`: `refreshAccessToken(env, source)` implementing the discriminated-union contract (see Error taxonomy table). Single-flight via `single-flight-lock.ts`; persistence delegation to `inoreader-token-store.ts`.
- [ ] Wire into `inoreader-client.ts::authenticatedFetch`: try `refreshAccessToken()` first, fall back to `triggerWebsiteRefresh()` (from `inoreader-bl039-fallback.ts`) ONLY when primary returns `reason: 'inoreader-error'` — never on `invalid-refresh-token` (that needs operator action, not retry)
- [ ] `mcp-server/src/auth/bearer.ts` extension: at the per-key resolution loop (lines 92-102), check for a companion `MCP_KEY_<OWNER>_SCOPES` env var (JSON-encoded array). If present + valid, the resolved `AuthSuccess.scopes` uses that array. If absent, falls back to `DEFAULT_SCOPES`. Malformed JSON rejects auth with a clear error (auth-time fail-loud, not silent fallback).
- [ ] Cron proactive refresh hook at [`mcp-server/src/cron/radar-refresh.ts:187`](../../../mcp-server/src/cron/radar-refresh.ts#L187) — after circuit-breaker + day-cap checks, before parallel fetch: read `PTTL mcp:inoreader:access_token`; if < 300s, call `refreshAccessToken(env, 'cron')` proactively.
- [ ] Test coverage (see Test coverage matrix below — Phase-2 rows)

**Verification**:

- [ ] All new tests pass
- [ ] **Staging soak step**: induce token expiry by manually clearing `mcp:inoreader:access_token` in the MCP DB. Trigger a cron run (or wait for next 6h tick). Observe in Sentry: `refresh.cron.success` breadcrumb with `refreshSource: 'fresh'`. New `mcp:inoreader:access_token` and `mcp:inoreader:refresh_token` present in Upstash MCP DB. Day-counter increments correctly per BL-032.7 T.Z.1 accounting.
- [ ] **Concurrency staging test**: kill the cron's TTL value, trigger both a cron firing and a live `search_radar` call within ~1s window. Verify only ONE `/oauth2/token` POST in Sentry (via Inoreader breadcrumb or Cloudflare Logs).

## Phase 3: `/radar/snapshot` HTTP endpoint + narrow-scope key issuance

**Goal**: expose the HTTP convenience endpoint + issue the website's narrow-scope bearer.

**Deliverables**:

- [ ] `GET /radar/snapshot` route handler in [`mcp-server/src/worker.ts`](../../../mcp-server/src/worker.ts) — slotted after `/health` (line 146), before bearer auth (line 149). Handler authenticates via existing `authenticate(request, env)` then `assertScope(auth.scopes, 'resource:radar:read')`. Body delegates to existing `readWireLive(env)` + `readFyiLive(env, 30)` in parallel; returns `{ wire, fyi, fetchedAt }` JSON. CORS via existing `withCors()` wrapper.
- [ ] `wrangler secret put MCP_KEY_WEBSITE_RADAR --env staging` and `--env production` — generate fresh bearer per env: `openssl rand -hex 32`
- [ ] `wrangler secret put MCP_KEY_WEBSITE_RADAR_SCOPES --env staging` — JSON value: `["resource:radar:read"]` (same on production)
- [ ] Integration tests (see Test coverage matrix below — Phase-3 rows)
- [ ] Document the new endpoint shape in [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) under a new "Public HTTP convenience endpoints" section

**Verification**:

- [ ] Staging: `curl -H "Authorization: Bearer $MCP_KEY_WEBSITE_RADAR" https://mcp-staging.globalstrategic.tech/radar/snapshot` returns 200 + JSON with both tiers populated
- [ ] Same call WITHOUT the bearer returns 401
- [ ] Bearer with `tool:*` only (no `resource:radar:read`) returns 403 with `MissingScopeError` envelope shape

## Phase 4: Website cutover (Phase A — Inoreader-direct path REMAINS as rollback)

**Goal**: switch [`src/components/radar/RadarFeed.astro`](../../../src/components/radar/RadarFeed.astro) to call the Worker. Website **still has** `INOREADER_*` env vars (not removed yet — kept as the structural rollback path for the duration of soak).

**Deliverables**:

- [ ] `RadarFeed.astro` fetches `https://mcp.globalstrategic.tech/radar/snapshot` at SSR time using `MCP_KEY_WEBSITE_RADAR` as bearer (new Vercel env var on production + preview)
- [ ] Add `MCP_KEY_WEBSITE_RADAR` to Vercel envs (production, preview, development)
- [ ] Verify Vercel preview deploy renders `/hub/radar` correctly via the Worker
- [ ] Cutover PR title explicitly: `feat(bl-032.8): Phase A website cutover — radar via MCP (Inoreader-direct kept as rollback)`

**Verification**:

- [ ] Vercel preview `/hub/radar` renders snapshot fetched from Worker (verify via DevTools Network panel — fetch hits `mcp.globalstrategic.tech`)
- [ ] Production `/hub/radar` renders correctly post-merge
- [ ] Rollback rehearsal: in a separate test branch, `git revert` the RadarFeed.astro commit; confirm the page renders correctly via the legacy direct-Inoreader path. Discard the test branch.

## Phase 5: Soak (7 calendar days)

**Goal**: verify no regressions; confirm both paths function during the dual-write window; gather evidence to safely retire BL-039.

**Success criteria** (all must hold for the entire 7-day window):

- [ ] **Zero `inoreader-error` invocations** of `triggerWebsiteRefresh()` fallback in Sentry. (Sentry alert: `count(refresh.bl039-fallback.invoked) > 0` → page on-call.) Any non-zero count means the new primary path failed and the website is still load-bearing; investigate before Phase B.
- [ ] **Inoreader Developer Console** shows ONE app's usage graph (consolidated). Daily Zone-1 total < 100 with comfortable headroom (target: < 30 in steady state).
- [ ] **Zero website `/hub/radar` rendering errors** attributable to Worker fetch failures (track via Vercel logs + Sentry).
- [ ] **Day-counter** (`mcp:inoreader:day-counter:<UTC-date>`) shows expected ~24 calls/day (4 cron-firings × 6 calls per fire).
- [ ] **Induced 429 test** (one-time during soak): force-set `mcp:radar:circuit-open` in MCP DB. Verify website `/hub/radar` shows degraded UX gracefully (cached snapshot from Worker if present, or the legacy fallback messaging). Live MCP tool calls return 503 envelopes with `Retry-After`. Both consumers see the same recovery moment when breaker closes.
- [ ] **Induced token-expiry test** (one-time during soak): manually clear `mcp:inoreader:access_token`. Next live tool call observes `refreshAccessToken('live-tool')` succeeds; subsequent calls within 10s observe `refreshSource: 'cached-by-peer'`; only ONE `/oauth2/token` POST appears in Sentry breadcrumbs.

**Phase B PR drafted day-of-Phase-4-merge** (operator opens a draft PR with target merge date = Phase 4 merge + 7 days in the PR description, ensuring the cleanup is calendar-visible from the start).

## Phase 6: BL-039 retirement (Phase B PR)

**Goal**: delete the website-mediated refresh path. Single-writer invariant fully relocated; one fewer secret to rotate.

**Deliverables** (single PR — all changes atomic):

- [ ] Delete `mcp-server/src/lib/inoreader-bl039-fallback.ts` (the entire module that was pulled out in Phase 1)
- [ ] Remove the fallback branch in `inoreader-client.ts::authenticatedFetch`
- [ ] Delete `src/pages/api/inoreader/refresh.ts` (entire file)
- [ ] Delete `src/lib/inoreader/client.ts` (entire file — the website's parallel Inoreader client)
- [ ] Search-and-update or delete any callers of the website client in `src/pages/api/` or `src/lib/`
- [ ] `vercel env rm INOREADER_APP_ID INOREADER_APP_KEY INOREADER_ACCESS_TOKEN INOREADER_REFRESH_TOKEN INOREADER_REFRESH_SECRET` for all targets (production, preview, development)
- [ ] `wrangler secret delete INOREADER_REFRESH_SECRET --env staging` + `--env production`
- [ ] Remove `INOREADER_REFRESH_SECRET` + `INOREADER_REFRESH_URL` documentation from [`mcp-server/wrangler.toml`](../../../mcp-server/wrangler.toml) (comment block at lines 60-70)
- [ ] Close BL-040 in `BACKLOG.md` as `✅ Superseded` with reference to this PR
- [ ] Update `BACKLOG.md` BL-032.8 status to `✅ Shipped <date>` with commit SHAs

**Verification**:

- [ ] All tests pass
- [ ] Production deploy of both Worker + website succeeds
- [ ] `/hub/radar` continues rendering for 48h post-merge (monitor Sentry + Vercel logs)
- [ ] Zero attempts to call the deleted `/api/inoreader/refresh` endpoint (404 metrics in Vercel; if non-zero, investigate origin)
- [ ] Inoreader DB Upstash (the `inoreader:*` namespace) shows zero writes for 48h post-deploy — can be retired in a follow-up housekeeping PR

## Phase ordering rationale

| Phase | Rationale for this position                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Pre-kickoff verification — resolves unknowns before code commits to assumptions                                                                                                                                                                     |
| 1     | Pure refactor first; lands the new module boundaries with no behavior change so Phase 2's review focuses purely on the OAuth logic                                                                                                                  |
| 2     | OAuth substrate + bearer extension in one PR — they're related ("Worker-owned refresh + scope subset for the narrow-scope key the website will use in Phase 4"); cron proactive refresh fits here because cron is the most disciplined test surface |
| 3     | `/radar/snapshot` endpoint depends on Phase 2's `resource:radar:read` scope plumbing; isolating to its own PR makes the website cutover (Phase 4) review focused                                                                                    |
| 4     | Website cutover comes after the Worker endpoint is live + verified; cutover PR is small (one component swap) so rollback is cheap                                                                                                                   |
| 5     | Soak is the gate before deletion — 7 days is short enough to feel responsive, long enough to surface intermittent issues                                                                                                                            |
| 6     | Deletion last, in a single atomic PR, with the close-out of BL-040 + BL-032.8 in the same commit so the audit trail is clean                                                                                                                        |

## Test coverage matrix

Each test below is a discrete unit or integration test added in the same PR as the code it exercises. Tests live under `mcp-server/tests/`.

| Phase | Test                                                                                                               | Type              | Path                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ----------------- | --------------------------------------------------- |
| 1     | `single-flight-lock` acquire/release happy path                                                                    | unit              | `tests/unit/lib/single-flight-lock.test.ts`         |
| 1     | `single-flight-lock` acquire returns false when held by peer                                                       | unit              | (same)                                              |
| 1     | `single-flight-lock` `pollForChange` returns observed value when key changes                                       | unit              | (same)                                              |
| 1     | `single-flight-lock` `pollForChange` times out cleanly                                                             | unit              | (same)                                              |
| 1     | `inoreader-token-store` write paths persist with correct TTLs                                                      | unit              | `tests/unit/lib/inoreader-token-store.test.ts`      |
| 1     | `inoreader-token-store` read paths return null when Upstash unreachable                                            | unit              | (same)                                              |
| 1     | All existing `inoreader-worker.test.ts` cases migrate cleanly to `inoreader-client.test.ts`                        | unit (regression) | `tests/unit/lib/inoreader-client.test.ts`           |
| 2     | `refreshAccessToken('cron')` happy path → both keys written, lock released, log emitted                            | unit              | `tests/unit/lib/inoreader-oauth.test.ts`            |
| 2     | `refreshAccessToken` returns `invalid-refresh-token` on Inoreader 401 + `invalid_grant`, no retry, critical Sentry | unit              | (same)                                              |
| 2     | Concurrent `refreshAccessToken` → second caller returns `cached-by-peer`, ONE `/oauth2/token` POST                 | unit              | (same)                                              |
| 2     | `refreshAccessToken` returns `lock-timeout` when peer holds lock > 15s                                             | unit              | (same)                                              |
| 2     | `refreshAccessToken` returns `upstash-write-failed` on persistence failure, lock still released                    | unit              | (same)                                              |
| 2     | `bearer.ts` per-key scope subset: `MCP_KEY_FOO=token` + `MCP_KEY_FOO_SCOPES=["…"]` resolves to narrowed scopes     | unit              | `tests/unit/auth/bearer-scope-subset.test.ts`       |
| 2     | `bearer.ts` per-key scope: missing `_SCOPES` falls back to `DEFAULT_SCOPES`                                        | unit              | (same)                                              |
| 2     | `bearer.ts` per-key scope: malformed `_SCOPES` JSON rejects auth with clear error                                  | unit              | (same)                                              |
| 2     | `radar-refresh` proactive refresh fires when TTL < 300s                                                            | integration       | `tests/integration/cron-proactive-refresh.test.ts`  |
| 2     | `radar-refresh` skips proactive refresh when TTL > 300s                                                            | integration       | (same)                                              |
| 2     | `search_radar` 401 → `refreshAccessToken('live-tool')` → retry succeeds, no BL-039 round-trip                      | integration       | `tests/integration/radar-live-token-stale.test.ts`  |
| 2     | Simultaneous cron + live-tool 401 → exactly one `/oauth2/token` POST observed                                      | integration       | `tests/integration/refresh-single-flight.test.ts`   |
| 3     | `GET /radar/snapshot` with valid `MCP_KEY_WEBSITE_RADAR` returns 200 + JSON                                        | integration       | `tests/integration/radar-snapshot-endpoint.test.ts` |
| 3     | `GET /radar/snapshot` without bearer returns 401                                                                   | integration       | (same)                                              |
| 3     | `GET /radar/snapshot` with bearer lacking `resource:radar:read` returns 403 `MissingScopeError`                    | integration       | (same)                                              |
| 3     | `GET /radar/snapshot` CORS preflight returns 204 with allow-origin header                                          | integration       | (same)                                              |
| 4     | (manual) Vercel preview deploy renders `/hub/radar` from MCP Worker successfully                                   | manual            | n/a — verified during Phase 4 PR review             |
| 6     | All deletion-PR test runs green; no orphan imports                                                                 | regression        | full `npm run test:mcp`                             |

## Risks & mitigations

| Risk                                                                          | Mitigation                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inoreader rotates refresh_token but Worker fails to persist new one           | Sequential persistence (refresh_token written BEFORE access_token); test coverage on rotation path; if write fails after refresh, `upstash-write-failed` returned and operator alerted |
| Concurrent cron + live-tool 401 spawn 2 refresh calls                         | Upstash SET-NX-EX lock; integration test asserts exactly 1 `/oauth2/token` call                                                                                                        |
| Website cutover regresses `/hub/radar` rendering                              | Phase A dual-write means rollback is `git revert` of the single cutover commit; structural safety net without runtime config                                                           |
| `mcp:inoreader:refresh-lock` orphaned on Worker crash mid-refresh             | 10s TTL on lock forces release; worst case is 10s delay before next refresh attempt                                                                                                    |
| Vercel preview deploy CORS rejection from Worker                              | Worker's CORS allowlist already permits `*.vercel.app` patterns; verify in Phase 3 verification step                                                                                   |
| BL-039 fallback gets exercised during Phase A, indicating new path is broken  | Sentry alert on `refresh.bl039-fallback.invoked` count > 0 during soak — pages on-call; Phase B PR held until investigation completes                                                  |
| Inoreader's `/oauth2/token` rate-limits us (rare but possible under flapping) | Lock TTL gives a natural back-off; `lock-timeout` reason path falls through with current token; circuit breaker takes over if downstream API calls also start 429-ing                  |
| Migrating active website traffic mid-day causes brief errors                  | Cutover PR scheduled for low-traffic window (operator picks); Vercel ISR rollover is gradual; rollback is `git revert` if observed errors > threshold within first 30 min post-deploy  |

## What this costs

| Item                            | Estimate                                        |
| ------------------------------- | ----------------------------------------------- |
| Phase 0 verification            | ~30 min                                         |
| Phase 1 (module split)          | ~1 day                                          |
| Phase 2 (OAuth + bearer + cron) | ~2 days                                         |
| Phase 3 (`/radar/snapshot`)     | ~1 day                                          |
| Phase 4 (website cutover)       | ~0.5 day                                        |
| Phase 5 (soak)                  | 7 days calendar, ~1 day operator attention      |
| Phase 6 (Phase B PR)            | ~0.5 day                                        |
| **Total**                       | **5-7 days engineering + 7 days calendar soak** |

## Verification end-to-end (post-Phase 6)

Run these checks 48h after Phase B merges:

1. **Smoke — production custom domain**: `curl https://mcp.globalstrategic.tech/health` returns 200 with the BL-032.7 health payload
2. **Smoke — `/radar/snapshot`**: with valid `MCP_KEY_WEBSITE_RADAR`, returns `{ wire, fyi, fetchedAt }`; without bearer returns 401; with mismatched scope returns 403
3. **Inoreader Developer Console**: ONE app's usage graph visible; total daily Zone-1 < 100 with comfortable headroom
4. **Sentry**: zero `refresh.bl039-fallback.invoked` events after Phase B merge; refresh breadcrumbs tagged with `source: cron|live-tool|manual`
5. **Website**: `/hub/radar` renders snapshot for 48h with no Vercel-side `INOREADER_*` env vars present (verify via `vercel env ls` — should be empty)
6. **Cron health**: day-counter increments by exactly 6 per fire (5 wire + 1 fyi); zero "skipped — circuit-open" events under nominal upstream
7. **Audit**: search the website repo for any remaining references to `inoreader/client.ts` or `INOREADER_*` env — should be zero

If any check fails, document the gap and decide whether to ship a corrective PR or roll back Phase B before continuing.

---

_Last updated: 2026-05-17 — initial filing, predecessor + sequel links, design rationale, six-phase execution plan with embedded verification + ASCII architecture/flow/matrix diagrams. Phase 0 Q-stanza pending Context7 lookup._
