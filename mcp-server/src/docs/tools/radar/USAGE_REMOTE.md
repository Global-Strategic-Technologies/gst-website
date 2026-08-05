# Usage — `search_radar` + `get_latest_insights`: Live Radar Walkthrough (BL-032 Phase 4c)

End-to-end examples of the **live** radar tools — calling Inoreader directly with an Upstash 6h cache, available over the remote MCP HTTP transport.

> **Sister tool**: [`search_radar_offline`](./USAGE.md) (snapshot-only, stdio-only, dev/CI/budget-exhausted fallback) — same shape, different source.

> **Setup**: this assumes you have remote MCP configured per [`REMOTE_CLIENT_SETUP.md`](../../operations/REMOTE_CLIENT_SETUP.md). Per-key budgets: 5 calls/min, 50 calls/day for radar tools. The 6h cache amortizes — repeat queries within 6h hit the cache, not Inoreader.

---

## Scenario 1: live category brief

You're on a partner call about a portfolio company in enterprise SaaS. The conversation pivots to "is the rest of the market still consolidating?" — you need a 60-second read on TODAY's signals, not last week's snapshot.

### What you type

> _"Pull the latest radar items in enterprise-tech. Give me a quick read on what's hot right now."_

Claude calls `mcp__gst__search_radar` with `{ category: 'enterprise-tech' }`. The tool:

1. Checks the radar circuit breaker (Upstash key `mcp:radar:circuit-open`). Closed → proceed. Open → serve the cached snapshot only, flagged `degraded` (see below).
2. Reads `mcp:radar:cache:wire` and `mcp:radar:cache:fyi` from Upstash. Cache hit → return cached items. Cache miss → fall through.
3. On cache miss, fetches `tag/list` + parallel folder streams from Inoreader (5 fetches total: 1 tags + 4 GST folders) plus the annotated stream (1 more fetch). 6 Inoreader requests against the per-key 5/min budget — straddles the cliff, so use sparingly during burst-prep windows.
4. Transforms `InoreaderItem` → `SnapshotItem` (same shape `search_radar_offline` emits — capability mirror).
5. Writes results to Upstash with 6h TTL.
6. Filters by `category` and sorts newest-first.

### What you get back

```typescript
{
  matches: [
    { id, title, url, source, category, publishedAt, summary, annotation?, tier },
    // ...
  ],
  totalMatched: number,
  returned: number,           // after the wire bound; < totalMatched means truncated (BL-109)
  liveInfo: {
    wireFetchedAt: '2026-05-04T18:30:00.000Z',
    wireCacheHit: false,      // FALSE on first call within 6h, TRUE thereafter
    fyiFetchedAt: '2026-05-04T18:30:00.000Z',
    fyiCacheHit: false,
  },
  deeplink: 'https://globalstrategic.tech/hub/radar?category=enterprise-tech',
}
```

The `liveInfo.cacheHit` flags let an agent (or curious analyst) reason about freshness — `false` means we just hit Inoreader; `true` means the data is up to 6h old. `liveInfo.degraded` (BL-091) says _why_ it's cached: `true` means the circuit breaker is open and no upstream call was permitted. A tier with nothing cached reports `null` for its `fetchedAt`/`cacheHit`.

### Iteration

Same call patterns as the offline tool's [USAGE.md](./USAGE.md) — pivot category, drop filter, all-categories digest. Each within-cache-window call is sub-100ms (Upstash REST roundtrip).

---

## Scenario 2: pre-meeting FYI digest

You want the highest-signal annotated items for tomorrow morning's stand-up — no analytical depth, just "what's GST flagging this week."

### What you type

> _"Give me the 5 most recent FYI items across all categories."_

Claude calls `mcp__gst__get_latest_insights` with `{ limit: 5 }`. The tool:

1. Circuit breaker check (same as `search_radar`).
2. Reads `mcp:radar:cache:fyi` from Upstash. Cache hit common — `get_latest_insights` and `search_radar` share the cache key, so a recent `search_radar` call populates this for free.
3. On cache miss, fetches the annotated stream from Inoreader (1 request).
4. Filters to FYI items (pre-filtered — `get_latest_insights` only ever queries the annotated stream), applies optional `category` filter, slices to `limit`.

### What you get back

```typescript
{
  items: [
    { id, title, url, source, category, publishedAt, summary, annotation, tier: 'fyi' },
    // ... up to `limit` items
  ],
  returned: 5,
  liveInfo: { fetchedAt, cacheHit },
}
```

Each item carries `annotation.highlightedText` (the GST highlight) + `annotation.gstTake` (the GST Take voice) — the model can paraphrase or quote directly into the digest.

### Why it's a separate tool from `search_radar`

`get_latest_insights` is a "convenience signal" surface — when an analyst (or agent) wants the high-signal FYI tier without composing filter args. `search_radar` is the "full surface" call. They share the underlying cache to avoid duplicate Inoreader fetches.

---

## Scenario 3: agent fan-out with circuit-breaker safety

A consultant prompt orchestrates `search_radar` four times in a row (one per category) for a comprehensive across-categories digest. Each call counts against the per-key 5/min budget, but the 6h cache means the second through fourth calls within the same minute hit cache and don't touch Inoreader.

### Cliff scenario

What if Inoreader hits its own 200/day budget mid-fan-out? Sequence:

1. Call 1 (`pe-ma`): cache miss → 6 Inoreader requests → success → writes to cache
2. Call 2 (`enterprise-tech`): cache HIT (search_radar shares cache with itself across categories — same underlying wire+fyi) → 0 Inoreader requests → success
3. Call 3 (`ai-automation`): cache HIT → success
4. Call 4 (`security`): cache HIT → success

Total: 6 Inoreader requests for a 4-category digest, well within the 5/min radar tier. The 6h cache makes a second across-categories digest within the same window cost 0 Inoreader requests.

### When the breaker DOES open

If GST's overall Inoreader budget is exhausted (cron snapshots + ISR + multiple analysts hammering radar tools), Inoreader returns 429. The first radar tool to see this:

1. Receives `inoreader-rate-limit` from `radar-live-store`
2. Calls `openCircuit(env, 'inoreader-429')` — sets `mcp:radar:circuit-open` in Upstash with 6h TTL
3. Returns an `isError: true` envelope with `reason: 'inoreader-rate-limit'`

Subsequent radar tool calls (any key, any category) within the next 6h:

1. Read the breaker flag from Upstash → open
2. **Read the cached snapshot only** — never Inoreader
3. If there is cached data: return it normally, with `liveInfo.degraded: true` and `retryAfterSeconds`. `search_radar` succeeds if **either** tier has cache; a tier with nothing cached reports `null` for its `fetchedAt`/`cacheHit`
4. Only if nothing at all is cached: return the `isError: true` envelope with `error: 'service-unavailable'`, `status: 503`, `retryAfterSeconds: <ttl-remainder>` in **`structuredContent`** (0.43.0 / BL-090 — previously this JSON was serialized into `content[0].text`; `cause` carries the breaker's trip reason)

So in the common case a breaker-open window is a _degradation_ (up to 6h-old data), not an outage. The same rule applies to the `gst://radar/*` Resources and the website's `/radar/snapshot` endpoint (BL-091).

Non-radar tools (diligence, portfolio, ICG, etc.) are unaffected.

### Recovery

The breaker auto-closes via TTL expiry. Note that **nothing refreshes the radar cache while it is open** — that's deliberate (it's what protects the budget), but it means an early Inoreader recovery is not picked up automatically; the snapshot simply keeps aging until the TTL lapses. There is no half-open probe: see [`RATE_LIMITS.md` § Circuit breaker](../../operations/RATE_LIMITS.md) for why a naive one can make outages _longer_. To recover sooner, use [`RATE_LIMITS.md` § Circuit-breaker manual reset](../../operations/RATE_LIMITS.md#circuit-breaker-manual-reset).

---

## Failure-mode reference

| Symptom in MCP error envelope                   | What it means                                         | What to do                                                                           |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `error: "config-missing"`                       | Worker doesn't have `INOREADER_APP_ID/_KEY` set       | Operator: `wrangler secret put` per `AUTH.md`                                        |
| `error: "token-missing"`                        | OAuth access token not in Upstash AND no env fallback | Same — operator wires Inoreader creds                                                |
| `error: "token-stale"`                          | Inoreader returned 401                                | Wait for the website's next ISR call to refresh; retry the Worker call after that    |
| `error: "inoreader-rate-limit"`                 | Inoreader returned 429; circuit breaker just opened   | Wait for `Retry-After` (~6h); use `search_radar_offline` if you have local stdio MCP |
| `error: "service-unavailable"`, `status: 503`   | Breaker open **and** nothing cached to serve          | Wait for `retryAfterSeconds`; same offline-tool fallback applies                     |
| _Success_ with `liveInfo.degraded: true`        | Breaker open; you got the cached snapshot, not live   | Usually nothing — data is real, up to 6h old (`fetchedAt` gives age)                 |
| `error: "upstream-error"` / `"network-timeout"` | Other Inoreader failure (5xx, timeout)                | Transient — retry. If sustained, escalate to operator                                |

Each envelope includes a `message` field with a human-readable explanation; agents parse the `error` field for branching.

---

_Last updated: 2026-05-04 (Phase 4c)_
