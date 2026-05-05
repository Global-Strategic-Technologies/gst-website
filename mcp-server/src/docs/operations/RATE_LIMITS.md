# MCP Server Rate Limits

> **Audience**: team-member consumers + operators. Consumers want to know "what budgets do I have, what do response headers tell me, what do I do when rate-limited?" Operators additionally want "how do I tune the limits, where's the Upstash quota envelope, when does the circuit-breaker open?"
>
> **Status**: BL-032 Phase 3 — substrate in place; full enforcement validated in Phase 6 against staging Upstash.
>
> **Architecture & rationale**: [`MCP_SERVER_REMOTE_BL-032.md`](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md) (see Q7 for the limiter-library choice; Phase 3 plan for the budget rationale).

---

## Per-key budgets

Every authenticated request consumes one token from the budgets below. Buckets are **per `keyOwner`** (see [`AUTH.md`](./AUTH.md) — your `MCP_KEY_<INITIALS>` suffix is the bucket identifier). Two team members hammering tools at the same time get independent budgets; one team member can't deny service to another.

| Tool family       | Per-minute (sliding) | Per-day (sliding) | Status                                          |
| ----------------- | -------------------- | ----------------- | ----------------------------------------------- |
| **General tools** | 60                   | 1000              | ✅ Active in Phase 3                            |
| **Radar tools**   | 5                    | 50                | ⏳ Activated in Phase 4 (when radar tools ship) |

**Sliding window** (vs. fixed-bucket): the budget rolls continuously — the 60th request in the past 60 seconds tips you over, regardless of when the prior 59 happened. No "burst at the top of every minute" exploit.

**Why two tiers?** The website's Inoreader account has a 200 req/day budget. The website ISR consumes ~28/day; BL-032.5's Cron-driven snapshot refresh will consume ~24/day. That leaves ~150/day for MCP — split across however many team members use radar tools. The 50/day per-key cap means up to 3 active analysts can run radar tools without anyone hitting the budget alone.

---

## Response headers (RFC 9331)

Every authenticated response (200 OR 429) carries:

| Header                | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `RateLimit-Limit`     | Maximum requests in the active window (60 for general, 1000 for daily, etc.) |
| `RateLimit-Remaining` | Requests left in the active window                                           |
| `RateLimit-Reset`     | Seconds until the active window resets                                       |

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
  "limit": 60,
  "retryAfterSeconds": 30
}
```

The `tier` field tells you which bucket triggered (`"minute"` or `"day"`). For a per-day cap hit, `retryAfterSeconds` can be many hours — sleep until tomorrow.

---

## Circuit breaker (radar-tool-only protection)

Independent of the per-key rate limit, the radar tools share a **global circuit breaker** that opens when upstream Inoreader returns 429 — meaning GST's overall daily budget is exhausted, regardless of which key is calling.

| State      | What happens                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Closed** | Normal operation. Radar tool calls reach Inoreader (with the per-key 5/min cap still active)                                                                            |
| **Open**   | All radar tool calls return `503 Service Unavailable` with a `Retry-After` header. The breaker stays open for 6 hours, then auto-resets. Non-radar tools are unaffected |

**Why 6 hours?** Inoreader's daily budget resets on a rolling 24h window; 6h is a conservative back-off that avoids burning the next day's budget by retrying too aggressively. It also matches the website's ISR cache window — both surfaces converge on the same "stop hammering Inoreader" semantics.

**Phase 3 status**: the read-side check + 503 envelope is wired (every request inspects the breaker before it can hit a radar tool). The write-side trigger (Inoreader 429 → set the flag) lands in Phase 4 when radar tools come online.

503 response body:

```json
{
  "error": "service_unavailable",
  "message": "Radar tools temporarily unavailable — Inoreader budget circuit is open. Retry after 21540 seconds.",
  "retryAfterSeconds": 21540,
  "reason": "inoreader-rate-limit"
}
```

---

## What to do when rate-limited (consumer)

| Symptom                                                         | Reading                                                                    | What to do                                                                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `429` with `tier: "minute"`                                     | You burst-called too fast in the past 60s                                  | Sleep `Retry-After` seconds. If you're an agent author: insert a 1.5s sleep between tool calls — humans rarely click faster than that anyway                                |
| `429` with `tier: "day"`                                        | You consumed the full daily budget                                         | Sleep until midnight UTC (or `Retry-After`, whichever you prefer). If this is happening to you regularly while doing legitimate work, escalate to operator (see below)      |
| `503` from radar tools, with `reason: "inoreader-rate-limit"`   | GST's overall Inoreader budget is exhausted; circuit breaker is open       | Use the offline radar tool (`search_radar_offline` — local stdio only) if you have a local MCP set up too. Otherwise wait the `Retry-After` window (up to 6h)               |
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

Per-key budgets live in [`mcp-server/src/ratelimit/limiter.ts`](../../ratelimit/limiter.ts) as named constants:

```typescript
const PERMINUTE_LIMIT = 60;
const PERDAY_LIMIT = 1000;
```

To adjust: update the constants, redeploy. The change takes effect on the next isolate cold-start (or via `wrangler deploy --env <env>` to force fresh isolates).

**When to consider raising**: a team member doing legitimate analytical work hits 429s repeatedly. **When to consider lowering**: cost / abuse signals (Phase 5 observability dashboards will surface these).

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

The breaker auto-closes after 6 hours via TTL. If Inoreader recovers earlier and you want to manually close the circuit (rare):

```bash
# Connect to Upstash via the CLI or REST API and delete the key:
redis-cli -u $UPSTASH_REDIS_REST_URL DEL mcp:radar:circuit-open
# Or via @upstash/redis console
```

**Don't manually reset reflexively** — if Inoreader is still degraded, you'll just trigger another circuit-open seconds later, burning more budget. Wait for Inoreader's status page to show "operational" first.

### Graceful skip (Upstash unreachable)

When Upstash credentials aren't bound on the Worker `env` (or Upstash is down):

- `createLimiter()` returns null
- The Worker logs `event: 'ratelimit.skipped'` with `reason: 'upstash-not-bound'` and lets the request through
- Phase 5 observability dashboards alert on sustained `ratelimit.skipped` rates — that's the signal Upstash is unreachable, not that limits are misconfigured

This is intentional fail-open — the bearer-token check still gates access. Rate limiting is defense-in-depth; a transient Upstash outage shouldn't take down MCP entirely.

### Phase 4 — radar-tier activation

When [Phase 4 ships radar tools](../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#phase-4--inoreader-client-refactor--live-radar-tools-15-2-days), the limiter gains a third `Ratelimit` instance scoped to `mcp:ratelimit:radar:*` keys with the 5/min and 50/day caps. The Worker pre-parses the MCP request body to determine if a radar tool is being called; if yes, both general AND radar buckets get checked.

The general tier still applies to radar calls — they count toward the general 60/min, 1000/day allowance too. The radar tier is **additive** (a stricter parallel constraint), not replacement.

---

_Last updated: 2026-05-04 (Phase 3)_
