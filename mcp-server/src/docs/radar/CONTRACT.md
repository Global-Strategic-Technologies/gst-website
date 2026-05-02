# Input Contract: `search_radar_cache`

> **Tool**: `search_radar_cache` — strict mirror of the `/hub/radar` website page. Reads the locally-cached Inoreader snapshot (`npm run radar:seed`) and returns a unified FYI + Wire feed. Never makes live Inoreader API calls (protects the shared 200 req/day budget — see [`mcp-server/src/content/radar-snapshot.ts`](../../content/radar-snapshot.ts) for the budget invariant).
>
> **Sources of truth** (the contract cites these; it does not duplicate them):
>
> - **Validation**: [`mcp-server/src/tools/radar-cache.ts`](../../tools/radar-cache.ts) — `SearchRadarCacheInputSchema` (single optional `category` field)
> - **Category enum**: [`mcp-server/src/content/radar-snapshot.ts`](../../content/radar-snapshot.ts) — `RADAR_CATEGORIES` const tuple, `RadarCategory` type
> - **URL encoder**: [`src/utils/radar-url.ts`](../../../../src/utils/radar-url.ts) — `serializeToParams` / `deserializeFromParams`. Imported by both the website page (`src/components/radar/CategoryFilter.astro` hydrates / syncs) and the MCP wrapper (`buildRadarDeeplink`); single source of truth for radar URL state.
> - **Cache reader**: [`mcp-server/src/content/radar-snapshot.ts`](../../content/radar-snapshot.ts) — `readFyiSnapshot()`, `readWireSnapshot()`, `SNAPSHOT_MISSING_MESSAGE`. Cache TTL is 24h ([`src/lib/inoreader/cache.ts:18`](../../../../src/lib/inoreader/cache.ts#L18)).
>
> **Used by prompts** (BL-031.75): [`gst_radar_brief_today`](../../prompts/radar-brief-today.ts) (daily / pre-meeting digest of recent annotated FYI items, summarized in the GST Take voice). The prompt's argsSchema mirrors the same single `category` filter. Earlier versions accepted a `sinceHours` argument; removed in BL-031.95 Phase 3.A under the capability-mirror invariant — see [Capability-mirror invariant](#capability-mirror-invariant) below.
>
> **Version**: `v1` | **Last authored**: 2026-05-02
>
> **Registry**: see [`../contracts/README.md`](../contracts/README.md) for the "what is an input contract" narrative, the cross-tool registry, and the per-tool spec template.

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
  snapshotInfo: {
    fyiLastSeededAt: string | null,
    wireLastSeededAt: string | null,
  },
  deeplink: string,               // e.g. "https://globalstrategic.tech/hub/radar?category=pe-ma"
}
```

**Sort order**: `publishedAt` newest-first across the unified FYI + Wire set. Matches the website's natural feed order via `mergeFeed()` in `RadarFeed.astro`.

**Deeplink**: a URL that opens `/hub/radar` with the category filter pre-applied (matching the user's input). Empty input emits a bare `/hub/radar` URL (no query string).

**Snapshot-missing path**: when `.cache/inoreader/` is missing or empty, the response is `{ isError: true, content: [{ type: 'text', text: SNAPSHOT_MISSING_MESSAGE }] }` — the message instructs the caller to run `npm run radar:seed`. No stack traces leak; engineering-correctness verified by `mcp-server/tests/integration/radar-cache-handler.test.ts`.

---

## Capability-mirror invariant

**The MCP tool's input schema mirrors the website's filter UI exactly.**

The `/hub/radar` page surfaces a single filter (the `category` pill row in [`src/components/radar/CategoryFilter.astro`](../../../../src/components/radar/CategoryFilter.astro)). Pre-BL-031.95-Phase-3.A, the MCP tool accepted `query`, `tier`, `since`, and `limit` fields with no website counterpart; those were removed under the capability-mirror invariant in commit `21e86c8`. The reasons:

1. **`query` (free-text)**: the website has no search box. The cache is small enough that filtering by category alone is sufficient.
2. **`tier` (`fyi` | `wire`)**: the website renders a unified feed via `mergeFeed(fyi, wire)`. There's no website surface to deep-link into a tier-specific view; the MCP Resources `gst://radar/fyi/latest` and `gst://radar/wire/latest` remain available for prompts that need a tier-specific snapshot embedding.
3. **`since` (ISO date)**: the cache itself has a 24h TTL ([`src/lib/inoreader/cache.ts:18`](../../../../src/lib/inoreader/cache.ts#L18)). A `since` filter beyond 24h would filter against items that aren't in the snapshot anyway. The website surfaces no time-window filter — items are sorted by `publishedAt` newest-first, so users naturally see recent items at the top.
4. **`limit` (default 20, max 100)**: the website renders all items in the cache (the cache is small enough that pagination isn't needed). A tool-level `limit` would create a deep-link that doesn't match what the user sees on the page.

**Future extension**: if a real consumer need emerges (e.g., the BL-032 live `search_radar` tool can reach further than 24h, so a `since` filter has new value), grow the website's filter UI **and** the MCP tool's input schema in lockstep. The capability-mirror invariant is the contract; it should never be violated unilaterally on either side.

---

## Hidden semantics

- **Cache TTL bounds the meaningful filter range.** Even though items in `matches[]` carry `publishedAt` timestamps spanning whatever Inoreader's recent feed returned at seed time, the cache itself expires every 24h. Any filter operating on `publishedAt` (none today, but if added) would naturally be bounded to the cache's window.
- **`tier` field on items**: each match in the response carries a `tier: 'fyi' | 'wire'` field telling the consumer which snapshot tier the item came from. This is annotation only — the tool does NOT accept `tier` as an input filter (per the capability-mirror invariant). Consumers can post-filter client-side if needed.
- **`deeplink` is always emitted**, even on the snapshot-missing path? No — the `isError` branch returns just the error text and `isError: true`. The deeplink is only meaningful when there's actual data to land on.

---

## Related

- Tool wrapper: [`mcp-server/src/tools/radar-cache.ts`](../../tools/radar-cache.ts)
- Cache reader: [`mcp-server/src/content/radar-snapshot.ts`](../../content/radar-snapshot.ts)
- URL encoder: [`src/utils/radar-url.ts`](../../../../src/utils/radar-url.ts)
- Live website: <https://globalstrategic.tech/hub/radar>
- Architecture: [BL-031.95 Hub Tools URL State Restoration & MCP Deep-Link Surface](../../../../src/docs/development/MCP_SERVER_HUB_URL_STATE_BL-031_95.md) — Phase 3 (Radar URL state) closure
- Future: [BL-032 (MCP Server — Internal Remote, Phase 2)](../../../../src/docs/development/BACKLOG.md#bl-032-mcp-server--internal-remote-phase-2) — live `search_radar` tool will sit alongside this one; capability-mirror invariant scales to the live tool when its filter surface is decided.
