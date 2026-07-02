---
tool: search_radar_offline
version: v1
lastAuthored: 2026-05-02
schema: mcp-server/src/tools/radar-offline.ts
enumParity:
  - tableHeading: '`category`'
    schemaExport: mcp-server/src/content/radar-transform.ts#RADAR_CATEGORIES
---

# Input Contract: `search_radar_offline`

> **Tool**: `search_radar_offline` (renamed from `search_radar_cache` in [BL-032 Phase 4b](../../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited)) — strict mirror of the `/hub/radar` website page. Reads the locally-cached Inoreader snapshot (`npm run radar:seed`) and returns a unified FYI + Wire feed. Never makes live Inoreader API calls (protects the shared 200 req/day budget — see [`mcp-server/src/content/radar-snapshot.ts`](../../../content/radar-snapshot.ts) for the budget invariant).
>
> **Sister tool — same shape, different source**: `search_radar` (live, Inoreader-touching, remote-MCP-only) — ships under [BL-032 Phase 4c](../../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#phase-4--inoreader-client-refactor--live-radar-tools-15-2-days). The "Live tool surface (BL-032)" section below documents the live tool's contract once it lands.
>
> **Deprecated alias**: `search_radar_cache` is registered as a one-release deprecated alias that tail-calls this implementation. Removed in `mcp-server@0.2.0` per [`mcp-server/BREAKING_CHANGES.md`](../../../../BREAKING_CHANGES.md).
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`mcp-server/src/tools/radar-offline.ts`](../../../tools/radar-offline.ts) — `SearchRadarOfflineInputSchema` (single optional `category` field)
> - **Category enum**: [`mcp-server/src/content/radar-snapshot.ts`](../../../content/radar-snapshot.ts) — `RADAR_CATEGORIES` const tuple, `RadarCategory` type
> - **URL encoder**: [`src/utils/radar-url.ts`](../../../../../src/utils/radar-url.ts) — `serializeToParams` / `deserializeFromParams`. Imported by both the website page (`src/components/radar/CategoryFilter.astro` hydrates / syncs) and the MCP wrapper (`buildRadarDeeplink`); single source of truth for radar URL state.
> - **Cache reader**: [`mcp-server/src/content/radar-snapshot.ts`](../../../content/radar-snapshot.ts) — `readFyiSnapshot()`, `readWireSnapshot()`, `SNAPSHOT_MISSING_MESSAGE`. The offline snapshot has no live TTL — its freshness is whenever `npm run radar:seed` last ran. (The live tools cache separately: `RESOURCE_TTL_SECONDS.RADAR` for Resources and a 6h Upstash store for `readFyiLive` / `readWireLive`.)
>
> **Used by prompts** (BL-031.75): [`gst_radar_brief_today`](../../../prompts/radar-brief-today.ts) (daily / pre-meeting digest of recent annotated FYI items, summarized in the GST Take voice). The prompt's argsSchema mirrors the same single `category` filter. Earlier versions accepted a `sinceHours` argument; removed in BL-031.95 Phase 3.A under the capability-mirror invariant — see [Capability-mirror invariant](#capability-mirror-invariant) below.
>
> **Version**: `v1` | **Last authored**: 2026-05-02
>
> **Registry**: see [`../contracts/README.md`](../README.md) for the "what is an input contract" narrative, the cross-tool registry, and the per-tool spec template.

---

## Field overview

| Field      | Type                                                                | Cardinality | Required | Default          |
| ---------- | ------------------------------------------------------------------- | ----------- | -------- | ---------------- |
| `category` | enum: `pe-ma` \| `enterprise-tech` \| `ai-automation` \| `security` | single      | no       | _none_ (= "all") |

The empty input `{}` returns the full unified feed (every category, FYI + Wire interleaved). Supplying `category` filters to that category only. The schema accepts no other fields — see [Capability-mirror invariant](#capability-mirror-invariant).

---

## Per-field detail

### `category`

- **Display label**: Category
- **What it asks**: Which radar topic to filter to.
- **Valid values**:

| ID                | Maps to (Inoreader folder) | Notes                                                    |
| ----------------- | -------------------------- | -------------------------------------------------------- |
| `pe-ma`           | `GST-PE-MA`                | Private equity / M&A coverage                            |
| `enterprise-tech` | `GST-Enterprise-Tech`      | Enterprise software trends (cloud, SaaS, infrastructure) |
| `ai-automation`   | `GST-AI-Automation`        | AI / ML developments and automation tooling              |
| `security`        | `GST-Security`             | Security, compliance, breach disclosures                 |

The four categories mirror exactly the four filter pills on `/hub/radar` and the four `GST-`-prefixed Inoreader folders the seed script ingests.

**Downstream effect**: When supplied, only items where `item.category === category` appear in the response's `matches[]`. When omitted, all categories are returned.

---

## Output shape (return value)

```typescript
{
  matches: Array<SnapshotItem & { tier: 'fyi' | 'wire' }>,
  totalMatched: number,           // === matches.length
  returned: number,               // === matches.length (no limit; mirrors website)
  oldestItemDaysAgo: number | null, // freshness signal; null when matches is empty (BL-031.95)
  snapshotInfo: {
    fyiLastSeededAt: string | null,
    wireLastSeededAt: string | null,
  },
  deeplink: string,               // e.g. "https://globalstrategic.tech/hub/radar?category=pe-ma"
}
```

**`oldestItemDaysAgo`** (BL-031.95 follow-up): rolling 24h-bucketed age of the oldest item in `matches`, or `null` when `matches` is empty. Lets callers (UI badges, MCP agents deciding whether to re-fetch, Sentry alert rules in BL-032.75 Phase 3) see freshness at a glance without scanning every item's `publishedAt`. Boundary semantics: `0` for items 23h59m ago (rolling buckets, not UTC midnight); `0` for future-dated items (clamped, defensive). See [`mcp-server/src/content/radar-transform.ts`](../../../content/radar-transform.ts) `oldestItemDaysAgo` for the helper.

**Sort order**: `publishedAt` newest-first across the unified FYI + Wire set. Matches the website's natural feed order via `mergeFeed()` in `RadarFeed.astro`.

**Deeplink**: a URL that opens `/hub/radar` with the category filter pre-applied (matching the user's input). Empty input emits a bare `/hub/radar` URL (no query string).

**Snapshot-missing path**: when `.cache/inoreader/` is missing or empty, the response is `{ isError: true, content: [{ type: 'text', text: SNAPSHOT_MISSING_MESSAGE }] }` — the message instructs the caller to run `npm run radar:seed`. No stack traces leak; engineering-correctness verified by `mcp-server/tests/integration/radar-offline-handler.test.ts`.

---

## Capability-mirror invariant

**The MCP tool's input schema mirrors the website's filter UI exactly.**

The `/hub/radar` page surfaces a single filter (the `category` pill row in [`src/components/radar/CategoryFilter.astro`](../../../../../src/components/radar/CategoryFilter.astro)). Pre-BL-031.95-Phase-3.A, the MCP tool accepted `query`, `tier`, `since`, and `limit` fields with no website counterpart; those were removed under the capability-mirror invariant in commit `21e86c8`. The reasons:

1. **`query` (free-text)**: the website has no search box. The cache is small enough that filtering by category alone is sufficient.
2. **`tier` (`fyi` | `wire`)**: the website renders a unified feed via `mergeFeed(fyi, wire)`. There's no website surface to deep-link into a tier-specific view; the MCP Resources `gst://radar/fyi/latest` and `gst://radar/wire/latest` remain available for prompts that need a tier-specific snapshot embedding.
3. **`since` (ISO date)**: the offline snapshot is a point-in-time capture (seeded via `npm run radar:seed`). A `since` filter beyond the captured window would filter against items that aren't in the snapshot anyway. The website surfaces no time-window filter — items are sorted by `publishedAt` newest-first, so users naturally see recent items at the top.
4. **`limit` (default 20, max 100)**: the website renders all items in the cache (the cache is small enough that pagination isn't needed). A tool-level `limit` would create a deep-link that doesn't match what the user sees on the page.

**Future extension**: if a real consumer need emerges (e.g., the BL-032 live `search_radar` tool can reach further than 24h, so a `since` filter has new value), grow the website's filter UI **and** the MCP tool's input schema in lockstep. The capability-mirror invariant is the contract; it should never be violated unilaterally on either side.

---

## Hidden semantics

- **The snapshot window bounds the meaningful filter range.** Even though items in `matches[]` carry `publishedAt` timestamps spanning whatever Inoreader's recent feed returned at seed time, the snapshot is a point-in-time capture (refreshed by `npm run radar:seed`). Any filter operating on `publishedAt` (none today, but if added) would naturally be bounded to the snapshot's window.
- **`tier` field on items**: each match in the response carries a `tier: 'fyi' | 'wire'` field telling the consumer which snapshot tier the item came from. This is annotation only — the tool does NOT accept `tier` as an input filter (per the capability-mirror invariant). Consumers can post-filter client-side if needed.
- **`deeplink` is always emitted**, even on the snapshot-missing path? No — the `isError` branch returns just the error text and `isError: true`. The deeplink is only meaningful when there's actual data to land on.

---

## Related

- Tool wrapper: [`mcp-server/src/tools/radar-offline.ts`](../../../tools/radar-offline.ts)
- Cache reader: [`mcp-server/src/content/radar-snapshot.ts`](../../../content/radar-snapshot.ts)
- URL encoder: [`src/utils/radar-url.ts`](../../../../../src/utils/radar-url.ts)
- Live website: <https://globalstrategic.tech/hub/radar>
- Architecture: [BL-031.95 Hub Tools URL State Restoration & MCP Deep-Link Surface](../../../../../src/docs/development/MCP_SERVER_HUB_URL_STATE_BL-031_95.md) — Phase 3 (Radar URL state) closure
- [BL-032 Phase 4b](../../../../../src/docs/development/MCP_SERVER_REMOTE_BL-032.md#q2-search_radar-vs-search_radar_cache--coexistence-replacement-or-capability-mirror-revisited) — `search_radar_cache` rename to `search_radar_offline` (this tool's current name)

---

## Live tool surface (BL-032 Phase 4c)

**Tools**: `search_radar` + `get_latest_insights` — live counterparts to `search_radar_offline`. Calls Inoreader directly with a 6h Upstash cache. Transport-portable (registered in `createServer()`); usable from both the remote Worker and stdio (when the operator binds Inoreader creds locally).

**Implementation**:

- Wrapper: [`mcp-server/src/tools/radar-live.ts`](../../../tools/radar-live.ts)
- Content adapter: [`mcp-server/src/content/radar-live-store.ts`](../../../content/radar-live-store.ts) — Inoreader fetch + Upstash cache (`mcp:radar:cache:wire`, `mcp:radar:cache:fyi`, 6h TTL)
- API client: [`mcp-server/src/lib/inoreader-client.ts`](../../../lib/inoreader-client.ts) — Workers-compatible Inoreader client (Q4 fork-fallback; renamed from `inoreader-worker.ts` in BL-032.8)
- Shared transform: [`mcp-server/src/content/radar-transform.ts`](../../../content/radar-transform.ts) — `InoreaderItem → SnapshotItem` (single source of truth used by both offline + live)
- Circuit breaker integration: [`mcp-server/src/ratelimit/circuit-breaker.ts`](../../../ratelimit/circuit-breaker.ts) — read-side check before fetch + write-side trigger on Inoreader 429

**`search_radar` schema** — same shape as `search_radar_offline` (capability mirror):

```typescript
{ category?: 'pe-ma' | 'enterprise-tech' | 'ai-automation' | 'security' }
```

**`search_radar` response shape**:

```typescript
{
  matches: SnapshotItem[],   // FYI + Wire merged, deduped by URL, sorted newest-first
  totalMatched: number,
  returned: number,
  liveInfo: {
    wireFetchedAt: string,    // ISO 8601
    wireCacheHit: boolean,
    fyiFetchedAt: string,
    fyiCacheHit: boolean,
  },
  deeplink: string,
}
```

**`get_latest_insights` schema** — convenience wrapper, FYI-only:

```typescript
{ limit?: number (1-30, default 10), category?: RadarCategory }
```

**`get_latest_insights` response shape**:

```typescript
{
  items: SnapshotItem[],     // FYI items with annotations populated
  returned: number,
  liveInfo: { fetchedAt: string, cacheHit: boolean },
}
```

**Failure modes** — all return MCP `isError: true` content envelope with structured `error` field:

| `error` value          | HTTP analog | Cause                                       | Breaker side-effect            |
| ---------------------- | ----------- | ------------------------------------------- | ------------------------------ |
| `config-missing`       | 500         | App credentials not bound                   | None                           |
| `token-missing`        | 500         | Access token unavailable                    | None                           |
| `token-stale`          | 401         | Inoreader returned 401 (website refreshes)  | None (token issue, not budget) |
| `inoreader-rate-limit` | 429         | Inoreader returned 429                      | **Opens circuit (6h)**         |
| `upstream-error`       | 5xx         | Other Inoreader 5xx or invalid response     | None                           |
| `network-timeout`      | 504         | fetch threw / aborted (5s timeout)          | None                           |
| `service_unavailable`  | 503         | Circuit breaker already open from prior 429 | None (read-only check)         |

Walkthrough for analysts: [`USAGE_REMOTE.md`](./USAGE_REMOTE.md). Per-key + global rate-limiting reference: [`../operations/RATE_LIMITS.md`](../../operations/RATE_LIMITS.md).
