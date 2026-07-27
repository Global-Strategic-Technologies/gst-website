# MCP Server Rate Limits

> **Audience**: team-member + external-pilot consumers, and operators. Consumers want to know "what budgets do I have, what do response headers tell me, what do I do when rate-limited?" Operators additionally want "how do I tune the limits, where's the Upstash quota envelope, when does the circuit-breaker open?"
>
> **Status**: BL-032 Phase 3 substrate + BL-038 radar tier + **BL-033 Slice 5 per-client tiers** (2026-07-26). Full sliding-window enforcement is validated against staging Upstash (not CI — no live Redis in unit runs).
>
> **Architecture & rationale**: [`ARCHITECTURE.md` § Rate limiting & Inoreader budget](../ARCHITECTURE.md#rate-limiting--inoreader-budget) · [ADR-0010](../../../../src/docs/adr/0010-per-client-rate-limit-tiers.md) (tier design + soft-limit transport).

---

## Per-key budgets

Every authenticated request consumes one token from the budgets below. Buckets are **per `keyOwner`** (see [`AUTH.md`](./AUTH.md) — your `MCP_KEY_<INITIALS>` suffix, or an M2M client's `M2M:<NAME>`, is the bucket identifier). Two callers hammering tools at the same time get independent budgets; one can't deny service to another.

The ceilings depend on the caller's **tier** (below). The table shows the **`internal`** tier — the budget for team `MCP_KEY_*` keys and OAuth human-consent sessions, unchanged since BL-032/BL-038:

| Tool family       | Per-minute (sliding) | Per-day (sliding) | Status                           |
| ----------------- | -------------------- | ----------------- | -------------------------------- |
| **General tools** | 60                   | 1000              | ✅ Active in Phase 3             |
| **Radar tools**   | 5                    | 50                | ✅ Active in BL-038 (2026-05-31) |

**Sliding window** (vs. fixed-bucket): the budget rolls continuously — the 60th request in the past 60 seconds tips you over, regardless of when the prior 59 happened. No "burst at the top of every minute" exploit.

### Per-client tiers (BL-033 Slice 5)

An external pilot's tier is set on its M2M client record (`tier`: `free-pilot` / `paid` / `enterprise`) and carried in the access-token claim, so the limiter reads it locally with no KV round-trip (see [ADR-0010](../../../../src/docs/adr/0010-per-client-rate-limit-tiers.md)). Callers with no tier — static `MCP_KEY_*` keys, OAuth human-consent — resolve to `internal`.

| Tier         | General /min | General /day | Radar /min | Radar /day |
| ------------ | ------------ | ------------ | ---------- | ---------- |
| `free-pilot` | 30           | 300          | 3          | 20         |
| `paid`       | 60           | 2000         | 5          | 50         |
| `enterprise` | 120          | 10000        | 10         | 150        |
| `internal`   | 60           | 1000         | 5          | 50         |

> **These are tunable, non-contractual capability ceilings — NOT ratified SLA quotas.** They are abuse/capacity limits. `free-pilot` is deliberately tighter than `internal` (abuse containment for an unvetted pilot), not a promised allowance. No pilot rate SLA is contractually committed.

**Changing a tier** takes effect on the next window evaluation — the limiter reuses the same per-`keyOwner` Redis keys, so there's no migration; the new ceiling simply applies going forward (a client mid-window keeps whatever tokens it already consumed).

**Why a separate radar cap?** Radar tool calls are ~99% Upstash cache hits — **zero** Inoreader spend. Only a cold/expired-cache miss falls through to a live Inoreader fetch, and the global **circuit breaker** (below) is the real guard on the shared ~150/day Inoreader headroom. The per-client radar caps are therefore **per-client fairness + thin cache-cold defense-in-depth**, not the upstream-budget control. (Website ISR ~28/day + the Cron snapshot refresh ~24/day are the steady Inoreader consumers; see [ADR-0006](../../../../src/docs/adr/0006-inoreader-zone1-budget-protection.md).)

---

## Response headers (IETF RateLimit fields)

Every authenticated response (200 OR 429) carries:

| Header                | Meaning                                                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RateLimit-Limit`     | Maximum requests in the active window (the binding bucket's limit)                                                                                                                                                                                   |
| `RateLimit-Remaining` | Requests left in the active window                                                                                                                                                                                                                   |
| `RateLimit-Reset`     | Seconds until the active window resets                                                                                                                                                                                                               |
| `RateLimit-Policy`    | The caller's tier ceilings, quoted-policy form — e.g. `"general-min";q=30;w=60, "general-day";q=300;w=86400` (radar calls append the `radar-min`/`radar-day` members). Lets client engineers self-diagnose their budget without hitting a 429 first. |

429 responses additionally carry:

| Header        | Meaning                                                         |
| ------------- | --------------------------------------------------------------- |
| `Retry-After` | RFC 7231-compliant retry hint (same value as `RateLimit-Reset`) |

The values reflect the **closest cliff** — if you have 5 of 60 per-minute remaining and 700 of 1000 per-day remaining, the headers show the per-minute numbers. That's what you should pace against.

The 429 response body adds a structured JSON envelope:

```json
{
  "error": "rate_limit_exceeded",
  "message": "Per-minute rate limit exceeded; retry after 30 seconds.",
  "tier": "minute",
  "reason": "rate-limit-per-minute",
  "limit": 60,
  "retryAfterSeconds": 30
}
```

The `tier` field tells you which bucket triggered. With BL-038's radar-tier activation it can now be one of `"minute"`, `"day"`, `"radar-minute"`, or `"radar-day"`. The `reason` field carries a stable string designed for agent-side classification — values are `rate-limit-per-minute`, `rate-limit-per-day`, `radar-rate-limit-per-minute`, `radar-rate-limit-per-day`. Use `reason` to distinguish "slow my radar polling specifically" (`radar-rate-limit-*`) from "slow everything" (the general `rate-limit-*`). For a per-day cap hit, `retryAfterSeconds` can be many hours — sleep until tomorrow.

### Soft-limit warning at 80% (BL-033 Slice 5)

Before the hard 429, when any bucket is ≥80% consumed the server emits an MCP `notifications/message` (level `warning`, logger `ratelimit`) on the request's stream so an agent can throttle itself proactively:

```json
{
  "method": "notifications/message",
  "params": {
    "level": "warning",
    "logger": "ratelimit",
    "data": {
      "message": "Approaching rate limit …",
      "tier": "day",
      "limit": 300,
      "remaining": 45,
      "resetSeconds": 51200
    }
  }
}
```

This is **best-effort**: it's delivered on the streamable-HTTP SSE response, so a client that only reads the terminal result frame won't see it. That's fine — the `RateLimit-Remaining` / `RateLimit-Policy` **headers on every response are the guaranteed signal**; the notification is a convenience for clients that consume interim frames. A failure to deliver it never affects the tool call.

---

## Circuit breaker (radar protection)

Independent of the per-key rate limit, the radar surfaces share a **global circuit breaker** that opens when upstream Inoreader returns 429 — meaning GST's overall daily budget is exhausted, regardless of which key is calling.

| State      | What happens                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Closed** | Normal operation. Radar reads reach Inoreader on a cache miss (with the per-key 5/min cap still active)                                                                                                                          |
| **Open**   | **Every radar read surface serves the cached snapshot and makes NO upstream calls.** Results carry `liveInfo.degraded: true` (see below). A `503` returns only when there is also nothing cached. Non-radar tools are unaffected |

**Why 6 hours?** Inoreader's daily budget resets on a rolling 24h window; 6h is a conservative back-off that avoids burning the next day's budget by retrying too aggressively. It also matches the website's ISR cache window — both surfaces converge on the same "stop hammering Inoreader" semantics.

**Coverage (BL-091)**: the rule is uniform across **all four** radar paths — the `search_radar` / `get_latest_insights` tools, the `gst://radar/*` Resources, and the `/radar/snapshot` SSR endpoint all switch to cache-only reads; the refresh cron skips entirely. Before BL-091 the tools _over_-applied the breaker (hard 503 even with a warm cache) while Resources and `/radar/snapshot` _under_-applied it (no check at all — they could fetch live during an open window and leak the very budget the breaker protects).

### Degraded mode — what a consumer sees

While the breaker is open, radar results are served from the Upstash snapshot (up to 6h old) and flagged:

```jsonc
"liveInfo": {
  "wireFetchedAt": "2026-07-27T04:12:00.000Z",
  "wireCacheHit": true,
  "fyiFetchedAt": null,        // this tier had nothing cached
  "fyiCacheHit": null,
  "degraded": true,            // served from cache; breaker is open
  "retryAfterSeconds": 21540
}
```

`degraded` is **always present** (`false` on the normal path). A tier with no cached data reports `null` for its `fetchedAt`/`cacheHit` rather than a fabricated value. Check `fetchedAt` for actual age.

### 503 — only when nothing is cached

```json
{
  "error": "service_unavailable",
  "message": "Radar tools temporarily unavailable — Inoreader budget circuit is open. Retry after 21540 seconds.",
  "retryAfterSeconds": 21540,
  "reason": "inoreader-rate-limit"
}
```

(This is an MCP `isError` content envelope, not an HTTP status — the tool path always returns HTTP 200. `/radar/snapshot` likewise stays HTTP 200 and expresses the state in the body, so the website's feed never hard-fails.)

**No automatic recovery probe.** Nothing refreshes the cache while the breaker is open (that's the point — it protects the budget), so if Inoreader recovers early the stale data persists until the 6h TTL expires. A half-open trial probe was designed and deliberately **rejected**: a naive one can _extend_ an outage, because it can succeed on the last unit of Zone-1 headroom and the follow-on 6-call wire refill then 429s — and `openCircuit` resets the **full** 6h TTL rather than preserving the original expiry. See § manual reset below if you need to recover sooner.

---

## What to do when rate-limited (consumer)

| Symptom                                                         | Reading                                                                    | What to do                                                                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `429` with `tier: "minute"`                                     | You burst-called too fast in the past 60s                                  | Sleep `Retry-After` seconds. If you're an agent author: insert a 1.5s sleep between tool calls — humans rarely click faster than that anyway                                |
| `429` with `tier: "day"`                                        | You consumed the full daily budget                                         | Sleep until midnight UTC (or `Retry-After`, whichever you prefer). If this is happening to you regularly while doing legitimate work, escalate to operator (see below)      |
| Radar results with `liveInfo.degraded: true`                    | Circuit breaker is open; you're getting the cached snapshot, not live data | Usually nothing — the data is real, just up to 6h old (`fetchedAt` tells you). If you need live data, wait `retryAfterSeconds`                                              |
| `503` from radar tools, with `reason: "inoreader-rate-limit"`   | Breaker is open **and** nothing is cached to serve                         | Use the offline radar tool (`search_radar_offline` — local stdio only) if you have a local MCP set up too. Otherwise wait the `Retry-After` window (up to 6h)               |
| `RateLimit-Remaining` is 0 but you're not getting 429s          | You're at the cliff but technically not over. Next request WILL get 429    | Stop and wait. The Worker counts the next request as the (N+1)th and 429s it                                                                                                |
| Frequent 429s while working interactively (single conversation) | Probably an agent loop; agents are tireless and burn through 60/min easily | Inspect the conversation; cancel the runaway agent. If you're authoring a new prompt that orchestrates many tool calls, count the calls and request a higher per-key budget |

### Rules of thumb

- The website (`/hub/radar`) shares the Inoreader budget — don't keep its tab refreshing in the background while you're using radar tools
- Don't fire `search_radar` in agent loops. If the agent needs the same query 5× in a row, call once and reuse the result
- The offline tool (`search_radar_offline`, local stdio only) doesn't count against the budget — use it for repeated dev / CI runs
- Agent prompts that orchestrate tool fan-out (`gst_target_quick_look` does 4; `gst_diligence_handoff_memo` does 3) should stay well under per-minute caps in normal use

---

## Operator concerns

### Tuning the limits

Per-tier ceilings live in [`mcp-server/src/ratelimit/tiers.ts`](../../ratelimit/tiers.ts) as the `TIER_LIMITS` map (plus `INTERNAL_TIER`, the no-regression anchor consumed as `createLimiter`'s default):

```typescript
export const TIER_LIMITS: Record<string, TierLimits> = {
  'free-pilot': { perMinute: 30, perDay: 300, radarPerMinute: 3, radarPerDay: 20 },
  paid: { perMinute: 60, perDay: 2000, radarPerMinute: 5, radarPerDay: 50 },
  enterprise: { perMinute: 120, perDay: 10000, radarPerMinute: 10, radarPerDay: 150 },
  internal: INTERNAL_TIER, // 60 / 1000 / 5 / 50 — the pre-Slice-5 constants
};
```

To adjust: update the map, redeploy. The change takes effect on the next isolate cold-start (or via `wrangler deploy --env <env>` to force fresh isolates). These are **tunable capability ceilings, not SLA quotas** — don't publish them as contractual commitments.

**When to consider raising**: a caller doing legitimate work hits 429s repeatedly. **When to consider lowering**: cost / abuse signals (observability dashboards surface these).

### Upstash quota envelope

The limiter uses Upstash Redis via REST. Each `limit()` check costs **2 Redis commands** (read + atomic increment). Phase 3 issues two `limit()` calls per request (per-minute + per-day), so each authenticated request costs **4 Redis commands**.

Upstash free tier: **10,000 commands/day**. At 4 commands/request, that's a ceiling of ~2,500 authenticated requests/day across the entire team before we tip the free tier.

Math check against the per-key budgets:

| Team size                          | Per-day MCP traffic | Redis commands/day                          |
| ---------------------------------- | ------------------- | ------------------------------------------- |
| 1 team member at full 1000/day cap | 1000 requests       | 4,000 commands                              |
| 2 team members at full caps        | 2000 requests       | 8,000 commands                              |
| 3+ team members at full caps       | 3000+ requests      | 12,000+ commands → would tip into paid tier |

In practice usage is far below the per-key caps (analytical sessions, not bot loops). Free tier should hold through the soak week + initial team rollout. **Upgrade trigger**: Upstash dashboard alert at 80% of monthly free quota — at that point flip to paid ($10/mo as of 2026).

### Circuit-breaker manual reset

The breaker auto-closes after 6 hours via TTL. Because nothing repopulates the radar cache while it is open (BL-091 — every read surface is cache-only, and the cron skips), **manual reset is the only way to recover before the TTL expires** if Inoreader comes back early. Check `/status` (or `/health`'s `circuitOpen`) to confirm the breaker is what's holding radar on stale data:

```bash
# Connect to Upstash via the CLI or REST API and delete the key. Path 2:
# the circuit-breaker flag lives in the MCP DB (mcp:* namespace), so use
# the MCP-DB credentials, NOT the Inoreader-DB Read-Only token.
redis-cli -u $UPSTASH_MCP_REST_URL DEL mcp:radar:circuit-open
# Or via @upstash/redis console (MCP DB)
```

**Don't manually reset reflexively** — if Inoreader is still degraded, you'll just trigger another circuit-open seconds later, burning more budget. Wait for Inoreader's status page to show "operational" first.

### Graceful skip (Upstash unreachable)

When Upstash credentials aren't bound on the Worker `env` (or Upstash is down):

- `createLimiter()` returns null
- The Worker logs `event: 'ratelimit.skipped'` with `reason: 'upstash-not-bound'` and lets the request through
- Phase 5 observability dashboards alert on sustained `ratelimit.skipped` rates — that's the signal Upstash is unreachable, not that limits are misconfigured

This is intentional fail-open — the bearer-token check still gates access. Rate limiting is defense-in-depth; a transient Upstash outage shouldn't take down MCP entirely.

### Radar-tier activation (shipped via BL-038, 2026-05-31)

The limiter carries a third + fourth `Ratelimit` instance scoped to `mcp:ratelimit:radar:min` and `mcp:ratelimit:radar:day` with the 5/min and 50/day caps. The Worker pre-parses the MCP request body via [`extractToolName`](../../dispatch/extract-tool-name.ts) at the rate-limit gate; if the call is `tools/call` for `search_radar` or `get_latest_insights`, all four buckets (general AND radar) get checked in parallel. Non-radar calls + non-`tools/call` requests + parse failures fail-safe to the general-only 2-bucket path.

The general tier still applies to radar calls — they count toward the general 60/min, 1000/day allowance too. The radar tier is **additive** (a stricter parallel constraint), not replacement.

**Upstash command budget**: each `Ratelimit.limit()` call costs 2 Redis commands. A general request consumes 4 commands (2 buckets), a radar request consumes 8 commands (4 buckets). Worst-case sizing for the Upstash free tier (10k commands/day): one operator at 1000 general + 50 radar calls/day = 4,400 commands; sized for 2 active operators (8,800/day) within free tier headroom. A third active operator pushes the math over the 10k threshold — the upgrade trigger is documented in the BL-038 design doc § Risks.

---

_Last updated: 2026-05-31 (BL-038 — radar tier shipped)_
