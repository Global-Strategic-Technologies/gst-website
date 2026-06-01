# MCP Server — Radar Consumer Unification (BL-032.8)

> ## ✅ Closed 2026-05-27
>
> - **Phase A** shipped via PR #139 (commit `89e5933`, merged 2026-05-17)
> - **Phase B** retirement shipped via PR #140 (commit `794190c`, merged 2026-05-27)
> - **Honest closure** via PR #<TBD> — source/test cleanup of stale BL-039 references + doc reconciliation + BACKLOG truth pass
> - **Operator-side decom** of legacy `gst-radar-tokens` Upstash DB + Vercel `INOREADER_*` env vars + Worker `UPSTASH_INOREADER_REST_*` / `INOREADER_REFRESH_SECRET` secrets completed 2026-05-27 (see [`mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md`](../../../mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md))
> - **Substrate verified**: `/health` returns `upstashMcp: "ok"` with no `upstashInoreader` field; Inoreader Developer Console shows single-app traffic; zero `triggerWebsiteRefresh` invocations in Sentry post-Phase-B
>
> Sections below preserve the original design narrative as historical reference.

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
> **Status**: 🟡 **Phase A complete; Phase B pending merge** (as of 2026-05-25)
>
> - Phases 0–5 ✅ shipped to master between 2026-05-17 and 2026-05-21 (Phase A cutover via PR #139; soak closed via PRs #145/149/150/152/153/156).
> - Phase 6 (Phase B retirement) 🟡 sits on draft PR #140 (`feature/bl-032.8-phase-b-retirement`) — code committed on the branch, **not yet merged**. Closes BL-039 fallback + website Inoreader client + Vercel `INOREADER_*` env retirement.
>
> **Delivery log** (master commits):
>
> | Phase              | Commit / PR                                              | Description                                                                                                                                                                                                                             |
> | ------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 1                  | `53141ff`                                                | Module split + single-flight-lock primitive                                                                                                                                                                                             |
> | 2                  | `8a695ec`                                                | Worker-direct OAuth refresh + bearer scope subset + cron proactive refresh                                                                                                                                                              |
> | 3+4 (Phase A)      | PR #139 (`89e5933`, merged 2026-05-17)                   | `/radar/snapshot` HTTP endpoint + website cutover + `MCP_KEY_WEBSITE_RADAR` issuance                                                                                                                                                    |
> | Phase 5 follow-ups | PRs #141, #143, #144, #145, #149, #150, #152, #153, #156 | Soak hardening: Sentry probe suppression, staging cron disable, `/api/inoreader/refresh` hidden from probes, Day-2/3/4/5 soak closeouts, mcp-health stale-while-OK, Sentry flush in scheduled handler, Inoreader spend-accounting scope |
> | Phase 6 (Phase B)  | PR #140 (draft, `606f484` + `3749087` + `1a7985a`)       | **Pending merge**                                                                                                                                                                                                                       |

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

## Phase 1: Module-split refactor + single-flight-lock primitive ✅ SHIPPED

**Shipped**: 2026-05-17 (commit `53141ff`).

**Goal**: split `inoreader-worker.ts` into focused modules + introduce the generic Upstash lock helper. **No behavior change** — this is a pure refactor PR.

**Deliverables**:

- [x] Rename `mcp-server/src/lib/inoreader-worker.ts` → `inoreader-client.ts`
- [x] Create `mcp-server/src/lib/inoreader-token-store.ts` — move all Upstash token I/O here (currently inside `resolveConfig` in the old module)
- [x] Create `mcp-server/src/lib/single-flight-lock.ts` — `acquire(env, key, ttl, value?)`, `pollForChange(env, key, opts)`, `release(env, key, value)` API
- [x] Create `mcp-server/src/lib/inoreader-bl039-fallback.ts` — pull `triggerWebsiteRefresh` out of the old file into its own module so Phase B is a single-file deletion
- [x] Update imports across `mcp-server/src/` (search-and-replace)
- [x] Test fixtures: ensure `inoreader-worker.test.ts` migrates cleanly to `inoreader-client.test.ts`; new unit tests for the lock helper

**Verification**:

- [x] MCP tests pass (current baseline)
- [x] `npx astro check` clean
- [x] `npm run lint` clean
- [x] Worker bundles to the same gzipped size ±5%
- [x] Staging smoke test passed before merge

## Phase 2: `inoreader-oauth.ts` + `bearer.ts` per-key scope subset extension ✅ SHIPPED

**Shipped**: 2026-05-17 (commit `8a695ec`; bearer-scope union fix `e03ac11`).

**Goal**: introduce the Worker-owned refresh module + bearer.ts extension. The refresh path runs **alongside** the BL-039 fallback (Phase A dual-write — Phase B retires the fallback).

**Deliverables**:

- [x] `inoreader-oauth.ts`: `refreshAccessToken(env, source)` discriminated-union contract, single-flight via `single-flight-lock.ts`, persistence via `inoreader-token-store.ts`.
- [x] Wire into `inoreader-client.ts::authenticatedFetch`: primary first, BL-039 fallback only on `reason: 'inoreader-error'`.
- [x] `mcp-server/src/auth/bearer.ts` per-key scope subset via `MCP_KEY_<OWNER>_SCOPES`; malformed JSON fails auth loudly.
- [x] Cron proactive refresh hook in [`mcp-server/src/cron/radar-refresh.ts`](../../../mcp-server/src/cron/radar-refresh.ts) — PTTL < 300s → `refreshAccessToken(env, 'cron')`.
- [x] Test coverage delivered (see Test coverage matrix — Phase-2 rows).

**Verification**:

- [x] All new tests pass
- [x] Staging soak step: token-expiry induction observed `refresh.cron.success` with `refreshSource: 'fresh'`
- [x] Concurrency staging test: single `/oauth2/token` POST observed under simultaneous cron + live-tool 401

## Phase 3: `/radar/snapshot` HTTP endpoint + narrow-scope key issuance ✅ SHIPPED

**Shipped**: 2026-05-17 (part of PR #139 `89e5933`).

**Goal**: expose the HTTP convenience endpoint + issue the website's narrow-scope bearer.

**Deliverables**:

- [x] `GET /radar/snapshot` route handler in [`mcp-server/src/worker.ts`](../../../mcp-server/src/worker.ts) — `authenticate` + `assertScope('resource:radar:read')`, returns `{ wire, fyi, fetchedAt }`.
- [x] `MCP_KEY_WEBSITE_RADAR` provisioned (staging + production).
- [x] `MCP_KEY_WEBSITE_RADAR_SCOPES = ["resource:radar:read"]` provisioned (both envs).
- [x] Integration tests at `tests/integration/radar-snapshot-endpoint.test.ts`.
- [x] Documentation in [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md).

**Verification**:

- [x] Staging `curl /radar/snapshot` returns 200 with both tiers
- [x] Missing bearer → 401; mismatched scope → 403 `MissingScopeError`

## Phase 4: Website cutover (Phase A — Inoreader-direct path REMAINS as rollback) ✅ SHIPPED

**Shipped**: 2026-05-17 via PR #139 (`89e5933`). Inoreader-direct path retained on master pending Phase B.

**Goal**: switch [`src/components/radar/RadarFeed.astro`](../../../src/components/radar/RadarFeed.astro) to call the Worker.

**Deliverables**:

- [x] `RadarFeed.astro` fetches `https://mcp.globalstrategic.tech/radar/snapshot` at SSR using `MCP_KEY_WEBSITE_RADAR` bearer.
- [x] `MCP_KEY_WEBSITE_RADAR` added to Vercel envs (production + preview).
- [x] Vercel preview deploy verified.
- [x] Cutover landed as PR #139.

**Verification**:

- [x] Vercel preview `/hub/radar` fetches from `mcp.globalstrategic.tech`
- [x] Production `/hub/radar` rendering confirmed post-merge
- [x] Rollback path documented; structural revert verified safe

## Phase 5: Soak (7 calendar days) ✅ COMPLETE

**Soak window**: 2026-05-17 → 2026-05-21. Day-2/3/4/5 findings closed via PRs #141, #143, #144, #145, #149, #150, #152, #153, #156. Operator soak tracker: PR #145 (`ab971fb`).

**Success criteria**:

- [x] Zero unexpected `inoreader-error` BL-039 fallback invocations
- [x] Inoreader Developer Console showed one consolidated app; daily Zone-1 28–37 calls/day baseline observed (vs day-counter 24 — gap analyzed, scoped to BL-032.75 spend-accounting follow-up via PR #156)
- [x] Zero `/hub/radar` rendering errors attributable to Worker fetch failures
- [x] Single-flight refresh verified under cron + live-tool overlap
- [x] Induced 429 + token-expiry tests passed

**Soak-window hardening shipped during the window**:

- PR #141 — suppress Sentry capture for probe-class auth failures (`f570106`)
- PR #143 — disable staging cron (was doubling Inoreader budget burn) (`f9f7102`)
- PR #144 — hide internal `/api/inoreader/refresh` from anonymous probes (`7817659`)
- PR #149 — `SECRETS_INVENTORY.md` + Day-3 soak findings (`67b26d3`)
- PR #150 — flush Sentry queue before scheduled-handler isolate teardown (`fa88bde`)
- PR #152 — `/health` stale-while-OK semantics for Inoreader observation (`fc52f10`)
- PR #156 — scope Inoreader spend-accounting fix + Day-4/5 closeout (`6ba45a3`)

**Phase B PR drafted**: PR #140 opened 2026-05-17, currently in draft state awaiting merge.

## Phase 6: BL-039 retirement (Phase B PR) 🟡 PENDING MERGE

**Status**: PR #140 open as draft (`feature/bl-032.8-phase-b-retirement`). Implementation commits already on the branch (`606f484`, `3749087`, `1a7985a`); awaits operator merge.

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

_Last updated: 2026-05-25 — delivery log added; Phases 0–5 marked shipped (PR #139 + soak hardening PRs #141/143/144/145/149/150/152/153/156); Phase 6 status updated to pending merge on draft PR #140. **Soak-gate tracker**: [`mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md`](../../../mcp-server/src/docs/operations/_archive/BL-032_8_SOAK_GATE.md) — operator runbook for the 2026-05-17 → 2026-05-24 window between Phase A merge and PR #140 merge._

_Originally filed: 2026-05-17._
