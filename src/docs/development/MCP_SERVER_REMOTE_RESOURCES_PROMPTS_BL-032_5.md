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
> **Status**: Open. Depends on BL-031.5, BL-031.75, BL-032.

---

## Context

BL-032 ships the remote substrate — Cloudflare Workers, Streamable HTTP transport, bearer-token auth, sliding-window rate limiting, and the radar Tools (`search_radar`, `get_latest_insights`). It deliberately scopes to **Tools only** to keep the auth + rate-limit + observability work contained.

This leaves a real surface gap: a team member at a client site, on the Claude mobile app, or on a borrowed laptop has access to `generate_diligence_agenda` and `compute_techpar` over HTTP — but **not** the VDR Structure Guide, the regulatory frameworks, the radar snapshot Resources, or any of the eight `gst_*` consultant Prompts. All the orchestration value of BL-031.75 evaporates the moment the user leaves their dev machine.

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

Local stdio reads a Resource by spawning the server, calling `resources/read`, and getting bytes back. There is no caching, no concurrency, no auth surface. HTTP changes all three:

| Concern                | stdio (BL-031.5)                                  | HTTP (BL-032.5)                                                                                                                                          |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caching**            | None — each read goes through the handler         | HTTP cache headers (ETag, Last-Modified) so MCP clients with HTTP caching can avoid re-fetching unchanged Resources                                      |
| **Concurrency**        | One client process                                | Many clients fetching the same Resource simultaneously — Worker isolate handles each, but Upstash Redis cache layer becomes worthwhile for hot Resources |
| **Auth**               | Process-level trust                               | Per-Resource scope check; bearer key carries scope metadata; server returns `403 Forbidden` for out-of-scope reads                                       |
| **Resource-not-found** | "Snapshot missing, run `npm run radar:seed`"      | Snapshot lives in Upstash, populated by a periodic Worker Cron job; missing → `503 Service Unavailable` with a structured retry hint                     |
| **URI stability**      | Local files; unilateral rename = our problem only | URI is a remote contract; rename = breaking change; CI test asserts URI manifest is byte-stable across BL-032 and BL-032.5                               |

**Resource-specific cache strategies** (each Resource's freshness story is different):

| Resource                                         | Caching strategy                                                       | Rationale                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `gst://library/<slug>`                           | Strong: `Cache-Control: public, max-age=86400`, ETag = content hash    | Library articles change rarely; clients benefit from aggressive caching                          |
| `gst://regulations/<j>/<id>`                     | Strong: same as Library                                                | 120+ JSON files; updates are infrequent and atomic per-framework                                 |
| `gst://radar/fyi/latest`, `gst://radar/wire/...` | Weak: `Cache-Control: public, max-age=900` (15 min), `must-revalidate` | Radar updates ~hourly via a Worker Cron job; 15 min cache balances freshness vs Inoreader budget |
| `gst://radar/item/<id>`                          | Strong: 24h, immutable                                                 | Once published, individual radar items don't mutate                                              |

### Prompts — the design questions HTTP forces

Local stdio prompts resolve in-process: `prompts/get` returns the message body, the client model then calls Tools as the body instructs. Over HTTP, the same invocation pattern applies — `prompts/get` returns a body, the model calls Tools — but the Tool calls now hit a remote endpoint with a per-key rate limit.

| Concern                 | stdio (BL-031.75)                                                         | HTTP (BL-032.5)                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool fan-out**        | A prompt that orchestrates 4 Tools = 4 in-process calls; effectively free | 4 HTTP calls under one user's per-key limit; can hit the 60 req/min ceiling on a single prompt invocation if the user has been busy                                                          |
| **Latency aggregation** | Sub-millisecond                                                           | Cumulative — 4 Tools × ~200ms median = ~800ms before the model starts composing the answer                                                                                                   |
| **Auth scope**          | All-or-nothing                                                            | Some prompts need scopes the bearer key may not have (e.g. radar prompts for a key without `tool:radar:*`); prompt definition declares required scopes; `prompts/get` returns 403 if missing |
| **Prompt versioning**   | `version` field local-only                                                | `prompts/list` includes `version` so clients can detect drift after server upgrades; pinned conversations can warn the user                                                                  |

**Mitigations baked into BL-032.5**:

- Prompts that orchestrate multiple Tools document their Tool list in an `orchestrates: [...]` field (already established in BL-031.75); the Worker exposes a `GET /prompts/<name>/scopes` introspection endpoint so clients can pre-flight a prompt against their key's scope list
- Per-key rate-limit _bursts_ are tuned to accommodate a worst-case prompt fan-out (the heaviest prompt = `gst_target_quick_look` = 4 tools); the configured 60 req/min ceiling already covers this with margin, but a `prompt-aware-burst` allowance (described below) makes the design explicit
- A new aggregate metric `prompt_invocations_total` (one increment per `prompts/get`, regardless of downstream Tool fan-out) is logged so observability (BL-032.75) can distinguish prompt vs raw-tool usage

---

## Repo placement and lifecycle

Same answers as predecessors. The `mcp-server/` workspace already contains the local-stdio Resources and Prompts modules from BL-031.5 / BL-031.75. BL-032.5 binds the **same** modules to the HTTP entrypoint added in BL-032 — register-once, transport-twice continues. No new workspace, no new repo.

The new lifecycle wrinkle introduced by HTTP is **breaking-change discipline for URIs and prompt names**. A locally-renamed file affects only the renaming consultant; a remote URI rename breaks every pinned conversation across every authenticated client. From BL-032.5 forward, URI and prompt-name changes must:

1. Land alongside a `version` bump in `mcp-server/package.json` (semver-as-contract)
2. Be cataloged in a `BREAKING_CHANGES.md` file at the workspace root
3. Be announced via a `notifications/message` push to all connected clients on first deploy

BL-033's external pilot will inherit this discipline; this initiative establishes it under low-stakes internal load.

---

## Implementation Plan

### File layout (extends BL-032's `mcp-server/`)

```
mcp-server/
├── src/
│   ├── index.ts                    # (unchanged) stdio entrypoint
│   ├── worker.ts                   # +registerResources(server); +registerPrompts(server)
│   ├── tools/                      # (BL-031, BL-031.5 — unchanged)
│   ├── resources/                  # (BL-031.5 — body unchanged)
│   │   ├── library.ts
│   │   ├── regulations.ts
│   │   ├── radar.ts
│   │   └── _http-headers.ts        # NEW — Cache-Control, ETag, Last-Modified shared logic
│   ├── prompts/                    # (BL-031.75 — body unchanged)
│   ├── auth/                       # (BL-032 — extended)
│   │   ├── scopes.ts               # NEW — scope catalog (resource:library:read, etc.)
│   │   └── prompt-scopes.ts        # NEW — derive prompt scope requirements from orchestrates[]
│   ├── cache/                      # NEW — Upstash hot-Resource cache
│   │   └── resource-cache.ts
│   └── cron/                       # NEW — Worker Cron handler for periodic radar snapshot refresh
│       └── radar-refresh.ts
└── tests/
    ├── http-resources.test.ts      # NEW — cache headers, scope gating, 404/503 shapes
    ├── http-prompts.test.ts        # NEW — prompt fan-out under rate limits, scope checks
    ├── uri-stability.test.ts       # extend BL-031.5's URI manifest test to assert across stdio + HTTP
    └── breaking-changes.test.ts    # NEW — fails if URI/prompt-name changed without version bump
```

### Critical cross-cutting decisions

1. **Resource cache layer**: per-Resource freshness strategy table above; Upstash KV is the cache substrate (already provisioned in BL-032 for rate limiting). Cache key = `mcp-resource:<uri-hash>`; cache value = `{ body, etag, lastModified, expiresAt }`.

2. **Periodic radar refresh**: BL-031.5's "run `npm run radar:seed` locally" pattern doesn't translate. The Worker uses a Cloudflare Cron Trigger every hour to call `fetchAllStreams` + `fetchAnnotatedItems`, transform the response, and write the snapshot to Upstash. This consumes ~24 Inoreader calls/day from the 200/day budget — well within the share already documented in [RADAR.md](../hub/RADAR.md). The website's existing ISR (~28/day) plus this Cron (~24/day) plus per-key rate-limited radar Tool calls (capped at 50/key/day) still sit within the 200/day envelope.

3. **Scope catalog** (forward-compatible with BL-033's OAuth scope semantics):

| Scope                       | Grants                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `tool:<name>`               | Call a specific Tool (e.g. `tool:generate_diligence_agenda`)                                    |
| `tool:radar:*`              | All radar Tools (`search_radar`, `get_latest_insights`)                                         |
| `resource:library:read`     | Read all `gst://library/*` Resources                                                            |
| `resource:regulations:read` | Read all `gst://regulations/*` Resources                                                        |
| `resource:radar:read`       | Read all `gst://radar/*` Resources                                                              |
| `prompt:*`                  | Invoke any prompt (the prompt itself enforces its underlying Tool/Resource scopes at call time) |

For BL-032.5 (still internal, single shared bearer key per team member), the wrangler-secret-issued keys are configured with the full scope set by default. The infrastructure exists; the per-key scope variation is a BL-033 concern.

4. **URI stability test**: extend [`tests/resource-uri-stability.test.ts`](https://example.invalid/) (introduced in BL-031.5) so it runs against both the stdio in-process server AND the worker via `unstable_dev` from `wrangler`, asserting both transports return identical URI manifests.

### Verification

1. `cd mcp-server && npm run build && npm test` — green; HTTP-specific tests pass under `unstable_dev`.
2. From repo root: `npx astro check && npm run lint && npm run lint:css && npm run test:run` — still green.
3. `wrangler deploy --env staging` — Worker deploys; `wrangler tail` shows Cron registration for radar-refresh.
4. `curl -H "Authorization: Bearer <key>" https://mcp-staging.globalstrategic.tech/resources/list` returns the full URI manifest (Library × 2, Regulations × 120+, Radar × N).
5. `curl -H "Authorization: Bearer <key>" -H "If-None-Match: <etag>" .../resources/read?uri=gst://library/vdr-structure` returns `304 Not Modified` on the second call within the cache window.
6. Issue a key with a scope set missing `resource:radar:read`, attempt to read `gst://radar/fyi/latest` — expect `403 Forbidden` with structured error.
7. Invoke `prompts/get` for `gst_target_quick_look` from Claude Desktop pointed at staging; confirm the four downstream Tool calls land within the per-key rate-limit budget and the model produces a single coherent brief.
8. Delete the staging Upstash radar-snapshot key, wait for the next Cron run, confirm it repopulates without manual intervention.
9. `wrangler deploy --env production` only after all eight steps pass on staging; then `BREAKING_CHANGES.md` reviewed for any URI/prompt-name churn.

### Risks & mitigations

| Risk                                                                                       | Mitigation                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource cache stampede on first deploy (cold cache, simultaneous reads from many clients) | Use Cloudflare's request coalescing (`cf.cache`) on Resource fetches; per-Resource lock in Upstash for cache fill                                                             |
| Prompt fan-out exhausts a user's per-minute rate limit on first invocation of the day      | Per-key burst allowance of 10 over the steady 60 req/min limit; documented in client-facing error messages so users see a clear "wait 30 seconds" instead of a generic 429    |
| Radar Cron fails silently and snapshot goes stale                                          | Health endpoint includes `radarSnapshotAgeSeconds`; observability initiative (BL-032.75) alerts when this exceeds 2× the Cron interval                                        |
| URI breakage during refactor                                                               | URI-manifest test in CI; `BREAKING_CHANGES.md` required; semver `version` bump enforced by a separate test that compares manifest hashes between commits                      |
| Inoreader budget exhaustion from Cron + rate-limited Tools combined                        | Hard daily cap tracked in Upstash counter (`inoreader-day-budget:<date>`); when counter passes 180, both Cron and radar Tools serve cached-only until midnight UTC            |
| Bearer-key scope drift between BL-032.5 and BL-033                                         | Scope catalog is the single source of truth from this initiative forward; BL-033 reuses the same scope strings, just delivered via OAuth tokens instead of static bearer keys |

### Out of scope (deferred to BL-033 or later)

- OAuth 2.1, dynamic client registration, token introspection — bearer keys remain through BL-032.5
- Per-client scope variation (different keys, different scope sets) — infrastructure is in place; the variation surface is a BL-033 product decision
- Compliance-grade audit logging (full request/response retention, R2 immutable storage, hash chains) — BL-032.5 logs metadata only, same as BL-032
- Customer-facing prompt customization (white-labeled `gst_*` prompts per client) — explicitly deferred to BL-033 or post-pilot
- Status-page integration for Resource freshness (radar snapshot age visible publicly) — observability initiative (BL-032.75)

---

_Last updated: 2026-04-25_
