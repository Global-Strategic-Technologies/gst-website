# MCP Server — Resources & Prompts on Remote (BL-032.5)

> **Backlog initiative**: [BL-032.5: MCP Server — Resources & Prompts on Remote](BACKLOG.md#bl-0325-mcp-server--resources--prompts-on-remote)
>
> **Predecessors**:
>
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle. Read first.
> - [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — defines the local-stdio Resources surface (Library, Regulations, Radar) being ported here.
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — defines the local-stdio Prompts library being ported here.
> - [BL-032 in BACKLOG.md](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) — the remote HTTP/Workers/auth/rate-limiting substrate this initiative builds on.
>
> **Sequel**: [MCP_SERVER_OBSERVABILITY_BL-032_75.md](MCP_SERVER_OBSERVABILITY_BL-032_75.md) — production observability maturity layered on top of the remote surface.
>
> **Scope**: this document covers [BL-032.5](BACKLOG.md#bl-0325-mcp-server--resources--prompts-on-remote) — porting the Resources and Prompts primitives delivered locally in BL-031.5 and BL-031.75 to the remote HTTP transport, auth, and rate-limit surface delivered in BL-032.
>
> **Status**: Open — implementation kicked off 2026-05-13 on branch `feature-mcp2`. Depends on BL-031.5, BL-031.75, BL-032 (all shipped). Coordinates with BL-039 (filed 2026-05-12; see [BL-039 in BACKLOG.md](BACKLOG.md#bl-039-worker-as-inoreader-refresh-writer)).

---

## 2026-05-13 Verification Audit

This document was drafted **2026-04-25** — before BL-032 shipped to production (2026-05-12) and before BL-039 was filed (2026-05-12). A current-state audit on 2026-05-13 (during feature-mcp2 planning) found that **substantial parts of the original BL-032.5 scope are already shipped**, and **one architectural assumption is wrong** (HTTP-level ETag/Cache-Control over MCP's POST-only Streamable HTTP transport). This section is the corrected ground truth; subsequent sections have been revised inline to match.

### Already shipped (premise of doc partially obsolete)

| Original claim                                                                                                        | Verified state (2026-05-13)                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "All the orchestration value of BL-031.75 evaporates the moment the user leaves their dev machine" (line 24 original) | **False today.** `createServer()` at [`mcp-server/src/server.ts:39-62`](../../../mcp-server/src/server.ts) unconditionally registers Prompts via `registerPrompts(server)` (line 59); the Worker calls `createServer(env)` at [`mcp-server/src/worker.ts:192`](../../../mcp-server/src/worker.ts). All 8 `gst_*` prompts are already accessible over HTTP |
| Library Resources are stdio-only                                                                                      | **Already on Worker.** `registerLibraryResources(server)` is called inside `createServer()` (transport-portable). 2 articles: `gst://library/business-architectures`, `gst://library/vdr-structure` ([`mcp-server/src/content/library-loader.ts:24,31`](../../../mcp-server/src/content/library-loader.ts))                                               |
| Regulation Resources are stdio-only                                                                                   | **Already on Worker.** 120 frameworks registered via `registerRegulationResources(server)` in `createServer()`. URI shape `gst://regulations/<jurisdiction>/<framework-id>` confirmed                                                                                                                                                                     |
| `orchestrates: [...]` field convention introduced in BL-031.75                                                        | **Shipped.** Defined at [`mcp-server/src/prompts/types.ts:27-36`](../../../mcp-server/src/prompts/types.ts); `gst_target_quick_look` orchestrates exactly 4 tools (`assess_infrastructure_cost_governance`, `compute_techpar`, `estimate_tech_debt_cost`, `search_regulations`)                                                                           |
| URI stability test                                                                                                    | **Shipped** as [`mcp-server/tests/integration/resource-uri-stability.test.ts`](../../../mcp-server/tests/integration/resource-uri-stability.test.ts); asserts 2 Library URIs, 6 Radar URIs, 120 Regulation count, canary URIs (`eu/gdpr`, `us-ca/ccpa`, `ca-qc/law25`, `gb/dpa`), uniqueness, and full `resources/list` manifest                          |
| Prompt versioning + freshness discipline                                                                              | **Shipped.** Every prompt has a `version` field (e.g. `'0.0.3'`); `assertPromptInvariants` at [`mcp-server/src/prompts/_registry.ts:51-82`](../../../mcp-server/src/prompts/_registry.ts) throws at server boot if `lastReviewedAt` exceeds 12 months                                                                                                     |
| MCP SDK supports `prompts/list`, `notifications/message`                                                              | **Confirmed.** `@modelcontextprotocol/sdk@^1.29.0` ([`mcp-server/package.json:30`](../../../mcp-server/package.json))                                                                                                                                                                                                                                     |

### Architectural assumption that is WRONG

**Original plan**: HTTP-level Resource caching via `Cache-Control: public, max-age=...`, `ETag` content hashes, and `If-None-Match → 304 Not Modified` round-trips on a REST endpoint `GET /resources/read?uri=...`.

**Why it doesn't fit**: MCP Streamable HTTP transport is **JSON-RPC over POST** to a single `/mcp` endpoint. The Worker has only two routes today (`GET /health` and `*` → bearer auth → rate limit → MCP handler, see [`mcp-server/src/worker.ts:103-208`](../../../mcp-server/src/worker.ts)). There is no per-Resource GET endpoint, the MCP client does not send `If-None-Match`, and the MCP protocol does not define `304 Not Modified` semantics. Headers like `Cache-Control` on a POST `/mcp` response apply to the whole batch, not to individual Resource reads inside the JSON-RPC envelope.

**Revised plan**: **Server-side caching** inside Resource handlers, keyed in Upstash. Handlers consult the cache before computing the body; cache is invisible to clients. Per-Resource TTLs (Library/Regulations 24h, Radar weak 15m, Radar items 24h) live in code. The "303 caches" outcomes of the original plan are achievable this way; the protocol contortions are not. Detailed below in § Critical cross-cutting decisions.

### Still genuinely to do (actual BL-032.5 scope)

1. **Radar Resources on the Worker** — currently stdio-only because [`mcp-server/src/content/radar-snapshot.ts`](../../../mcp-server/src/content/radar-snapshot.ts) reads from `.cache/inoreader/` via `node:fs` (Node-only modules). Wire a Worker-friendly reader that pulls the snapshot from Upstash (`mcp:radar:cache:wire`, `mcp:radar:cache:fyi` — keys already used by `radar-live-store.ts`). Move `registerRadarResources` from `_local-only.ts` to `server.ts` once the reader is transport-portable
2. **Worker Cron for hourly radar snapshot refresh** — populate the Upstash radar cache so Radar Resources have something to read. No `[triggers]` block in [`mcp-server/wrangler.toml`](../../../mcp-server/wrangler.toml) today
3. **Scope catalog** ([`mcp-server/src/auth/scopes.ts`](../../../mcp-server/src/auth/scopes.ts) NEW) — define `tool:*`, `tool:radar:*`, `resource:library:read`, `resource:regulations:read`, `resource:radar:read`, `prompt:*`. For BL-032.5 every key gets the full scope set (single-team internal use); per-key scope variation is BL-033. Bearer-auth result needs to carry scope state — today `AuthSuccess` at [`mcp-server/src/auth/bearer.ts:28-32`](../../../mcp-server/src/auth/bearer.ts) returns only `keyOwner`
4. **Server-side Resource cache** ([`mcp-server/src/cache/resource-cache.ts`](../../../mcp-server/src/cache/resource-cache.ts) NEW) — Upstash-backed; key prefix `mcp:resource:<sha256-of-uri>`; value `{ body, mimeType, populatedAt }`; per-URI-family TTL. Cache check moves inside Library/Regulation/Radar handlers
5. **Prompt-aware rate-limit accommodation** — the steady 60 req/min general bucket at [`mcp-server/src/ratelimit/limiter.ts:71-72`](../../../mcp-server/src/ratelimit/limiter.ts) covers the worst-case 4-tool fan-out from `gst_target_quick_look` with margin; the design doc's proposed burst allowance (10 over steady) is **likely unnecessary** but should be re-verified once the prompt-fan-out telemetry is in place. Decision: hold this work pending Phase 2 telemetry
6. **`BREAKING_CHANGES.md`** + a manifest-stability test that fails if a URI or prompt name changed without a version bump. URI-stability test exists; the new test extends it with a checked-in manifest hash
7. **BL-039 coordination** — BL-039's on-demand refresh path is **complementary** to BL-032.5's hourly Cron. Cron alone doesn't fix the "Claude Desktop hits stale tokens at minute 59" case. See § Risks below

### What was NOT in the original doc but matters

- **Sentry observability is now live** ([BL-032 § Phase 5](MCP_SERVER_REMOTE_BL-032.md) shipped 2026-05-12; see [SENTRY_MANUAL_SETUP.md](./SENTRY_MANUAL_SETUP.md)). BL-032.5 should emit `captureMessage` breadcrumbs for `resource_read`, `resource_cache_miss`, `prompt_invoke`, and `cron_run` so the observability initiative (BL-032.75) doesn't have to retro-instrument
- **Production URL flipped** from `mcp-staging.globalstrategic.tech` to `mcp.globalstrategic.tech` on 2026-05-12 (commit `48e920b`). The original verification steps reference staging URLs only; the revised verification section uses both
- **MCP SDK calling convention for `registerPrompt`** — the SDK expects a `ZodRawShape` (not a wrapped `z.object`), see [`mcp-server/src/prompts/_registry.ts:88-94`](../../../mcp-server/src/prompts/_registry.ts). Same convention applies if we register additional dynamic Prompts later
- **Radar tools (`search_radar`, `get_latest_insights`) already on Worker** since BL-032 Phase 4. Radar **Tools** are not part of BL-032.5 scope — only radar **Resources** are

### Net-net scope reduction

The original doc scoped **3–5 days** including Resource port, Prompt port, scope catalog, caching, Cron, and tests. **Roughly half of that is already shipped.** Revised scope: **2–3 days** focused on radar Resources + Cron + scope catalog + server-side caching + BREAKING_CHANGES discipline. Detailed phasing at the bottom of this doc (§ Execution Roadmap).

---

## Context

BL-032 ships the remote substrate — Cloudflare Workers, Streamable HTTP transport, bearer-token auth, sliding-window rate limiting, and the radar Tools (`search_radar`, `get_latest_insights`). It deliberately scopes to **Tools only** to keep the auth + rate-limit + observability work contained.

This was DRAFTED in anticipation of a surface gap: a team member at a client site, on the Claude mobile app, or on a borrowed laptop having access to `generate_diligence_agenda` and `compute_techpar` over HTTP but not Library, Regulations, Radar Resources, or any of the eight `gst_*` consultant Prompts.

> **2026-05-13 correction**: the bulk of that gap **closed during BL-031.75 / BL-032 implementation work itself**. `createServer()` registers Library Resources, Regulation Resources, and all 8 Prompts on every transport — see the audit above. The only Resource family still stdio-only today is **Radar**, which depends on a Node-only snapshot reader. The original framing of "all orchestration value evaporates" overstates what's left; the real remaining gap is **Radar Resources + the Cron that populates them + scope/cache/BREAKING_CHANGES discipline**.

BL-032.5 closes that gap. Mechanically the work is straightforward — the same tool registry pattern (register-once, transport-twice) that BL-031 established lets Resources and Prompts ride the existing HTTP transport. The interesting design questions are not about the registry; they are about **how Resources and Prompts behave differently under HTTP**:

- **Resources need HTTP caching semantics** — ETag, Last-Modified, Cache-Control — that don't apply over stdio
- **Resources need scope gating** — some BL-033 pilot clients should not see radar; bearer keys need to carry that information from BL-032's day one, even if the scope-enforcement code is light
- **Prompts trigger downstream Tool calls** — a single `gst_target_quick_look` invocation chains four Tool calls; each call hits the per-key rate limit. A naïve port turns one slash-command into four near-simultaneous rate-limit checks
- **URI stability across the local→remote boundary** — `gst://library/vdr-structure` worked locally; it must work identically on `mcp.globalstrategic.tech` so a user's pinned conversation context survives the move

Validating these behaviors with **trusted internal users** before BL-033's external clients touch them is exactly the de-risking pattern BL-031 → BL-032 already follows.

---

## Why this earns its own initiative (rather than expanding BL-032)

BL-032 is already the largest single milestone in the chain — Workers deployment, auth, rate limiting, radar tools, Sentry wiring, `wrangler` config, CI changes for staging-vs-production deploys. Folding Resources + Prompts into it would push the milestone into multi-week territory and dilute the value-delivery cadence. Splitting buys three concrete things:

1. **BL-032 ships sooner.** Tools-over-HTTP is the longest-lead-time piece because everything else depends on the auth + rate-limit substrate. Getting that into trusted-internal hands fast is the whole point of Phase 2.
2. **BL-032.5 ships against measured baselines.** With BL-032 in production for a week or two, BL-032.5 can use real Tool-call latency / error data to inform Resource caching strategy and Prompt-orchestration limits, instead of guessing.
3. **The competency split mirrors BL-031.5 / BL-031.75.** Resources work is content-pipeline (cache headers, URI stability, scope metadata); Prompts work involves consultant-style review of how prompts behave under network conditions. Splitting lets each be sized and scheduled honestly.

---

## What changes in the move from stdio to HTTP

### Resources — the design questions HTTP forces

Local stdio reads a Resource by spawning the server, calling `resources/read`, and getting bytes back. There is no caching, no concurrency, no auth surface. HTTP changes all three.

> **2026-05-13 correction**: the original "Caching" row of the table below proposed HTTP-level cache headers (ETag, `If-None-Match → 304`). That doesn't fit MCP's transport — MCP Streamable HTTP is JSON-RPC over POST to a single `/mcp` endpoint, not REST. **The cache must live server-side inside the handlers**, keyed in Upstash, invisible to clients. Per-URI-family TTLs are below; the headers approach is dropped.

| Concern                | stdio (BL-031.5)                                  | HTTP (BL-032.5 — revised)                                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caching**            | None — each read goes through the handler         | **Server-side Upstash cache** keyed by URI hash; handler returns the cached body on hit, recomputes + writes on miss. Invisible to clients. Per-Resource TTLs (table below)                                                                                                                                         |
| **Concurrency**        | One client process                                | Many clients fetching the same Resource simultaneously; Worker isolate handles each request; the Upstash cache absorbs the duplicate compute                                                                                                                                                                        |
| **Auth**               | Process-level trust                               | Per-Resource scope check; bearer key carries scope metadata (`AuthSuccess.scopes`); server returns `403 Forbidden` for out-of-scope reads. For BL-032.5 every internal key gets the full scope set                                                                                                                  |
| **Resource-not-found** | "Snapshot missing, run `npm run radar:seed`"      | Radar-only: snapshot lives in Upstash, populated by a Worker Cron; missing → MCP error response with a structured `retry_after` hint                                                                                                                                                                                |
| **URI stability**      | Local files; unilateral rename = our problem only | URI is a remote contract; rename = breaking change. URI-manifest test already exists ([resource-uri-stability.test.ts](../../../mcp-server/tests/integration/resource-uri-stability.test.ts)); BL-032.5 adds a `BREAKING_CHANGES.md` file + a manifest-hash test that requires a version bump when the hash changes |

**Resource-specific cache strategies** (each Resource's freshness story is different — TTLs survived the design revision; the delivery mechanism is server-side, not HTTP headers):

| Resource                                         | Cache TTL (server-side)      | Rationale                                                                                 |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `gst://library/<slug>`                           | 24 h (`86400`s)              | Library articles change rarely; aggressive caching keeps Upstash command count low        |
| `gst://regulations/<j>/<id>`                     | 24 h (`86400`s)              | 120+ JSON files; updates are infrequent and atomic per-framework                          |
| `gst://radar/fyi/latest`, `gst://radar/wire/...` | 15 min (`900`s)              | Radar updates hourly via Worker Cron; 15 min cache balances freshness vs Inoreader budget |
| `gst://radar/item/<id>`                          | 24 h (effectively immutable) | Once published, individual radar items don't mutate                                       |

### Prompts — the design questions HTTP forces

Local stdio prompts resolve in-process: `prompts/get` returns the message body, the client model then calls Tools as the body instructs. Over HTTP, the same invocation pattern applies — `prompts/get` returns a body, the model calls Tools — but the Tool calls now hit a remote endpoint with a per-key rate limit.

| Concern                 | stdio (BL-031.75)                                                         | HTTP (BL-032.5)                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool fan-out**        | A prompt that orchestrates 4 Tools = 4 in-process calls; effectively free | 4 HTTP calls under one user's per-key limit; can hit the 60 req/min ceiling on a single prompt invocation if the user has been busy                                                          |
| **Latency aggregation** | Sub-millisecond                                                           | Cumulative — 4 Tools × ~200ms median = ~800ms before the model starts composing the answer                                                                                                   |
| **Auth scope**          | All-or-nothing                                                            | Some prompts need scopes the bearer key may not have (e.g. radar prompts for a key without `tool:radar:*`); prompt definition declares required scopes; `prompts/get` returns 403 if missing |
| **Prompt versioning**   | `version` field local-only                                                | `prompts/list` includes `version` so clients can detect drift after server upgrades; pinned conversations can warn the user                                                                  |

**Mitigations baked into BL-032.5** (revised 2026-05-13):

- ✅ Prompts that orchestrate multiple Tools document their Tool list in an `orchestrates: [...]` field — **already shipped** in BL-031.75 (see [`mcp-server/src/prompts/types.ts:27-36`](../../../mcp-server/src/prompts/types.ts)). The proposed `GET /prompts/<name>/scopes` REST introspection endpoint is dropped: there's no REST surface; instead, the standard MCP `prompts/list` call returns the `orchestrates` field as part of each prompt's metadata, which the client can read once and reason about
- 🟡 **No new burst allowance over the 60 req/min steady limit in BL-032.5.** The 4-tool fan-out from `gst_target_quick_look` has 15× margin under the current limit. Hold pending BL-032.75 Phase 2 telemetry; if fan-out hits the limit in real usage, revisit
- ✅ Sentry breadcrumbs (already wired in BL-032) capture every `prompts/get` invocation via the standard request log; the BL-032.75 instrumentation phase adds typed `prompt_invocation` metrics on top. No new metric primitive needed in BL-032.5

---

## Repo placement and lifecycle

Same answers as predecessors. The `mcp-server/` workspace already contains the local-stdio Resources and Prompts modules from BL-031.5 / BL-031.75. BL-032.5 binds the **same** modules to the HTTP entrypoint added in BL-032 — register-once, transport-twice continues. No new workspace, no new repo.

> **2026-05-13 verified**: the register-once-transport-twice pattern is fully in effect for Library + Regulation Resources and all 8 Prompts. Only Radar Resources sit outside it today (in [`mcp-server/src/tools/_local-only.ts`](../../../mcp-server/src/tools/_local-only.ts)) because their reader uses Node-only modules. BL-032.5 Phase 3 brings them into the same pattern.

The new lifecycle wrinkle introduced by HTTP is **breaking-change discipline for URIs and prompt names**. A locally-renamed file affects only the renaming consultant; a remote URI rename breaks every pinned conversation across every authenticated client. From BL-032.5 forward, URI and prompt-name changes must:

1. Land alongside a `version` bump in `mcp-server/package.json` (semver-as-contract)
2. Be cataloged in a `BREAKING_CHANGES.md` file at the workspace root, with a manifest hash that the URI / prompt-name stability tests compare against
3. ~~Be announced via a `notifications/message` push to all connected clients on first deploy~~ — **deferred to BL-033**. Streamable HTTP clients reconnect per-conversation; the manifest test + ledger are the load-bearing discipline; the runtime broadcast adds operational complexity for marginal benefit at internal-user scale

BL-033's external pilot will inherit this discipline; this initiative establishes it under low-stakes internal load.

---

## Implementation Plan (revised 2026-05-13)

### File layout — what's new vs. what's already there

```
mcp-server/
├── src/
│   ├── index.ts                    # (unchanged) stdio entrypoint
│   ├── server.ts                   # (unchanged) — already registers Library + Regulation Resources + all 8 Prompts
│   ├── worker.ts                   # (unchanged) — already calls createServer(env)
│   ├── tools/
│   │   └── _local-only.ts          # EDIT — remove registerRadarResources (move to transport-portable layer)
│   ├── resources/
│   │   ├── library.ts              # EDIT — wrap handler with cache lookup
│   │   ├── regulations.ts          # EDIT — wrap handler with cache lookup
│   │   └── radar.ts                # EDIT — swap node:fs snapshot reader for Upstash reader; register on Worker
│   ├── content/
│   │   ├── radar-snapshot.ts       # KEEP — stdio path still uses .cache/inoreader/ for offline dev
│   │   └── radar-snapshot-upstash.ts  # NEW — Worker-friendly reader pulling from mcp:radar:cache:*
│   ├── prompts/                    # (unchanged) — all 8 prompts already transport-portable
│   ├── auth/
│   │   ├── bearer.ts               # EDIT — AuthSuccess carries scopes: string[]
│   │   └── scopes.ts               # NEW — scope catalog + default scope set per key
│   ├── cache/                      # NEW
│   │   └── resource-cache.ts       # Upstash-backed; key = mcp:resource:<sha256(uri)>; per-URI-family TTL
│   └── cron/                       # NEW
│       └── radar-refresh.ts        # Worker Cron handler; calls fetchAllStreams + fetchAnnotatedItems; writes to Upstash
├── wrangler.toml                   # EDIT — add [triggers] crons = ["0 * * * *"]
├── BREAKING_CHANGES.md             # NEW — manual ledger of URI / prompt-name / argsSchema breaks; one section per release
└── tests/
    ├── integration/
    │   ├── resource-cache.test.ts            # NEW — verify hit/miss/TTL behavior in resource-cache.ts
    │   ├── resource-scope-gating.test.ts     # NEW — bearer key without resource:radar:read returns scope-error from radar Resources
    │   ├── radar-resources-worker.test.ts    # NEW — Worker reads radar Resources from Upstash via unstable_dev
    │   └── resource-uri-stability.test.ts    # EXTEND — assert manifest hash matches a checked-in BREAKING_CHANGES.md ledger
    └── unit/
        ├── cache/resource-cache.test.ts      # NEW — key hashing, TTL math, miss/hit branches
        └── cron/radar-refresh.test.ts        # NEW — verify the Cron handler shape + Inoreader-budget guard
```

### Critical cross-cutting decisions

1. **Server-side Resource cache (NOT HTTP headers)** — handler-level cache check, Upstash-backed. Key: `mcp:resource:<sha256(uri)>`. Value: `{ body, mimeType, populatedAt, ttlSeconds }`. On hit: handler returns the cached body unchanged (clients see identical content; no protocol-level cache signaling needed). On miss: handler computes, writes, returns. Library + Regulations: TTL 24 h. Radar: TTL 15 min (matches the snapshot freshness window).

2. **Periodic radar refresh via Worker Cron** — `[triggers] crons = ["0 * * * *"]` in `wrangler.toml`; handler at `src/cron/radar-refresh.ts` calls `fetchAllStreams` + `fetchAnnotatedItems` and writes to `mcp:radar:cache:wire` / `mcp:radar:cache:fyi`. **Budget guard**: handler short-circuits if `mcp:radar:circuit-open` is set (the existing circuit breaker at [`mcp-server/src/ratelimit/circuit-breaker.ts`](../../../mcp-server/src/ratelimit/circuit-breaker.ts)) or if cumulative Inoreader calls for the UTC day would exceed a configurable soft cap. ~24 calls/day at the hourly cadence; combined with website ISR (~28/day) and rate-limited Tool calls, stays well within the 200/day Inoreader budget. **BL-039 coordination**: this Cron is a **frequency-reduction** approach (snapshot is at most 60 min stale); BL-039 adds a **failure-mode-elimination** path (Worker can refresh tokens on-demand). They are complementary; BL-032.5 ships the Cron, BL-039 ships the on-demand refresh.

3. **Scope catalog** (forward-compatible with BL-033's OAuth scope semantics):

   | Scope                       | Grants                                                                                          |
   | --------------------------- | ----------------------------------------------------------------------------------------------- |
   | `tool:<name>`               | Call a specific Tool (e.g. `tool:generate_diligence_agenda`)                                    |
   | `tool:radar:*`              | All radar Tools (`search_radar`, `get_latest_insights`)                                         |
   | `resource:library:read`     | Read all `gst://library/*` Resources                                                            |
   | `resource:regulations:read` | Read all `gst://regulations/*` Resources                                                        |
   | `resource:radar:read`       | Read all `gst://radar/*` Resources                                                              |
   | `prompt:*`                  | Invoke any prompt (the prompt itself enforces its underlying Tool/Resource scopes at call time) |

   `mcp-server/src/auth/bearer.ts:28-32` extended: `AuthSuccess` returns `{ ok: true, keyOwner, scopes: string[] }`. For BL-032.5 the wrangler-secret-issued keys are configured with the full scope set by default (single shared key per team member; no per-key variation). The infrastructure (scope-carrying auth result + scope-check helper) is the BL-032.5 deliverable; per-key scope variation is BL-033.

4. **URI / prompt-name stability discipline** — extend [`mcp-server/tests/integration/resource-uri-stability.test.ts`](../../../mcp-server/tests/integration/resource-uri-stability.test.ts) to also assert a checked-in manifest hash matches the current registry. When the hash changes (URI added/removed/renamed), the test fails with a clear message: "Update BREAKING_CHANGES.md and bump the manifest hash." Same pattern applied to prompt names + `version` fields via a new `prompts-name-stability.test.ts`. The `notifications/message` push to connected clients on breaking changes (original doc line 97) is deferred — Streamable HTTP clients reconnect on every conversation; the discipline is what matters, not the runtime broadcast.

5. **Migration order matters**: the Resource cache must land BEFORE radar Resources move to the Worker. Without the cache, every radar Resource read hits Upstash directly for the snapshot (cheap, but not coalesced); with the cache, hot Resources serve from a smaller, faster keyspace. Phasing in § Execution Roadmap below.

### Verification (revised — MCP JSON-RPC, not REST)

The MCP Streamable HTTP transport is JSON-RPC over `POST /mcp`. Verification probes use either the `Invoke-McpRequest` / `Invoke-McpTool` PowerShell helpers at [`mcp-server/scripts/Invoke-McpRequest.ps1`](../../../mcp-server/scripts/Invoke-McpRequest.ps1) (preferred — handles the SSE response framing) or raw `curl -X POST $MCP_URL/mcp` with a JSON-RPC envelope. `MCP_URL` defaults to `https://mcp.globalstrategic.tech` (production) since the 2026-05-12 BL-032 deploy; substitute `mcp-staging.globalstrategic.tech` for the staging soak.

1. `cd mcp-server && npm run build && npm test` — 420+ tests green; new Resource-cache, scope-gating, and radar-Resources-on-Worker integration tests included.
2. From repo root: `npx astro check && npm run lint && npm run lint:css && npm run test:run` — still green.
3. `wrangler deploy --env staging` — Worker deploys; `wrangler tail` shows Cron registration for `radar-refresh` and the next-scheduled-at timestamp.
4. **Manifest list** — `Invoke-McpRequest -Method "resources/list"` returns the full URI manifest: Library × 2, Regulations × 120, Radar × 6 (FYI latest + Wire latest + 4 Wire categories). The `RADAR_URIS` constant in [`mcp-server/src/resources/radar.ts:122-126`](../../../mcp-server/src/resources/radar.ts) is the source of truth.
5. **Cache hit observed in logs** — read `gst://library/vdr-structure` twice in quick succession; second read shows `resource_cache_hit=true` in `wrangler tail` (the cache key is invisible to the client; the log line proves the handler short-circuited).
6. **Scope gating** — issue an MCP_KEY with the scope set explicitly missing `resource:radar:read` (via a wrangler-secret tagged with the reduced scope set), call `Invoke-McpRequest -Method "resources/read" -Params @{ uri = "gst://radar/fyi/latest" }`; expect a JSON-RPC error response with `code: -32602` (or whatever the SDK's standard scope-rejection code resolves to) and a clear message naming the missing scope.
7. **Prompt fan-out budget** — invoke `gst_target_quick_look` from Claude Desktop pointed at staging; confirm the four downstream Tool calls (`assess_infrastructure_cost_governance`, `compute_techpar`, `estimate_tech_debt_cost`, `search_regulations`) all land inside the 60 req/min sliding-window budget for that key starting from a fresh quota. No 429s.
8. **Cron repopulates a deleted snapshot** — delete the staging Upstash radar-snapshot key (`mcp:radar:cache:wire`), wait for the next Cron run, confirm it repopulates without manual intervention (`Invoke-McpRequest -Method "resources/read" -Params @{ uri = "gst://radar/wire/latest" }` returns fresh data with `populatedAt` after the deletion timestamp).
9. **Breaking-change discipline** — rename a Library URI in a local branch, run `npm test`; the `resource-uri-stability.test.ts` manifest-hash assertion fails with a message instructing the operator to update `BREAKING_CHANGES.md` and bump the hash. Reverting the rename makes the test pass again.
10. `wrangler deploy --env production` only after all nine steps pass on staging; then `BREAKING_CHANGES.md` reviewed for any churn since the last production deploy.

### Risks & mitigations

| Risk                                                                                       | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource cache stampede on first deploy (cold cache, simultaneous reads from many clients) | Two-layer: (a) the new server-side cache is the primary defense — first request fills it, subsequent reads serve from it; (b) for radar Resources specifically, the Upstash `mcp:radar:cache:*` snapshot keys are populated by the Cron, so a cache stampede degrades to "many handlers all reading the same Upstash key" — cheap. No `cf.cache` request-coalescing needed for BL-032.5's traffic levels; revisit if BL-033 client load demands it |
| Prompt fan-out exhausts a user's per-minute rate limit on first invocation of the day      | The heaviest prompt fan-out is `gst_target_quick_look` = 4 Tools. Current limit is 60 req/min steady at [`mcp-server/src/ratelimit/limiter.ts:71`](../../../mcp-server/src/ratelimit/limiter.ts) — 15× margin. **Held**: no burst allowance shipped in BL-032.5; revisit if BL-032.75 Phase 2 telemetry shows fan-out hitting the limit                                                                                                            |
| Radar Cron fails silently and snapshot goes stale                                          | Health endpoint adds `radarSnapshotAgeSeconds`; BL-032.75's alert rules then catch staleness exceeding 2× the Cron interval. Cron handler also emits `captureMessage('cron.radar-refresh.failed', ...)` on uncaught errors so Sentry surfaces them immediately                                                                                                                                                                                     |
| URI / prompt-name breakage during refactor                                                 | URI-manifest test extended with a checked-in hash; `BREAKING_CHANGES.md` required for any hash change; same pattern applied to prompt name + `version` field via a new `prompts-name-stability.test.ts`                                                                                                                                                                                                                                            |
| Inoreader budget exhaustion from Cron + rate-limited Tools combined                        | Cron handler short-circuits if `mcp:radar:circuit-open` is set (the existing breaker at [`mcp-server/src/ratelimit/circuit-breaker.ts`](../../../mcp-server/src/ratelimit/circuit-breaker.ts)). Daily soft cap added in BL-032.5 via a new `mcp:inoreader:day-counter:<YYYY-MM-DD>` key; when counter passes 180, Cron and live radar Tools serve cached-only until midnight UTC                                                                   |
| Bearer-key scope drift between BL-032.5 and BL-033                                         | Scope catalog ships as the single source of truth in [`mcp-server/src/auth/scopes.ts`](../../../mcp-server/src/auth/scopes.ts); BL-033 reuses the same scope strings, just delivered via OAuth tokens instead of static bearer keys                                                                                                                                                                                                                |
| **BL-039 coordination drift**                                                              | **NEW.** BL-032.5's Cron is _frequency-reduction_ (snapshot at most 60 min stale); BL-039 adds _failure-mode-elimination_ (Worker can refresh Inoreader tokens on-demand when they go stale mid-hour). BL-032.5 ships the Cron but **does NOT solve the stale-token-at-minute-59 case**. The Risks closure stanza explicitly defers that to BL-039; consumers needing real-time freshness wait for BL-039                                          |
| **MCP SDK error-code semantics for scope rejection**                                       | **NEW.** The SDK doesn't define a canonical "missing scope" error code. BL-032.5 picks a code (likely `-32002` or a custom number above the reserved JSON-RPC range) and documents it in `mcp-server/src/auth/scopes.ts`. The BL-033 OAuth flow will preserve the same error shape so external clients don't have to adapt twice                                                                                                                   |

### Out of scope (deferred to BL-033 or later)

- OAuth 2.1, dynamic client registration, token introspection — bearer keys remain through BL-032.5
- Per-client scope variation (different keys, different scope sets) — infrastructure is in place; the variation surface is a BL-033 product decision
- Compliance-grade audit logging (full request/response retention, R2 immutable storage, hash chains) — BL-032.5 logs metadata only, same as BL-032
- Customer-facing prompt customization (white-labeled `gst_*` prompts per client) — explicitly deferred to BL-033 or post-pilot
- Status-page integration for Resource freshness (radar snapshot age visible publicly) — observability initiative (BL-032.75)
- **`notifications/message` push to connected clients on breaking changes** — Streamable HTTP clients reconnect per-conversation; the discipline (BREAKING_CHANGES.md + manifest-hash test) is what matters. Runtime broadcast deferred to BL-033 or later
- **Prompt-aware burst allowance over the 60 req/min steady limit** — current ceiling has 15× margin for the 4-tool worst-case fan-out; hold pending BL-032.75 Phase 2 telemetry
- **On-demand Inoreader token refresh from the Worker** — this is BL-039's scope; BL-032.5 only covers the hourly proactive refresh

---

## Execution Roadmap (revised 2026-05-13)

The work breaks into **four sequential phases** + a verification cycle. Each phase is a self-contained commit (or small set of commits) that leaves the system in a deployable state. Phase order is deliberate: caching → scopes → radar Resources → Cron, so each phase builds on the last without retrofit.

### Phase 1 — Resource cache substrate (≈ 0.5 day)

**Goal**: introduce server-side caching as a wrapping layer that handlers can opt into. Library + Regulation handlers wrapped on day one; Radar handler wrapped in Phase 3.

**Deliverables**:

- [ ] `mcp-server/src/cache/resource-cache.ts` — Upstash-backed cache. Key: `mcp:resource:<sha256(uri)>`. Value: `{ body: string, mimeType: string, populatedAt: number, ttlSeconds: number }`. Functions: `cached<T>(env, uri, ttl, compute) → Promise<{ body, mimeType, cacheHit: boolean }>`.
- [ ] `mcp-server/tests/unit/cache/resource-cache.test.ts` — key-hashing determinism, TTL math, miss-then-hit sequence, malformed-cache-value recovery.
- [ ] Wire Library + Regulation handlers ([`resources/library.ts`](../../../mcp-server/src/resources/library.ts), [`resources/regulations.ts`](../../../mcp-server/src/resources/regulations.ts)) through the cache wrapper. Behavior under cache miss is identical to today; cache hits short-circuit body recomputation.
- [ ] `safeLog({ event: 'resource_cache_hit' | 'resource_cache_miss', uri, durationMs })` on every read so BL-032.75 Phase 2 telemetry sees the cache effectiveness without retro-instrumentation.

**Verification**: `npm test` green; manual `Invoke-McpRequest -Method "resources/read" -Params @{ uri = "gst://library/vdr-structure" }` twice in succession, observe a `resource_cache_hit` line in `wrangler tail` on the second call.

### Phase 2 — Scope catalog + auth-result extension (≈ 0.5 day)

**Goal**: enable per-Resource (and per-Tool/Prompt) scope checks. Every key gets the full scope set in BL-032.5; per-key variation is the BL-033 lever.

**Deliverables**:

- [ ] `mcp-server/src/auth/scopes.ts` (NEW) — exported `SCOPES` const enum, `DEFAULT_SCOPES` set (everything granted), and helpers `hasScope(authSuccess, scope)`, `assertScope(authSuccess, scope) → throws SCOPE_REJECTION error`.
- [ ] Extend `AuthSuccess` at [`mcp-server/src/auth/bearer.ts:28-32`](../../../mcp-server/src/auth/bearer.ts) with `scopes: readonly string[]`. The lookup loop assigns `DEFAULT_SCOPES` for any matched key (single-team internal use); per-key variation deferred to BL-033.
- [ ] Scope-rejection error shape — chooses a JSON-RPC error code (likely `-32002`), structured `data: { missingScope, ownedScopes }` so BL-033 OAuth clients can show a precise fix-up message.
- [ ] `mcp-server/tests/unit/auth/scopes.test.ts` + `mcp-server/tests/integration/scope-gating.test.ts` covering: default keys can access everything; a hand-crafted reduced-scope key gets a scope-rejection error from out-of-scope handlers; error shape matches the chosen code.

**Verification**: `npm test` green; manual reduced-scope test by setting `DEFAULT_SCOPES` to a subset in a local dev run and probing rejected handlers.

### Phase 3 — Radar Resources on the Worker (≈ 1 day)

**Goal**: move the only Resource family still stdio-only (`gst://radar/*`) to the transport-portable layer, swapping the Node-only snapshot reader for an Upstash-backed reader.

**Deliverables**:

- [ ] `mcp-server/src/content/radar-snapshot-upstash.ts` (NEW) — Worker-friendly reader. Reads `mcp:radar:cache:wire` and `mcp:radar:cache:fyi` via the existing Upstash client. Returns the same shape `radar-snapshot.ts` returns on the stdio path so handlers don't branch.
- [ ] `mcp-server/src/resources/radar.ts` — swap the `radar-snapshot.ts` import for a thin module that re-exports the right reader based on transport (or, simpler: pass `env` through and select inside). Wire the cache wrapper from Phase 1.
- [ ] `mcp-server/src/server.ts` — call `registerRadarResources(server, env)` from the transport-portable layer.
- [ ] `mcp-server/src/tools/_local-only.ts` — remove the `registerRadarResources` call (the stdio path still works via `createServer()`); strip the now-stale forward-path comment.
- [ ] `mcp-server/tests/integration/radar-resources-worker.test.ts` (NEW) — boots the Worker via `unstable_dev` with a known `mcp:radar:cache:fyi` payload, reads `gst://radar/fyi/latest`, asserts the body matches the payload.
- [ ] Apply scope-gate from Phase 2: radar Resources require `resource:radar:read`.

**Verification**: `npm test` green; staging deploy; manual `Invoke-McpRequest -Method "resources/read" -Params @{ uri = "gst://radar/fyi/latest" }` against staging Worker returns a populated body (the existing `mcp:radar:cache:fyi` populated by the website's ISR is sufficient until Phase 4's Cron is live).

### Phase 4 — Worker Cron for hourly radar refresh + BREAKING_CHANGES discipline (≈ 0.5 day)

**Goal**: take over the hourly radar refresh so MCP-only consumers aren't dependent on the website's ISR cadence. Lock in URI / prompt-name stability discipline.

**Deliverables**:

- [ ] `mcp-server/wrangler.toml` — add `[triggers] crons = ["0 * * * *"]` (hourly at :00).
- [ ] `mcp-server/src/cron/radar-refresh.ts` (NEW) — handler called by the scheduled handler. Calls `fetchAllStreams` + `fetchAnnotatedItems` from [`mcp-server/src/lib/inoreader-worker.ts`](../../../mcp-server/src/lib/inoreader-worker.ts), transforms, writes to `mcp:radar:cache:wire` / `mcp:radar:cache:fyi`. Budget guard: short-circuit if `mcp:radar:circuit-open` is set; record an entry in the new `mcp:inoreader:day-counter:<YYYY-MM-DD>` counter; bail to cached-only if counter >180.
- [ ] `mcp-server/src/worker.ts` — add `scheduled` export that delegates to `radar-refresh.ts`.
- [ ] `mcp-server/tests/unit/cron/radar-refresh.test.ts` — unit-tests budget-guard branches, error handling.
- [ ] `mcp-server/BREAKING_CHANGES.md` (NEW) — manifest hash + ledger of any URI / prompt-name / argsSchema changes per release.
- [ ] Extend `resource-uri-stability.test.ts` with a manifest-hash assertion against the value committed to `BREAKING_CHANGES.md`. Add a sibling `prompts-name-stability.test.ts` that does the equivalent for prompt names + `version` fields.
- [ ] `mcp-server/src/observability/health.ts` — extend the `/health` payload with `radarSnapshotAgeSeconds` (timestamp delta from `mcp:radar:cache:fyi.populatedAt`); BL-032.75 alert rules will consume this.
- [ ] `mcp-server/src/cron/radar-refresh.ts` emits `captureMessage('cron.radar-refresh.success' | 'cron.radar-refresh.failed', ...)` for Sentry observability.

**Verification**: `npm test` green; staging deploy; `wrangler tail` shows the next scheduled Cron invocation timestamp; let the next :00 fire, observe the `cron.radar-refresh.success` Sentry breadcrumb and a refreshed `populatedAt` on the radar Resources.

### Phase 5 — Soak + production deploy

Mirror the BL-032 soak structure. One internal team-week on staging (~7 days), watching for:

- Resource cache hit rate (BL-032.75 Phase 2 telemetry will surface; manual checks via `wrangler tail` in the meantime)
- Cron success rate on the hour
- Any radar Resource scope-gate rejections from internal probes
- Inoreader 200/day budget headroom (should stay well under 100/day combined)
- Any URI / prompt-name churn caught by the manifest tests

After the soak, follow the same `wrangler deploy --env production` cutover used by BL-032. No new domain or DNS changes; the routes are already production-live.

### Phase ordering rationale

| Phase | Why it goes here                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 → 2 | Cache substrate is purely additive; doesn't depend on scopes. Landing first means Phase 3's radar handler picks it up for free                                                                      |
| 2 → 3 | Scope-gate code must exist before radar Resources move to the Worker, otherwise the radar Resources would be world-readable on first deploy of Phase 3                                              |
| 3 → 4 | Radar Resources need a snapshot source. The existing website ISR populates `mcp:radar:cache:*` ~28×/day, which is sufficient for Phase 3 verification. Phase 4 adds the Worker's own hourly refresh |
| 4 → 5 | BREAKING_CHANGES + manifest tests land last in Phase 4 so they catch any churn introduced by Phases 1–3 before the production cut                                                                   |

### What this costs

- **Engineering**: ~2.5 days across Phases 1–4 (the original 3–5 day estimate is reduced because half the original scope is already shipped).
- **Soak**: 7 days passive (matches BL-032's cadence).
- **Calendar**: ~10 days from feature-mcp2 branch creation to production deploy, assuming the audit findings hold and no surprises during Phase 3.

---

_Last updated: 2026-05-13 — verification audit + revised implementation plan. Original draft 2026-04-25 retained inline with corrections; obsolete claims annotated rather than struck. Feature branch `feature-mcp2` opened 2026-05-13._
