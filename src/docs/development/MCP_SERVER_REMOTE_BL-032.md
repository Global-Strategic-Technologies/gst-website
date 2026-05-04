# MCP Server — Internal Remote / Phase 2 (BL-032)

> **Backlog initiative**: [BL-032: MCP Server — Internal Remote (Phase 2)](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2)
>
> **Predecessors** (read these first for shared assumptions; this doc does not re-derive them):
>
> - [MCP_SERVER_ARCHITECTURE_BL-031.md](MCP_SERVER_ARCHITECTURE_BL-031.md) — overall MCP architecture, repo placement, lifecycle, transports table, SDK v2 split-package note
> - [MCP_SERVER_HUB_SURFACE_BL-031_5.md](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — full local-stdio Tool + Resource surface (9 Tools, 3 Resource families, 128 Resources)
> - [MCP_SERVER_PROMPTS_BL-031_75.md](MCP_SERVER_PROMPTS_BL-031_75.md) — 8 `gst_*` Prompts that orchestrate the surface above
> - [MCP_SERVER_HUB_URL_STATE_BL-031_95.md](MCP_SERVER_HUB_URL_STATE_BL-031_95.md) — closes the deep-link loop and (Phase 3) refactors `search_radar_cache` to a single-`category` capability-mirror — directly relevant to the `search_radar` design questions below
>
> **Sequels** (this doc deliberately does not absorb their work):
>
> - [MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) — ports Resources + Prompts to the HTTP transport stood up here
> - [MCP_SERVER_OBSERVABILITY_BL-032_75.md](MCP_SERVER_OBSERVABILITY_BL-032_75.md) — production observability maturity (SLOs, dashboards, burn-rate alerts) on top of the substrate stood up here
> - [BL-033 in BACKLOG.md](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) — external pilot (OAuth 2.1, audit logging, public listings)
>
> **Scope of this doc**: stand up the **Tools-over-HTTP** substrate — Cloudflare Worker deployment, Streamable HTTP transport, bearer-token auth, Upstash-backed sliding-window rate limiting, the two new live-radar Tools (`search_radar`, `get_latest_insights`), Sentry + structured logging + `/health`, staging-then-production deploy. Resources, Prompts, OAuth, audit logging, observability dashboards are **explicitly out of scope** and have their own initiatives.
>
> **Status**: Open. Depends on BL-031. (BL-031.5 / .75 / .85 / .87 / .95 are not strict dependencies — their surface area gets ported to HTTP under BL-032.5 — but BL-032 ships into a workspace where they exist, which simplifies the register-once-transport-twice symmetry.)

---

## Context

BL-031 through BL-031.95 ship a **complete, polished local-stdio surface**: 9 Tools wrapping every Hub engine, 128 Resources spanning Library + Regulations + Radar snapshots, 8 senior-consultant-reviewed `gst_*` Prompts, and uniform Open-in-Hub deep-links across the prompt-driven analytical workflow. As of [closure of BL-031.95 on 2026-05-02](BACKLOG.md#bl-03195-hub-tools--url-state-restoration--mcp-deep-link-surface), every conversational motion a GST consultant runs through Claude Desktop on a dev machine reaches its own destination — wizard state restored byte-for-byte, deliverable assembled in-thread.

The constraint that remains is **physical**. The whole surface is a Node binary launched as a child process from a config file pointing at `/abs/path/to/mcp-server/dist/index.js`. Take that machine away — borrowed laptop at a client site, mobile Claude during travel, a CI agent enriching a PR description, a Slack bot composing a daily digest — and every motion above evaporates. The internal team is small enough that this isn't a daily blocker yet, but it is precisely the constraint that prevents BL-031.x's productivity gains from compounding outside the office hours of the team members who keep their dev environment ready to go.

BL-032 is the substrate that removes the constraint. It deliberately scopes to **Tools only** — including the two new live-radar Tools that the local snapshot tool was always a placeholder for — and leaves Resources / Prompts / observability dashboards / OAuth for the dedicated initiatives that follow. The design intent: ship the auth + rate-limit + Inoreader-budget-protection layers fast, exercise them with trusted internal users for a week or two, then layer the rest of the surface on top against measured production baselines rather than guesses.

This document covers the architectural decisions BL-032 forces, the **open design questions surfaced during planning** (call-out section below — these are the unknown unknowns the doc is meant to expose), and the per-phase implementation plan that becomes the source of truth for the work.

---

## Why this earns its own initiative (rather than folding into adjacent work)

- **Not BL-031** because BL-031 is "wrap two pure functions, prove the path" — adding remote transport, auth, rate limiting, Workers deploy, secrets management would have inflated the prototype into a multi-week effort that's hard to validate and review. BL-031's stdio path was deliberately the smallest possible step.
- **Not BL-032.5** because BL-032.5 is content-pipeline + caching headers + URI stability discipline — competencies orthogonal to "stand up an authenticated remote endpoint." Folding them would push BL-032 into multi-week territory and dilute the trusted-internal-user feedback loop.
- **Not BL-032.75** because observability dashboards and burn-rate alerts need 10-14 days of measured production baselines to design against — exactly what BL-032's first week in production produces. Pre-designing dashboards against guessed baselines is the anti-pattern.
- **Not BL-033** because BL-033 introduces OAuth 2.1, dynamic client registration, compliance-grade audit logging, prompt-injection sanitization, and external-client legal paper — every one of which deserves its own design pass once the auth + rate-limit + observability substrate is battle-tested by trusted internal users.

The split is the same de-risking pattern BL-031 → BL-031.5/.75 → BL-031.85/.87/.95 already follows: ship the substrate fast against trusted users; let dependent surfaces measure against it before committing.

---

## What changes in the move from local-stdio to remote HTTP

This section catalogs every dimension where stdio assumptions break under HTTP. Each row is a design surface that the implementation plan below addresses.

| Dimension                       | stdio (BL-031.x)                                                                  | HTTP (BL-032)                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Trust model**                 | Process-level — the user already chose to put the binary on their own machine     | Per-request bearer token; missing/wrong key → `401 Unauthorized` with `WWW-Authenticate`; key prefix logged for attribution                                                                                                                |
| **Concurrency**                 | One client process; no concurrent reads                                           | Many clients; many simultaneous Tool invocations; shared Inoreader budget makes per-key rate limits load-bearing                                                                                                                           |
| **Discovery**                   | Static config file naming `node ./dist/index.js`                                  | Streamable HTTP endpoint URL + `Authorization: Bearer <key>` header in client config                                                                                                                                                       |
| **Logging**                     | `console.error` to stderr surfaced in client UI                                   | Structured JSON to Cloudflare's `tail` stream + Sentry; `console.log` is fine again because there is no stdio protocol on the wire; **but** Authorization + Cookie headers must be stripped from any header dump (lint rule enforces this) |
| **Inoreader access**            | Snapshot-only via `npm run radar:seed` (BL-031.5 invariant); never live API calls | Live API calls allowed but **rate-limited per-key** (50/day for radar Tools) and **circuit-broken globally** (any 429 from Inoreader collapses radar Tools to cached-only for 6h)                                                          |
| **Token + cache backing store** | `astro:env/server` for secrets; `.cache/inoreader/` for ISR cache                 | Wrangler-bound env vars for secrets; **Upstash Redis** for both token persistence (already proven by the website ISR) and ISR cache; no filesystem                                                                                         |
| **Failure surface**             | Crash visible to the one user who launched the binary                             | Worker isolate failure reaches **all** users; health endpoint + Sentry are how we find out                                                                                                                                                 |
| **Schema drift**                | One entrypoint, one registry — drift is impossible                                | Two entrypoints (stdio retained for the website's CI tests + dev ergonomics; HTTP for production); CI test asserts both expose the same Tool names + input schemas                                                                         |
| **Deployment cadence**          | `npm run build` — change goes live the next time the user launches Claude Desktop | `wrangler deploy --env production` — change goes live to all users at once; staging environment + curl-based smoke tests gate this                                                                                                         |
| **Cost surface**                | Zero — runs on the user's own machine                                             | Workers free tier (100k req/day) + Upstash free tier (10k commands/day); ~$0/month at prototype volume; ~$10/month at scale                                                                                                                |

Three of the rows above represent **fundamentally new code surface**, not just configuration: the Inoreader-client Workers refactor, the rate limiter, and the schema-drift CI guardrail. The implementation plan addresses each as a discrete phase.

---

## Open design questions (unknown unknowns surfaced during planning)

This is the section the doc exists for. Each item is something the BACKLOG criteria touch but do not fully resolve. Each carries a recommendation; each recommendation is open to revision once Phase 1 (workspace prep) gets eyes on the actual SDK + Workers behavior. **These are the items most likely to mutate the implementation plan after first contact.**

### Q1. Streamable HTTP transport — which SDK package, exactly?

[BACKLOG.md BL-032 § Transport](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) says "Worker built with `wrangler` and `@modelcontextprotocol/server` (v2 split-package family)". [MCP_SERVER_ARCHITECTURE_BL-031.md § Critical SDK note](MCP_SERVER_ARCHITECTURE_BL-031.md#critical-sdk-note) names `@modelcontextprotocol/hono` as the HTTP adapter for v2. The current `mcp-server/package.json` has `@modelcontextprotocol/server@^2.0.0-alpha.2` only — no HTTP package installed.

**Open**: which v2 package shape do we actually depend on for Streamable HTTP on Workers? Options:

| Option                                                                             | Plausibility                                                                                           | Implication                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@modelcontextprotocol/hono` running inside the Worker via Hono's Workers adapter  | Medium-high — Hono has first-class Workers support, and BL-031's doc explicitly named this package     | Add `hono` + `@modelcontextprotocol/hono`; Worker fetch handler delegates to a Hono `app.fetch(request, env, ctx)` that the SDK adapter wires up |
| Direct Streamable HTTP support exposed by `@modelcontextprotocol/server` (no Hono) | Low-medium — the v2 server package's stdio transport is in scope, but HTTP may be in a sibling package | Avoid the Hono dependency; one fewer moving part                                                                                                 |
| Custom `fetch`-handler shim that speaks the MCP HTTP framing directly              | Low — only if the official packages don't yet target Workers                                           | Significant work; only if the SDK story has gaps on Workers                                                                                      |

**Recommendation**: open Phase 1 with a 1-2 hour spike that installs the candidate packages, scaffolds a hello-world Worker that registers a single trivial tool, and verifies `unstable_dev` from `wrangler` can drive it via the MCP client SDK. Pick the option that produces the smallest dependency surface that works. **Phase 1 commit message documents the choice and the reason.** This doc gets a "Resolved Phase 1" stanza appended once decided. Until then, treat the file layout below as parameterized by this choice.

### Q2. `search_radar` vs. `search_radar_cache` — coexistence, replacement, or capability-mirror revisited?

This is the single highest-friction unknown. BL-031.95 Phase 3.A deliberately stripped `search_radar_cache`'s input down to `{ category? }` under the **capability-mirror invariant**: the cache tool exposes exactly what the website's `/hub/radar` page exposes — a single category filter, FYI+Wire merged, sorted newest-first. BL-032's BACKLOG spec adds:

```
search_radar { query?, category?, tier?, since?, limit? }
```

Re-introducing `query` / `tier` / `since` / `limit` for the live tool — exactly the surface that BL-031.95 just retired from the snapshot tool. This is not a contradiction by accident; the live tool can answer questions the snapshot can't (full-text search across the **annotation corpus**, time-windowed slices, tier filtering). But it does mean the user-facing surface bifurcates in a way that risks confusion: `search_radar` (rich) vs. `search_radar_cache` (mirror).

**Three plausible resolutions**:

| Option                                                                                                                                                                  | Pros                                                                                                                          | Cons                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Coexist as written** — `search_radar` (live, rich) + `search_radar_cache` (snapshot, mirror)                                                                       | Each tool serves a clear use case; the snapshot tool stays useful for offline/dev work and CI                                 | Two tools that look similar — agents may pick the wrong one; doc burden multiplies                                                                                                                                                                         |
| **B. Rename `search_radar_cache` → `search_radar_offline`; keep `search_radar` as the canonical name**                                                                  | Surfaces the offline/online split explicitly in the name                                                                      | Rename is a breaking change for any pinned-conversation context that already references the BL-031.5 name; eight prompts in BL-031.75 may reference it (need to grep and confirm — likely none, since the snapshot tool is rarely model-called in prompts) |
| **C. Promote `search_radar_cache` to `search_radar`; the BL-032 live tool re-uses the name and falls back to cache when budget is exhausted; drop the `_cache` suffix** | Single tool name across local + remote; the cache fallback semantics match the website's ISR pattern users already understand | The live tool's input schema is broader than the cache's; under fallback the broader inputs may not be answerable from the cache, so the tool would have to gracefully degrade with a clear error. More state machine, less pure                           |

**Recommendation**: **Option B** with a backward-compat alias for one release. Rename `search_radar_cache` → `search_radar_offline`; ship `search_radar` (live) under BL-032 with the rich BACKLOG schema; have `search_radar_cache` as a deprecated alias that tail-calls `search_radar_offline` and emits a deprecation warning in stderr/Sentry; remove the alias in the next minor version. This:

- Honors the [BL-031.95 capability-mirror invariant](MCP_SERVER_HUB_URL_STATE_BL-031_95.md) for the offline path
- Gives `search_radar` the canonical name it deserves under live conditions
- Doesn't surprise any pinned-context agent for a release window
- Avoids the state-machine complexity of Option C

**Discipline**: the rename is recorded in `mcp-server/BREAKING_CHANGES.md` (introduced in BL-032.5 — promote its introduction here if BL-032.5's timing slips); the alias is removed in `mcp-server@0.2.0`. **Confirm-with-user** before committing to a rename — per [feedback_no_unfounded_risk_claims.md](C:\Users\thefa.claude\projects\c--Code-gst-website\memory\feedback_no_unfounded_risk_claims.md), don't assume external breakage. If no client outside this repo references `search_radar_cache` by name (likely true — internal use only), the breaking-change calculus changes and the alias may be unnecessary.

### Q3. `get_latest_insights` — Tool, or just a thin wrapper over the FYI Resource?

[BACKLOG.md](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) defines `get_latest_insights` as a Tool returning the N most-recent FYI items. BL-031.5 already publishes `gst://radar/fyi/latest` — the same content as a Resource. Under BL-032.5, that Resource will be reachable over HTTP with cache headers. Why duplicate the surface?

**The argument for keeping it as a Tool**: agents in some clients (notably the Claude API directly, and some MCP clients) discover Tools more reliably than Resources. The Tool gives the model an unambiguous "how to fetch the latest insights" path that isn't gated by the client's Resource UX. The website's RadarFeed.astro renders the same shape; downstream consumers may want a Tool that "just works" without negotiating the Resource layer.

**The argument against**: schema duplication. Drift risk. Two surfaces saying the same thing.

**Recommendation**: keep `get_latest_insights` as a Tool per the spec, but implement it as a **delegated fetch through the same content adapter the FYI Resource uses** (`mcp-server/src/content/radar-snapshot.ts` already has `readFyiSnapshot`). The Tool wraps the adapter; the Resource (under BL-032.5) wraps the same adapter. One source of truth. Schema reuse via Zod composition — the Tool's output type embeds the same FYI item shape the Resource serializes.

### Q4. Inoreader client refactor — fork, or generalize?

`src/lib/inoreader/client.ts` uses `astro:env/server` (Astro-only) and `src/lib/inoreader/cache.ts` uses the filesystem. Neither works on Workers. Two paths:

| Option                                                                                                                                                                                                                                                                                                                       | Pros                                                           | Cons                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Generalize the existing client** — replace `astro:env/server` reads with a `configOverride` injection point (already partially supported per BL-031.5 § Code reuse); replace filesystem cache with an injected `CacheStore` interface; have the Astro side and the Worker side each instantiate the appropriate adapter | Single source of truth; future bug fixes flow to both surfaces | More refactor surface; risk of regressing the website's ISR; needs a careful test pass to confirm parity                                    |
| **B. Fork a Worker-specific client** under `mcp-server/src/lib/inoreader/` that mirrors the current shape                                                                                                                                                                                                                    | Isolated change; zero website risk                             | Two clients to maintain; drift risk over time; same anti-pattern that BL-031.5 explicitly rejects (Option C in its content-source decision) |

**Recommendation**: **Option A**, but staged. Phase 4 of the implementation plan introduces:

1. A `CacheStore` interface (`get(key)` / `set(key, value, ttlSec)`) implemented twice: Astro-side `FilesystemCacheStore` and Worker-side `UpstashCacheStore`
2. A `SecretSource` interface (`getInoreaderTokens()` / `getRedisCredentials()`) with the same dual implementation
3. The `client.ts` `configOverride` parameter accepts both interfaces; the existing Astro callers wrap up the FS + `astro:env/server` adapters; the Worker callers wrap up the Upstash + Wrangler-env adapters
4. A Vitest integration test exercises the client through both adapter sets to confirm parity

This is real refactor surface — flagging it as such is the doc's job. If Phase 4 reveals that the refactor is larger than 1 day of work, the implementation plan documents the actual cost in a closure stanza.

### Q5. CORS allowlist precision — which exact origins?

[BACKLOG.md](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) says "CORS headers restricted to known MCP client origins (`claude.ai`, `chatgpt.com`, `cursor.sh`, etc.) — no `Access-Control-Allow-Origin: *`". This is correct in spirit but the actual origin strings differ per client and per platform (desktop vs web vs mobile). Wrong-allowlist symptoms are silent in the network tab — the user just sees "tool didn't appear in the picker."

**Open**: ground-truth list of MCP client origins as of 2026-05.

**Recommendation**: Phase 1 spike includes a 30-minute audit — load each candidate client (Claude Desktop, Claude.ai web, Claude Code, Cursor, ChatGPT) against a Worker that echoes the Origin header back; record the actual values; commit them as the seed allowlist. The list lives in `mcp-server/src/auth/cors.ts` with a comment block citing the audit date and methodology. Reviewed quarterly per the BACKLOG criteria.

### Q6. Sentry on Cloudflare Workers — `@sentry/cloudflare` or `@sentry/node`?

The website uses `@sentry/node` ([src/docs/development/SENTRY_MANUAL_SETUP.md](./SENTRY_MANUAL_SETUP.md)). Workers are a different runtime; Sentry publishes a dedicated `@sentry/cloudflare` SDK with proper integration with the Workers `fetch` handler lifecycle.

**Recommendation**: use `@sentry/cloudflare`. Reuse the existing Sentry project (DSN); tag Worker errors with `service:mcp-server` so dashboards can split website vs MCP. Phase 5 of the plan adds the integration; the SENTRY_MANUAL_SETUP.md gets a "MCP Worker section" appended.

### Q7. Rate-limiter — custom or `@upstash/ratelimit`?

BACKLOG specifies "sliding-window rate limiter backed by Upstash Redis". `@upstash/ratelimit` exists, supports sliding window, batches reads/writes via Redis pipelines (≤2 commands per check — exactly what the BACKLOG risk-mitigation calls for), emits the `RateLimit-*` headers natively.

**Recommendation**: use `@upstash/ratelimit`. Reach for custom only if the library lacks the per-tool tier semantics (e.g. the radar-specific 5/min ceiling). The library's `MultiRegionRatelimit` is overkill for our region count; `Ratelimit` with `slidingWindow` is the right primitive.

### Q8. Health endpoint Inoreader liveness — how do we check without burning budget?

`GET /health` returns `{ inoreader: 'ok' | 'degraded' }`. A naive implementation would call Inoreader on every health check — and health endpoints get hammered by uptime monitors. Burning the 200/day budget on liveness checks is the exact failure mode this initiative is designed to prevent.

**Recommendation**: the `inoreader` field reflects the **last observed** Inoreader response status, persisted in Upstash with a 5-minute TTL. The radar Tools' real Inoreader calls update the timestamp on success; failures (429, 5xx) update it to `degraded` with the error code. The health endpoint is a cheap Redis read. Cron-driven Inoreader-snapshot refresh (BL-032.5's surface) will make this even more accurate — until then, the field reads "stale" between Tool calls, which is fine.

### Q9. Schema-drift CI — how does the test see both registries?

BACKLOG calls for "CI test asserts both entrypoints export the same tool names + input schemas." Because the current `createServer()` factory (`mcp-server/src/server.ts`) is a single function called by both entrypoints, the test can:

1. Call `createServer()` once
2. Introspect the resulting server's registered tool list (the v2 SDK exposes this on the server instance)
3. Snapshot the result to a JSON file
4. Fail when the snapshot drifts without a `BREAKING_CHANGES.md` entry

The test does **not** need to import `worker.ts` separately. The "register-once-transport-twice" pattern is exactly the architectural property that lets the test be cheap. **Recommendation**: add `tests/integration/registry-snapshot.test.ts` in Phase 6 alongside the staging deploy verification.

### Q10. DNS provisioning — `mcp.globalstrategic.tech` — out of band?

The BACKLOG names `mcp.globalstrategic.tech` as the production subdomain. This requires:

1. A DNS record in Cloudflare's zone for `globalstrategic.tech` (the current site is on Vercel; the zone may or may not be on Cloudflare DNS — confirm)
2. A Cloudflare Workers route binding pointing at the Worker
3. SSL cert provisioning (automatic if the zone is on Cloudflare)
4. Optional: staging at `mcp-staging.globalstrategic.tech`

**Recommendation**: Phase 6 (deploy) includes the DNS change; if the zone is **not** on Cloudflare DNS, this becomes a 30-minute Vercel-DNS → Cloudflare-Workers-route configuration step. **Confirm-with-user** before changing zone records — this is shared infrastructure with the website per [feedback_no_unfounded_risk_claims.md](C:\Users\thefa.claude\projects\c--Code-gst-website\memory\feedback_no_unfounded_risk_claims.md).

### Q11. Token rotation cadence + runbook

BACKLOG mentions weekly rotation via CI cron, leveraging Claude Desktop's env-var substitution. This is a good aspiration but adds operational surface. **Recommendation**: ship BL-032 with **manual** rotation documented in the README (one `wrangler secret put` per team member, on demand or on suspected compromise). Automated rotation is a BL-032.75 / BL-033 concern and gets its own design pass once the secrets surface is in production. Don't pre-build automation for a 5-person team that doesn't yet have a rotation policy.

---

## Repo placement and lifecycle

Same answers as predecessors. The `mcp-server/` workspace gets a second entrypoint (`src/worker.ts`) alongside `src/index.ts`; both call the existing `createServer()` factory in `src/server.ts`; `wrangler.toml` joins the workspace root. No new repo. No new package publish surface.

The new lifecycle wrinkle introduced by remote deployment is **deploy-as-event**. A stdio change goes live the next time the user launches Claude Desktop; a Worker change goes live to **all** users at once. This is what the staging environment + curl smoke tests + Phase 6's seven-step verification gate exists to address. Mistakes are bounded — `wrangler rollback` reverts to the previous deployment in seconds — but the cost of a bad deploy is no longer "one user notices in their next session."

`mcp-server/package.json` does **not** get published to npm under BL-032. The `private: true` flag stays. The remote endpoint is the only distribution mechanism; the package itself remains internal.

---

## Implementation Plan

### File layout (extends BL-031.x's `mcp-server/`)

```
mcp-server/
├── src/
│   ├── index.ts                       # (BL-031, unchanged) stdio entrypoint
│   ├── server.ts                      # (existing) createServer() factory — single source of truth
│   ├── worker.ts                      # NEW — Worker fetch handler; auth → rate-limit → MCP HTTP transport
│   ├── tools/                         # (BL-031.x — unchanged, EXCEPT:)
│   │   ├── radar-cache.ts             # RENAMED to radar-offline.ts (Q2 resolution); deprecation alias retained
│   │   └── radar-live.ts              # NEW — search_radar + get_latest_insights, both wrap Inoreader client
│   ├── transport/                     # NEW — Worker-side transport plumbing
│   │   └── http.ts                    # Streamable HTTP transport adapter (per Q1 resolution)
│   ├── auth/                          # NEW — bearer-token + CORS
│   │   ├── bearer.ts                  # Authorization header parsing; key prefix extraction; structured 401
│   │   ├── cors.ts                    # Origin allowlist (Q5); preflight handling
│   │   └── safe-logger.ts             # Request-scoped logger that strips Authorization + Cookie
│   ├── ratelimit/                     # NEW — Upstash sliding window
│   │   ├── limiter.ts                 # @upstash/ratelimit instances (per-key per-min, per-key per-day, radar-tighter)
│   │   ├── circuit-breaker.ts         # Inoreader 429 → 6h global radar cache-only mode
│   │   └── headers.ts                 # RFC 9331 RateLimit-* response header builder
│   ├── lib/                           # NEW — Worker-compatible adapters of website utilities
│   │   ├── inoreader-worker.ts        # Wraps src/lib/inoreader/client.ts via configOverride (Q4 Option A)
│   │   └── upstash-cache-store.ts     # CacheStore interface impl backed by @upstash/redis
│   ├── observability/                 # NEW — structured logs + Sentry + health
│   │   ├── logger.ts                  # JSON-line emitter with key-prefix attribution
│   │   ├── sentry.ts                  # @sentry/cloudflare init (Q6); per-request scope
│   │   └── health.ts                  # GET /health handler; cached Inoreader-status read (Q8)
│   └── config-worker.ts               # NEW — Worker-bound env shape (typed); HUB_BASE override
├── tests/
│   ├── integration/
│   │   ├── worker-roundtrip.test.ts   # NEW — unstable_dev from wrangler; full HTTP MCP roundtrip
│   │   ├── auth.test.ts               # NEW — happy / missing / wrong-key / wrong-prefix-format
│   │   ├── ratelimit.test.ts          # NEW — sliding-window enforcement; per-tool tiers; circuit breaker
│   │   ├── radar-live.test.ts         # NEW — search_radar + get_latest_insights with mocked Inoreader
│   │   ├── registry-snapshot.test.ts  # NEW — Q9 schema-drift guardrail
│   │   └── cors.test.ts               # NEW — preflight + actual response Origin enforcement
│   └── helpers/
│       ├── mock-upstash.ts            # NEW — in-memory shim for @upstash/redis in tests
│       └── mock-inoreader.ts          # NEW — fixture-backed Inoreader responses (reuse tests/e2e/fixtures/radar-mock-data.ts where possible)
├── wrangler.toml                      # NEW — staging + production envs; Upstash + Inoreader bindings
├── package.json                       # +deps: hono?, @upstash/redis, @upstash/ratelimit, @sentry/cloudflare, wrangler (dev); +scripts: dev:worker, deploy:staging, deploy:production
├── BREAKING_CHANGES.md                # NEW — promoted from BL-032.5; first entry: search_radar_cache → search_radar_offline
└── src/docs/                          # (BL-031.x — extended in BL-032)
    ├── operations/                    # NEW — runbooks + setup guides
    │   ├── REMOTE_CLIENT_SETUP.md     # NEW — consumer step-by-step (Phase 2 → 6)
    │   ├── DEPLOY.md                  # NEW — operator step-by-step (Phase 1 → 5 → 6)
    │   ├── AUTH.md                    # NEW — bearer-token model + key rotation (Phase 2 → 6)
    │   └── RATE_LIMITS.md             # NEW — per-tool budgets + RFC 9331 + circuit breaker (Phase 3)
    ├── radar/
    │   ├── CONTRACT.md                # EXTENDED — adds "Live tool surface (BL-032)" section (Phase 4)
    │   ├── USAGE.md                   # (BL-031.5, unchanged) snapshot tool walkthrough
    │   └── USAGE_REMOTE.md            # NEW — live tool walkthrough, three scenarios (Phase 4)
    └── contracts/README.md            # EXTENDED — table rows for live radar tools (Phase 4)
```

### Phasing

Six discrete phases; each ends with a green test suite + a small, reviewable commit. Phases 1-5 happen on a feature branch; Phase 6 (deploy) is the merge-and-ship moment.

#### Phase 1 — Workspace prep + transport spike (1 day)

**Goal**: prove the SDK + Workers transport story works end-to-end with a single trivial tool. Resolves [Q1](#q1-streamable-http-transport--which-sdk-package-exactly).

- Add `wrangler.toml` with staging env only (production env added Phase 6)
- Install candidate HTTP transport package(s); scaffold `src/worker.ts` with a hello-world Tool
- `npx wrangler dev` and `unstable_dev` both serve the Tool
- `tests/integration/worker-roundtrip.test.ts` written against `unstable_dev`, exercises one tool call end-to-end
- **Docs**: skeleton [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) committed with the "Prereqs" section authored (sections 2-10 land in later phases); [`DEVELOPER_TOOLING.md`](./DEVELOPER_TOOLING.md) gains `wrangler dev` + `unstable_dev` rows; this doc gets a `Resolved Phase 1: SDK = ...` stanza appended; Phase 1 commit message documents the SDK package choice + reasoning

#### Phase 2 — Auth + CORS (0.5-1 day)

**Goal**: lock down the Worker before any real Tools are exposed.

- `src/auth/bearer.ts` parses Authorization; structured 401 + `WWW-Authenticate`
- `src/auth/cors.ts` enforces the audited origin allowlist ([Q5](#q5-cors-allowlist-precision--which-exact-origins))
- `src/auth/safe-logger.ts` wraps `console.log` with header-stripping; lint rule (`no-restricted-syntax`) blocks raw `console.log` in worker code
- `tests/integration/auth.test.ts` + `tests/integration/cors.test.ts` green
- **Docs**: [`mcp-server/src/docs/operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md) authored (bearer-token model, `MCP_KEY_<INITIALS>` naming, manual rotation runbook, key-prefix attribution); [`mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) skeleton authored against staging URL (production URL placeholder updated in Phase 6); [`mcp-server/README.md`](../../../mcp-server/README.md) gains a "Remote (BL-032)" section pointing at REMOTE_CLIENT_SETUP.md; [`SECURITY_HEADERS.md`](../security/SECURITY_HEADERS.md) gains the MCP subdomain row

#### Phase 3 — Rate limiter + circuit breaker (1 day)

**Goal**: protect the Inoreader budget before any radar tools exist.

- `src/ratelimit/limiter.ts` instantiates `@upstash/ratelimit` ([Q7](#q7-rate-limiter--custom-or-upstashratelimit)) per-key tiers:
  - 60 req/min sliding for non-radar Tools
  - 1000 req/day for non-radar Tools
  - 5 req/min sliding for radar Tools
  - 50 req/day for radar Tools
- `src/ratelimit/circuit-breaker.ts`: Inoreader 429 sets a 6h `radar:circuit-open` flag in Upstash; while open, radar Tools serve cached results with a structured error
- `src/ratelimit/headers.ts`: RFC 9331 `RateLimit-*` headers on every response
- `tests/integration/ratelimit.test.ts` green (per-tier enforcement; circuit-breaker open/close)
- **Docs**: [`mcp-server/src/docs/operations/RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md) authored — per-tool budget table, RFC 9331 header reference, circuit-breaker semantics, Upstash command-budget envelope, "what to do when rate-limited" troubleshooting; cross-linked from REMOTE_CLIENT_SETUP.md's troubleshoot section

#### Phase 4 — Inoreader client refactor + live radar Tools (1.5-2 days)

**Goal**: stand up `search_radar` and `get_latest_insights` against the real Inoreader API. Resolves [Q2](#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited), [Q3](#q3-get_latest_insights--tool-or-just-a-thin-wrapper-over-the-fyi-resource), [Q4](#q4-inoreader-client-refactor--fork-or-generalize).

- Inoreader client refactor per [Q4 Option A](#q4-inoreader-client-refactor--fork-or-generalize) — `CacheStore` + `SecretSource` interfaces, dual adapters
- `src/lib/upstash-cache-store.ts` implements `CacheStore` against `@upstash/redis`
- `src/lib/inoreader-worker.ts` wires the client with Worker-side adapters
- `src/tools/radar-live.ts` exposes `search_radar` (rich BACKLOG schema) + `get_latest_insights` (delegates to the same content adapter the FYI Resource uses — [Q3](#q3-get_latest_insights--tool-or-just-a-thin-wrapper-over-the-fyi-resource))
- `src/tools/radar-cache.ts` renamed to `radar-offline.ts`; deprecated `search_radar_cache` alias added (planned for one-release lifespan)
- [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md) authored with the rename entry + alias-removal timeline
- `tests/integration/radar-live.test.ts` green with mocked Inoreader; existing `tests/integration/radar-cache-handler.test.ts` updated to assert on the new tool name + the deprecated-alias path
- **Docs**: [`mcp-server/src/docs/radar/USAGE_REMOTE.md`](../../../mcp-server/src/docs/radar/USAGE_REMOTE.md) authored — three end-to-end scenarios (live search by query, time-windowed FYI digest, agent-driven daily brief); [`mcp-server/src/docs/radar/CONTRACT.md`](../../../mcp-server/src/docs/radar/CONTRACT.md) gains `## Live tool surface (BL-032)` section; [`mcp-server/src/docs/contracts/README.md`](../../../mcp-server/src/docs/contracts/README.md) table gains `search_radar` + `get_latest_insights` rows; [`mcp-server/README.md`](../../../mcp-server/README.md) "What's exposed" Tools table gains the transport column + the two new tool rows; [`src/docs/hub/RADAR.md`](../hub/RADAR.md) "Inoreader budget envelope" subsection updated; this doc gets a `Resolved Phase 4: search_radar coexistence = ...` stanza recording how [Q2](#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) actually settled

#### Phase 5 — Observability (0.5-1 day)

**Goal**: production-ready logs + error capture + health.

- `src/observability/logger.ts` emits the structured JSON line per BACKLOG: `{ timestamp, keyPrefix, tool, durationMs, success, errorCode? }`
- `src/observability/sentry.ts` initializes `@sentry/cloudflare` ([Q6](#q6-sentry-on-cloudflare-workers--sentrycloudflare-or-sentrynode)); per-request scope tags `service:mcp-server` + `keyPrefix`
- `src/observability/health.ts` returns the BACKLOG-specified shape; Inoreader status reads from Upstash ([Q8](#q8-health-endpoint-inoreader-liveness--how-do-we-check-without-burning-budget))
- **Docs**: [`mcp-server/README.md`](../../../mcp-server/README.md) gains a "Health endpoint" subsection (curl example + response shape); [`SENTRY_MANUAL_SETUP.md`](./SENTRY_MANUAL_SETUP.md) gains an "MCP Worker" section (`@sentry/cloudflare` init, tag conventions, dashboard split); [`DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) sections 8-10 authored (tail-and-investigate flow, Inoreader budget recovery path, incident triage tree)

#### Phase 6 — Staging → production deploy + verification (0.5 day + soak)

**Goal**: prove the substrate works end-to-end against the real Inoreader and real clients.

- DNS provisioning per [Q10](#q10-dns-provisioning--mcpglobalstrategictech--out-of-band) (confirm-with-user gate)
- `wrangler secret put MCP_KEY_<INITIALS>` for each team member (manual rotation per [Q11](#q11-token-rotation-cadence--runbook))
- Staging deploy: `wrangler deploy --env staging`
- Curl-based smoke tests per BACKLOG validation sequence (steps 3-6)
- Production deploy: `wrangler deploy --env production` only after staging smoke tests are green
- One-week soak: pull rate-limit metrics, confirm zero Inoreader 429s, confirm at least one team member exercised a non-dev-machine path
- **Docs**: [`mcp-server/README.md`](../../../mcp-server/README.md) "Last verified (BL-032 surface)" stanza authored with concrete evidence (key prefix, tool, latency, log line) — same pattern as BL-031.75's V1-V8; [`REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) staging-URL placeholders replaced with the production URL; [`DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) sections 3-7 finalized with the actual run-against-production cadence; [`AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md) updated with the production secret naming actually used; [`DEVELOPER_TOOLING.md`](./DEVELOPER_TOOLING.md) deploy table extended with `wrangler deploy --env staging|production`; [`BACKLOG.md` BL-032](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) closure stanza; this doc's Q1-Q11 resolutions appended per the [Closure pattern](#closure-pattern); team-onboarding announcement (one-line in #intel or equivalent) directs everyone at REMOTE_CLIENT_SETUP.md as the canonical entry point
- **Sibling MCP-arc doc closure pass**: per the [Documentation deliverables § Sibling MCP-architecture docs](#sibling-mcp-architecture-docs--closure-pass-updates-phase-6) table, the 7 BL-031.x / BL-032.x sibling docs get their forward-looking BL-032 prose flipped to past-tense. The most consequential edit is [BL-031.5 line 144](MCP_SERVER_HUB_SURFACE_BL-031_5.md) — its `search_radar_cache`/`search_radar` naming-collision prediction is invalidated by [Q2's](#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) rename resolution and must be edited to record what actually happened
- **MCP-doc routing**: [`mcp-server/README.md`](../../../mcp-server/README.md) gains a "MCP Documentation" section that catalogs all MCP-related docs (the 9 architecture docs at `src/docs/development/MCP_SERVER_*.md`, the 5 new operations docs, the per-tool CONTRACT/USAGE files) — making `mcp-server/README.md` the single canonical discovery entry point. Site-level indexes then route here: [master `src/docs/README.md`](../README.md) and [`src/docs/development/README.md`](./README.md) each gain a single row deferring to `mcp-server/README.md`; [`.claude/CLAUDE.md`](../../../.claude/CLAUDE.md) gains a small "MCP Server" orientation subsection that also routes to `mcp-server/README.md`

### Acceptance criteria mapping

Every BACKLOG.md BL-032 acceptance criterion maps to one of the phases above:

| BACKLOG criterion (transport & deployment)            | Phase      |
| ----------------------------------------------------- | ---------- |
| Worker on Cloudflare Workers at stable subdomain      | 6          |
| Streamable HTTP transport (not SSE-only)              | 1          |
| `wrangler` + `@modelcontextprotocol/server` v2        | 1          |
| `src/worker.ts` + shared registry with `src/index.ts` | 1, Q9 in 6 |
| CORS allowlist                                        | 2          |

| BACKLOG criterion (auth)                                | Phase |
| ------------------------------------------------------- | ----- |
| Bearer-token API key                                    | 2     |
| `wrangler secret` per team member, `MCP_KEY_<INITIALS>` | 6     |
| Spec-compliant 401 + WWW-Authenticate                   | 2     |
| Key prefix logged, full key never logged                | 2, 5  |
| README config snippet                                   | 2     |

| BACKLOG criterion (rate limiting)                     | Phase |
| ----------------------------------------------------- | ----- |
| Sliding-window via Upstash                            | 3     |
| Per-key tiers (60/min, 1000/day; radar 5/min, 50/day) | 3     |
| Inoreader-429 circuit breaker                         | 3     |
| RFC 9331 headers                                      | 3     |
| Structured log on rate-limit decisions                | 3, 5  |

| BACKLOG criterion (new radar Tools)           | Phase |
| --------------------------------------------- | ----- |
| `search_radar` with rich schema               | 4     |
| `get_latest_insights`                         | 4     |
| 6h ISR cache via Upstash                      | 4     |
| Single Inoreader client per worker invocation | 4     |

| BACKLOG criterion (observability) | Phase |
| --------------------------------- | ----- |
| Structured JSON logs              | 5     |
| Cloudflare tail + Sentry          | 5     |
| `/health` endpoint                | 5     |
| `wrangler tail` documented        | 5     |

| BACKLOG criterion (verification & docs)     | Phase         |
| ------------------------------------------- | ------------- |
| README extensions                           | 2, 4, 5, 6    |
| Vitest auth + rate-limit + radar tool tests | 2, 3, 4       |
| `unstable_dev` integration test             | 1, expanded 6 |
| `wrangler.toml` checked in                  | 1, expanded 6 |
| One-week post-deploy review                 | 6             |

| Documentation deliverable (NEW — see § Documentation deliverables below)                                                                                                                                                                                                          | Phase                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md` (consumer step-by-step)                                                                                                                                                                                                   | 2 (skeleton) → 6 (production URL)                      |
| `mcp-server/src/docs/operations/DEPLOY.md` (operator step-by-step)                                                                                                                                                                                                                | 1 (skeleton) → 5 (tail+investigate) → 6 (full runbook) |
| `mcp-server/src/docs/operations/AUTH.md`                                                                                                                                                                                                                                          | 2 → 6                                                  |
| `mcp-server/src/docs/operations/RATE_LIMITS.md`                                                                                                                                                                                                                                   | 3                                                      |
| `mcp-server/src/docs/radar/USAGE_REMOTE.md`                                                                                                                                                                                                                                       | 4                                                      |
| `mcp-server/src/docs/radar/CONTRACT.md` § "Live tool surface (BL-032)"                                                                                                                                                                                                            | 4                                                      |
| `mcp-server/src/docs/contracts/README.md` (table extension)                                                                                                                                                                                                                       | 4                                                      |
| `mcp-server/BREAKING_CHANGES.md` (first entry)                                                                                                                                                                                                                                    | 4                                                      |
| `mcp-server/README.md` (transport column + new tools + Last verified)                                                                                                                                                                                                             | 2, 4, 5, 6                                             |
| `src/docs/development/SENTRY_MANUAL_SETUP.md` (MCP Worker section)                                                                                                                                                                                                                | 5                                                      |
| `src/docs/development/DEVELOPER_TOOLING.md` (wrangler commands)                                                                                                                                                                                                                   | 1, 6                                                   |
| `src/docs/hub/RADAR.md` (Inoreader budget envelope)                                                                                                                                                                                                                               | 4                                                      |
| `src/docs/security/SECURITY_HEADERS.md` (MCP subdomain row)                                                                                                                                                                                                                       | 2                                                      |
| Per-tool USAGE/CONTRACT updates for `search_radar_cache` rename ([`radar/USAGE.md`](../../../mcp-server/src/docs/radar/USAGE.md), [`radar/CONTRACT.md`](../../../mcp-server/src/docs/radar/CONTRACT.md), [`portfolio/USAGE.md`](../../../mcp-server/src/docs/portfolio/USAGE.md)) | 4                                                      |
| Sibling MCP-architecture doc closure pass (BL-031.5 / .75 / .85 / .87 / .95 / BL-032.5 / .75)                                                                                                                                                                                     | 6                                                      |
| `mcp-server/README.md` "MCP Documentation" section — canonical doc catalog (architecture + operations + per-tool)                                                                                                                                                                 | 6                                                      |
| Site-level routing entries deferring to `mcp-server/README.md` ([master `src/docs/README.md`](../README.md), [`src/docs/development/README.md`](./README.md), [`.claude/CLAUDE.md`](../../../.claude/CLAUDE.md))                                                                  | 6                                                      |

### Documentation deliverables

The HTTP surface introduces audiences the local-stdio docs don't fully serve: **operators** running the Worker, **team-member consumers** configuring remote clients, and **future maintainers** auditing the auth + rate-limit + Inoreader-budget invariants. This section catalogs every doc that ships under BL-032, with the audience and the phase that lands it. Two of these are the step-by-step guides the implementation arc most depends on (REMOTE_CLIENT_SETUP for consumers; DEPLOY for operators); their outlines appear after the catalog.

#### New documents (authored under `mcp-server/`)

| Path                                                                                                                      | Audience                     | Phase                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md`](../../../mcp-server/src/docs/operations/REMOTE_CLIENT_SETUP.md) | Team-member consumer         | 2 (skeleton) → 6 (final URL)                           | Per-client config: Claude Desktop (macOS / Windows), Claude Code (`.mcp.json`), Cursor, ChatGPT Connectors, Claude mobile. Each: where to paste, exact JSON shape, where the bearer token comes from, how to verify the connection, "tool didn't appear" troubleshooting tree                                                                                                                                                                                       |
| [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md)                           | Operator + future maintainer | 1 (skeleton) → 5 (tail+investigate) → 6 (full runbook) | Step-by-step deploy runbook: prereqs (wrangler login, Cloudflare zone access, Upstash project), staging deploy + smoke tests, production deploy, key rotation, rollback, incident triage tree                                                                                                                                                                                                                                                                       |
| [`mcp-server/src/docs/operations/AUTH.md`](../../../mcp-server/src/docs/operations/AUTH.md)                               | Operator + future maintainer | 2 → 6                                                  | Bearer-token model rationale (why API key, not OAuth — OAuth gates BL-033), the `MCP_KEY_<INITIALS>` naming convention, manual rotation runbook, key-prefix attribution in logs, forward-looking note on per-key scope variation as a [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) surface                                                                                                                                                        |
| [`mcp-server/src/docs/operations/RATE_LIMITS.md`](../../../mcp-server/src/docs/operations/RATE_LIMITS.md)                 | Team-member + operator       | 3                                                      | Per-tool budgets table (60/min, 1000/day; radar 5/min, 50/day), what each `RateLimit-*` response header means, the Inoreader 429 → 6h global circuit-breaker behavior, the Upstash command-budget envelope, escalation steps if a team-member is hitting limits during legitimate work                                                                                                                                                                              |
| [`mcp-server/src/docs/radar/USAGE_REMOTE.md`](../../../mcp-server/src/docs/radar/USAGE_REMOTE.md)                         | Team-member analyst          | 4                                                      | End-to-end walkthrough for `search_radar` (live, rich filters) and `get_latest_insights` — three concrete prose-prompt → tool-call → output scenarios, parallel to the snapshot-tool USAGE.md authored under BL-031.5                                                                                                                                                                                                                                               |
| [`mcp-server/BREAKING_CHANGES.md`](../../../mcp-server/BREAKING_CHANGES.md)                                               | Future maintainer + clients  | 4                                                      | First entry: `search_radar_cache` → `search_radar_offline` rename + alias-removal timeline (per [Q2](#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited)). CI test asserts URI / prompt-name / tool-name changes appear here with a `version` bump in `mcp-server/package.json` — discipline introduced in [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md), promoted to BL-032 because the rename forces it |

#### Existing documents updated

| Path                                                                                          | Phase      | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`mcp-server/README.md`](../../../mcp-server/README.md)                                       | 2, 4, 5, 6 | (Phase 2) "Remote (BL-032)" section added pointing at REMOTE*CLIENT_SETUP.md; (Phase 4) "What's exposed" Tools table gains a transport column (`local-only` / `remote-only` / `both`) and the two new live-radar Tools; (Phase 5) "Health endpoint" subsection; (Phase 6) "Last verified (BL-032 surface)" stanza with concrete evidence — key prefix, tool, latency, log line — same pattern as BL-031.75's V1–V8; **(Phase 6) "MCP Documentation" / "Architecture & operations docs" section added** — single canonical catalog of all MCP-related documentation (the 9 BL-031.x / BL-032.x architecture docs at `src/docs/development/MCP_SERVER*\*.md`, the 5 new operations docs at `mcp-server/src/docs/operations/`, the per-tool CONTRACT/USAGE files, the contracts and prompts conceptual READMEs). This makes `mcp-server/README.md` the **single discovery entry point** for any MCP question; site-level indexes route here instead of duplicating entries |
| [`mcp-server/src/docs/radar/CONTRACT.md`](../../../mcp-server/src/docs/radar/CONTRACT.md)     | 4          | New `## Live tool surface (BL-032)` section beside the existing snapshot contract; cross-references the parallel USAGE files; documents the offline rename + alias deprecation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [`mcp-server/src/docs/contracts/README.md`](../../../mcp-server/src/docs/contracts/README.md) | 4          | Contracts table gains rows for `search_radar` (live) and `get_latest_insights`; cross-link to `radar/CONTRACT.md`'s new live section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [`src/docs/development/SENTRY_MANUAL_SETUP.md`](./SENTRY_MANUAL_SETUP.md)                     | 5          | New "MCP Worker" section: `@sentry/cloudflare` init, project tag (`service:mcp-server`), DSN secret name, runtime-error visibility in the existing Sentry project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [`src/docs/development/DEVELOPER_TOOLING.md`](./DEVELOPER_TOOLING.md)                         | 1, 6       | (Phase 1) `wrangler dev` + `unstable_dev` added to local validation table; (Phase 6) `wrangler deploy --env staging                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | production`added to deploy table; clarification that the`mcp-server/`test matrix includes the`unstable_dev` integration tests |
| [`src/docs/hub/RADAR.md`](../hub/RADAR.md)                                                    | 4          | "Inoreader budget envelope" subsection updated to include MCP Worker traffic (per-key tools today; Cron lands under [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md), forward-referenced from here)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [`src/docs/security/SECURITY_HEADERS.md`](../security/SECURITY_HEADERS.md)                    | 2          | New row for `mcp.globalstrategic.tech` + `mcp-staging.globalstrategic.tech`: the MCP subdomain runs its own zone (Workers, not Vercel) and is not a target of the website CSP; CORS allowlist policy reference; secret-management posture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`BACKLOG.md` BL-032 entry](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2)            | 6          | Closure stanza: status flips to "Complete (YYYY-MM-DD)"; deviations from this doc recorded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| This doc (`MCP_SERVER_REMOTE_BL-032.md`)                                                      | 1, 4, 6    | (Phase 1) `Resolved Phase 1: SDK = ...` stanza appended once [Q1](#q1-streamable-http-transport--which-sdk-package-exactly) is resolved; (Phase 4) `Resolved Phase 4: search_radar coexistence = ...` stanza appended once [Q2](#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) is decided with the user; (Phase 6) full closure stanza per the [Closure pattern](#closure-pattern) section below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

##### Per-tool MCP docs touched by the `search_radar_cache` rename ([Q2](#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited))

| Path                                                                                        | Phase | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`mcp-server/src/docs/radar/USAGE.md`](../../../mcp-server/src/docs/radar/USAGE.md)         | 4     | Title rewrite (`search_radar_cache` → `search_radar_offline`); body's tool-name references updated; deprecation banner at top pointing at USAGE_REMOTE.md as the canonical Radar walkthrough; the snapshot tool repositioned as the offline-fallback path it always was. **This is a meaningful rewrite, not a find-replace** — the calculus shifts from "this tool IS Radar in MCP" to "this tool is Radar when offline / in dev / when budget is exhausted" |
| [`mcp-server/src/docs/radar/CONTRACT.md`](../../../mcp-server/src/docs/radar/CONTRACT.md)   | 4     | Beyond the new "Live tool surface (BL-032)" section already cataloged: the existing snapshot-contract title + "strict mirror of `/hub/radar`" framing is preserved; `## Future extension` prose at the file's mid-section is rewritten now that the live tool's `since` filter actually exists; "Future: BL-032" footer flips to past-tense                                                                                                                   |
| [`mcp-server/src/docs/portfolio/USAGE.md`](../../../mcp-server/src/docs/portfolio/USAGE.md) | 4     | Two cross-references to `search_radar_cache` (lines 110 + 124, "composes with portfolio results" prose) updated to point at `search_radar` (live, the canonical online path) — the composition story improves: a portfolio retrieval composing with **live** Radar is a stronger demo than composing with a snapshot                                                                                                                                          |
| [`mcp-server/src/docs/prompts/README.md`](../../../mcp-server/src/docs/prompts/README.md)   | 6     | Line 100's "If someone renames a Tool in BL-032 but forgets to update the prompt that orchestrates it..." rewrite — flips from hypothetical to **live example**: BL-032's `search_radar_cache → search_radar_offline` rename was caught by the registry-invariant test (or wasn't, depending on what actually happened); either outcome is documentable                                                                                                       |

##### Sibling MCP-architecture docs — closure-pass updates (Phase 6)

These docs all currently contain forward-looking BL-032 prose ("BL-032 will…", "deferred to BL-032", "until BL-032 ships"). At BL-032 closure each gets a small editorial pass to convert relevant claims to past-tense and resolve any predictions Q1–Q11 mooted. **These are small per-doc edits** (typically 2-5 line changes each), not rewrites — but they are cumulatively meaningful and easy to forget.

| Path                                                                                                 | Specific lines / sections                                                                                                                      | Closure update                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`MCP_SERVER_ARCHITECTURE_BL-031.md`](MCP_SERVER_ARCHITECTURE_BL-031.md)                             | "Phase 2 summarized" section (~line 278)                                                                                                       | Flip from forward-looking summary to past-tense reference; cross-link to this doc as the keystone (already partially done in this doc's wiring step)                                                                                                                                                    |
| [`MCP_SERVER_HUB_SURFACE_BL-031_5.md`](MCP_SERVER_HUB_SURFACE_BL-031_5.md)                           | Lines 47, 123, 132, 144 (search_radar naming-collision prediction), 230-234 (Out-of-scope), 270 (per-item Resource future)                     | Most consequential: line 144's prediction about `search_radar_cache` vs `search_radar` is **invalidated** by [Q2's](#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) rename resolution and must be edited; the rest are forward-→past mechanical updates |
| [`MCP_SERVER_PROMPTS_BL-031_75.md`](MCP_SERVER_PROMPTS_BL-031_75.md)                                 | Line 222 ("mcp-server stays at 0.0.1 until the first production deployment (BL-032 or later)..."); line 450 (Out-of-scope deferrals to BL-032) | The 0.0.1 → 1.0.0 version bump that BL-031.75 anticipated **is** BL-032's closure work — record the actual bumped version (e.g., `0.1.0` if Q2's deprecation alias makes a major bump premature, or `1.0.0` if the team accepts BL-032 as the "first production" milestone)                             |
| [`MCP_SERVER_CONTRACTS_BL-031_85.md`](MCP_SERVER_CONTRACTS_BL-031_85.md)                             | Line 12 ("Sequel: BL-032 in BACKLOG.md")                                                                                                       | Update the cross-link to point at this architecture doc directly (matches the convention used by other sibling docs)                                                                                                                                                                                    |
| [`MCP_SERVER_STAGE_ADAPTER_BL-031_87.md`](MCP_SERVER_STAGE_ADAPTER_BL-031_87.md)                     | Lines 14, 77, 286 ("when BL-032 ships HTTP transport, each tool gets fronted by a Remote Proxy")                                               | Flip Remote-Proxy claim from forward-looking to verifiable past-tense; if BL-032's auth + rate-limit substrate didn't end up architected as a Proxy-pattern wrapper, edit the prose to reflect what actually shipped                                                                                    |
| [`MCP_SERVER_HUB_URL_STATE_BL-031_95.md`](MCP_SERVER_HUB_URL_STATE_BL-031_95.md)                     | Line 15 ("when MCP tools serve over HTTP, the deep-links remain in the same emitted shape")                                                    | Flip to past-tense; verify the deep-link wire format is byte-stable across stdio + HTTP (this is also a Phase 6 verification step)                                                                                                                                                                      |
| [`MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md`](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) | Header `Depends on: BL-032` status; the BL-032-substrate references throughout                                                                 | Update `Status: Open. Depends on BL-031.5, BL-031.75, BL-032` line to note BL-032 dependency met; substrate references flip to past-tense                                                                                                                                                               |
| [`MCP_SERVER_OBSERVABILITY_BL-032_75.md`](MCP_SERVER_OBSERVABILITY_BL-032_75.md)                     | Header dependency line; "the remote substrate whose observability this initiative extends"                                                     | Same shape: dependency met; substrate references flip to past-tense                                                                                                                                                                                                                                     |

##### Repo-level discovery routing — `mcp-server/README.md` is the canonical entry point

**Routing decision** (recorded for future sessions): `mcp-server/README.md` is the single discovery entry point for all MCP-related documentation — the 9 BL-031.x / BL-032.x architecture docs (which continue to live at `src/docs/development/MCP_SERVER_*.md` since they fit the development-initiative-doc pattern), the 5 new operations docs (`mcp-server/src/docs/operations/`), the per-tool CONTRACT/USAGE files, and the conceptual READMEs are all **catalogued from `mcp-server/README.md`'s "MCP Documentation" section** added in Phase 6 (above). Site-level indexes route here instead of duplicating entries.

| Path                                              | Phase | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/docs/README.md`](../README.md)              | 6     | "Quick Navigation" table gains a single row: **"Find any MCP server documentation" → [`mcp-server/README.md`](../../../mcp-server/README.md)**. The existing two rows ("See the MCP server in a concrete scenario" → `mcp-server/src/docs/diligence/USAGE.md`; "Understand a Hub tool's input contract" → `mcp-server/src/docs/contracts/README.md`) stay — they're answer-specific deep-links, complementary to the catalog entry, not duplicates                                                                                           |
| [`src/docs/development/README.md`](./README.md)   | 6     | Active Documents table gets a single new row: **"All MCP server work — architecture, operations, surface" → [`mcp-server/README.md`](../../../mcp-server/README.md)**. Does NOT absorb the 9 `MCP_SERVER_*.md` initiative docs into the table; the catalog lives in `mcp-server/README.md`. The 9 docs continue to live in `src/docs/development/` because they fit the development-initiative-doc pattern (cross-cutting strategy + acceptance criteria + closure stanzas), but this README defers their cataloguing to the MCP entry point |
| [`.claude/CLAUDE.md`](../../../.claude/CLAUDE.md) | 6     | New "MCP Server" subsection under Project Overview: ~5-line orientation pointing at `mcp-server/README.md` as the canonical entry point. Names what the server is (Tools + Resources + Prompts surface), what its two transports are (local stdio + remote HTTP), and routes any deeper question to `mcp-server/README.md`. Currently CLAUDE.md has zero MCP guidance — fine for a local-stdio internal tool but starts to leak invisible context once the tool is multi-machine                                                             |

#### REMOTE_CLIENT_SETUP.md outline (consumer step-by-step)

This is the single most important doc for productivity multiplier — without it, team-members can't actually use what BL-032 ships. Sections:

1. **One-time: get your API key** — identify your `MCP_KEY_<INITIALS>` from the Cloudflare dashboard or by asking the operator (link to AUTH.md). Storage rules (1Password / system keychain — never plaintext in a config file checked into git)
2. **Pick your client** — table mapping client → config-file path per OS (`~/Library/Application Support/Claude/claude_desktop_config.json`, `%APPDATA%\Claude\claude_desktop_config.json`, `.mcp.json`, `~/.cursor/mcp.json`, ChatGPT Connectors UI, Claude mobile in-app)
3. **Paste the config snippet** — exact JSON for each client, with the `Authorization: Bearer <key>` header pattern. Includes the staging URL (for early adopters) and the production URL
4. **Verify the connection** — restart the client; confirm tool list includes `search_radar`, `get_latest_insights`, and the eight BL-031.x tools; one-line smoke prompt that exercises a tool ("search radar for kubernetes") and one that exercises a prompt (`/gst_radar_brief_today`)
5. **Troubleshoot** — symptom-driven tree: tool didn't appear → connection refused → 401 → 403 (CORS) → 429 (rate-limited) → 503 (Inoreader degraded). Each leaf: cause, fix, when to escalate to operator
6. **Rate-limit etiquette** — link to RATE_LIMITS.md; quick rules of thumb (avoid radar-tool loops in agent code; the per-day cap is 50/key for radar)
7. **Mobile-specific notes** — Claude mobile's MCP support nuances; what works and what doesn't (e.g., long-lived connection behavior on cellular)
8. **When to escalate** — key compromise, persistent 429s, suspected outage; link to operator's DEPLOY.md "incident triage" section

#### DEPLOY.md outline (operator step-by-step)

This is the implementation/operations runbook. Sections:

1. **Prereqs (one-time)** — `wrangler login`; verify Cloudflare zone access for `globalstrategic.tech` (and confirm the zone is on Cloudflare DNS per [Q10](#q10-dns-provisioning--mcpglobalstrategictech--out-of-band)); confirm Upstash project + REST credentials; confirm Sentry DSN secret value; confirm Inoreader app credentials
2. **Pre-deploy local checks** — `cd mcp-server && npm test` green; `npm run build`; `npx wrangler dev` smoke (curl health locally)
3. **Deploy to staging** — `wrangler deploy --env staging`; the seven-step curl smoke sequence (health → tool list → sample non-radar tool call → sample live-radar call → 429 sequence → claude-desktop end-to-end)
4. **Deploy to production** — `wrangler deploy --env production` (only after staging green); curl health on production URL; one Claude Desktop end-to-end check from a non-dev machine if available
5. **Add a new team-member key** — `wrangler secret put MCP_KEY_<INITIALS> --env production`; communicate the value to the team-member via approved channel (1Password share, etc., per [feedback_no_unfounded_risk_claims.md](C:\Users\thefa.claude\projects\c--Code-gst-website\memory\feedback_no_unfounded_risk_claims.md) — confirm the share channel before assuming)
6. **Rotate a key** — `wrangler secret delete MCP_KEY_<INITIALS> --env production` then `wrangler secret put`; team-member updates their client config; old key invalid immediately
7. **Rollback** — `wrangler rollback --env production` to the previous deployment; circumstances that warrant rollback (sustained Sentry error rate, health-check failure, user-reported outage); the BL-032 substrate is small enough that rollback is the right first move
8. **Tail and investigate** — `wrangler tail --env production`; common error fingerprints (missing-key, wrong-key, rate-limited, Inoreader-degraded, Upstash-degraded); how to read the structured log line; Sentry dashboard URL
9. **Inoreader budget recovery** — how the global circuit-breaker behaves; manual reset path (delete the `radar:circuit-open` Upstash key) if the budget genuinely recovers before the 6h window; when to NOT manually reset (sustained 429s)
10. **Incident triage tree** — symptom → cause → fix → escalation; bounded blast-radius reminder (BL-032 is internal; outage = inconvenience, not contractual breach — that calculus changes under [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3))

### Verification (per phase)

Each phase's commit ends with `cd mcp-server && npm test` green AND the repo-root command sequence per [CLAUDE.md § Developer tooling](../../../CLAUDE.md):

```
npx astro check && npm run lint && npm run lint:css && npm run test:run
```

Phase 6 adds:

1. `wrangler deploy --env staging` succeeds
2. `curl https://mcp-staging.globalstrategic.tech/health` returns `{ ok: true, ... }` with both Redis and Inoreader checks present
3. `curl -H "Authorization: Bearer <key>" ...` against the streamable HTTP transport returns the tool list (8 BL-031.x Tools + 2 new live-radar Tools, OR 9 + 2 if Q2 keeps the offline alias for one release)
4. Claude Desktop pointed at staging: `search_radar { query: "kubernetes" }` returns results in <2s; `wrangler tail` shows the log line
5. Hammer staging at 100 req/60s → 429 with `RateLimit-*` headers after the per-min threshold
6. Production deploy only after steps 1-5 pass on staging

### Risks & mitigations (extends BACKLOG)

| Risk                                                          | Mitigation                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Inoreader API exhaustion** (BACKLOG)                        | Per-key 50/day cap + global circuit breaker (Phase 3); the offline-snapshot path remains as a fallback under sustained 429                                                                                                                                                                                         |
| **Redis quota** (BACKLOG)                                     | `@upstash/ratelimit` batches reads/writes via Lua/pipeline (≤2 commands per check); upgrade to paid tier if usage exceeds 5k/day for two weeks running                                                                                                                                                             |
| **Schema drift between stdio and HTTP entrypoints** (BACKLOG) | Single `createServer()` factory in `src/server.ts`; `tests/integration/registry-snapshot.test.ts` (Phase 6) snapshots the registered tool list and fails on drift without a `BREAKING_CHANGES.md` entry ([Q9](#q9-schema-drift-ci--how-does-the-test-see-both-registries))                                         |
| **Token leakage via logs** (BACKLOG)                          | `src/auth/safe-logger.ts` strips Authorization + Cookie headers; lint rule blocks raw `console.log` in worker code; Phase 5 adds Sentry-side scrubbing as defense-in-depth                                                                                                                                         |
| **CORS over-permissioning** (BACKLOG)                         | Phase 1 origin audit ([Q5](#q5-cors-allowlist-precision--which-exact-origins)); allowlist reviewed quarterly; `cors.test.ts` asserts wildcard never appears in any response                                                                                                                                        |
| **SDK package choice premature** (NEW)                        | Phase 1 spike resolves before any production code is written; this doc gets an updated stanza recording the decision ([Q1](#q1-streamable-http-transport--which-sdk-package-exactly))                                                                                                                              |
| **`search_radar_cache` rename surprises clients** (NEW)       | Deprecated alias retained for one release; `BREAKING_CHANGES.md` entry; **confirm-with-user** before naming Q2's resolution as final                                                                                                                                                                               |
| **Inoreader-client refactor regresses website ISR** (NEW)     | Phase 4 adapter-pattern refactor ([Q4](#q4-inoreader-client-refactor--fork-or-generalize)); existing website ISR tests + a new dual-adapter parity test gate the change; if regression risk is not bounded by tests, revert to forked client (Q4 Option B) and accept the drift cost                               |
| **DNS / Worker route misconfiguration** (NEW)                 | Phase 6 confirm-with-user gate on `mcp.globalstrategic.tech` provisioning ([Q10](#q10-dns-provisioning--mcpglobalstrategictech--out-of-band)); staging at `mcp-staging.globalstrategic.tech` proves the cert + route flow before production                                                                        |
| **Phase 1 spike reveals the SDK story is incomplete** (META)  | If `@modelcontextprotocol/hono` or equivalents don't reach production-ready on Workers, fall back to the custom `fetch`-handler shim path ([Q1 Option C](#q1-streamable-http-transport--which-sdk-package-exactly)); this doc records the deviation and the BACKLOG cost estimate gets revised in a closure stanza |

### Out of scope (deferred to BL-032.5 / BL-032.75 / BL-033)

- **Resources over HTTP** — Library, Regulations, Radar snapshot Resources reachable via HTTP — deferred to [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md). The Resource handlers exist locally; they don't ride the BL-032 Worker.
- **Prompts over HTTP** — `gst_*` prompts reachable via HTTP — deferred to [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md).
- **Cache-Control / ETag / Last-Modified headers** — only relevant once Resources ship (Resources need cache semantics; Tool outputs are recomputed on every call).
- **Per-key scope variation** — every `MCP_KEY_*` carries the full scope set under BL-032. Per-key scope variation is a [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) product surface.
- **OAuth 2.1 / dynamic client registration / token introspection** — bearer keys remain through BL-032.5; OAuth ships under [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3).
- **Compliance-grade audit logging** (input/output payload retention, R2, hash chains) — BL-032 logs metadata only; full audit trail is a [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) concern.
- **SLO dashboards + burn-rate alerts** — designed against measured production baselines under [BL-032.75](MCP_SERVER_OBSERVABILITY_BL-032_75.md), not pre-built against guesses.
- **Periodic Cron-driven radar snapshot refresh** — relevant once Resources ship over HTTP; deferred to [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md).
- **Prompt-injection sanitization on tool outputs** — [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) external-client concern; trusted internal users are out of threat scope.
- **MCP directory listings** (Anthropic registry, MCPMarket) — [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3); BL-032 stays internal.
- **Automated key rotation cron** — manual rotation via `wrangler secret put` is the BL-032 model ([Q11](#q11-token-rotation-cadence--runbook)); automation is a [BL-033](BACKLOG.md#bl-033-mcp-server--external-pilot-phase-3) operational concern.

---

## Closure pattern

When BL-032 ships:

1. This doc gets a closure stanza appended documenting:
   - The Q1-Q11 resolutions actually reached (vs the recommendations above)
   - Any deviations from the phase plan
   - The "Last verified (BL-032 surface)" anchor pointing at `mcp-server/README.md`'s post-deploy evidence section
2. `mcp-server/README.md`'s "What's exposed" section gains a transport column distinguishing local-only / remote-only / both
3. `BACKLOG.md` BL-032 entry's status flips to "Complete (YYYY-MM-DD)"
4. [BL-031](BACKLOG.md#bl-031-mcp-server--internal-prototype-phase-1) ↔ [BL-032](BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) ↔ [BL-032.5](MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) cross-links updated to past tense
5. **Documentation completeness audit** — every entry in the [Documentation deliverables](#documentation-deliverables) catalog above is checked off; any skeleton-only sections that didn't land in their target phase get filed as BL-034 cleanup bullets (per [CLAUDE.md § 4a](../../../CLAUDE.md), in-session remediation is preferred — only file as BL-034 if the work is genuinely out-of-scope or blocked by a constraint outside the implementation arc)
6. **Step-by-step guide live exercise** — REMOTE_CLIENT_SETUP.md walked end-to-end by a team member who did not author it (paste-the-config → restart-the-client → run-the-smoke-test); friction surfaced gets folded back into the doc before this initiative is marked complete. DEPLOY.md walked by an engineer different from the one who deployed it, against staging
7. Per [CLAUDE.md § 4a — No Deferred Tech Debt](../../../CLAUDE.md), any items discovered during implementation that BL-032 cannot remediate in-session get filed as new BL numbers, **not** carried as "deferred to next session"

---

_Last updated: 2026-05-03_
