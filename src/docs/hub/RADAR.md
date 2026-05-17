# GST Radar: Curated Intelligence Feed

## Overview

The Radar is a curated intelligence feed on the GST Strategic Intelligence Hub at `/hub/radar`. It aggregates technology and M&A news from practitioner-grade sources, layered with editorial commentary.

**URL:** `https://globalstrategic.tech/hub/radar`

## Architecture

### Content Tiers

| Tier | Name     | Source                                         | Effort           | Value                   |
| ---- | -------- | ---------------------------------------------- | ---------------- | ----------------------- |
| 1    | The Wire | Automated RSS via Inoreader folders            | Zero per item    | Source curation signal  |
| 2    | FYI      | Inoreader annotated items (highlights + notes) | Seconds per item | Practitioner commentary |

Both tiers render in a **single unified feed**, sorted chronologically (FYI by annotation date, Wire by publish date). FYI items retain their visual distinction (expandable, category tag, GST Take) but appear inline among Wire items.

### Rendering Model

- **Radar page** (`/hub/radar`): Server-rendered with Vercel ISR (6-hour cache)
- **RadarFeed**: Loaded as an Astro **server island** (`server:defer`) — the page shell (header, category filter, footer) renders instantly while the feed streams in asynchronously
- **RadarFeedSkeleton**: Placeholder shown in the server island's `slot="fallback"` while feed data loads — renders 6 pulsing skeleton items mimicking wire-item layout
- **All other pages**: Unchanged, remain fully static

### Data Flow

```
Inoreader API ──► MCP Worker (mcp.globalstrategic.tech)
                  • OAuth refresh (single-flight)
                  • /radar/snapshot endpoint (resource:radar:read scope)
                  • cron pre-warm every 6h (cron/radar-refresh.ts)
                       │
                       ▼
                  RadarFeed server island (Vercel SSR)
                       │
                       ▼
                  Vercel ISR cache (6h) ──► Visitors
```

The website is a downstream consumer of the MCP Worker, not a parallel Inoreader caller (BL-032.8 Phase B, 2026-05-17). All Inoreader budget protections (rate-limit, breaker, day-counter, 429 header observability) apply to website traffic automatically.

No GitHub Action crons. No auto-committed JSON files. No manual rebuilds for feed content.

### Timestamp

The "Updated" timestamp in the page header (`RadarHeader.astro`) displays the server render time in the **America/Santiago** (Chile) timezone, regardless of where the Vercel edge function executes. This uses `toLocaleDateString('en-US', { timeZone: 'America/Santiago', ... })`.

## Environment Variables

Set in Vercel project settings and local `.env`:

| Variable                 | Purpose                                                                                                | Source                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `MCP_KEY_WEBSITE_RADAR`  | **Required** — Bearer for MCP Worker `/radar/snapshot` endpoint                                        | `wrangler secret put` on the Worker; mirrored as a Vercel env var here. Same value bound on both sides. |
| `MCP_RADAR_SNAPSHOT_URL` | Optional override of the MCP endpoint URL (default: `https://mcp.globalstrategic.tech/radar/snapshot`) | Vercel env (typically only set on preview deploys targeting `mcp-staging.globalstrategic.tech`)         |

**To configure on Vercel**:

```bash
# From the website repo (not mcp-server):
vercel env add MCP_KEY_WEBSITE_RADAR
# Paste the SAME value you used on `wrangler secret put MCP_KEY_WEBSITE_RADAR`.
# Apply to: production, preview, development.
```

The website holds **no** Upstash bindings post-BL-032.8 Phase B — all radar state lives on the MCP Worker. If Vercel's Upstash integration still appears in **Storage** with `KV_REST_API_*` env vars surfaced on the project, they're inert (unused by any source file). You can safely disconnect the integration; the `gst-radar-tokens` database it pointed at was decommissioned in the same Phase B batch (see [`mcp-server/src/docs/operations/DEPLOY.md` § C.13](../../../mcp-server/src/docs/operations/DEPLOY.md)).

## Inoreader Setup (operator reference — Worker-side credentials)

Inoreader OAuth state lives entirely on the MCP Worker post-BL-032.8 Phase B. The website has no Inoreader account / app / token. The setup procedure below is the Worker operator's responsibility; documented here for cross-system reference.

### Prerequisites

- Inoreader Pro plan (~$7.50/month)
- Register app at https://www.inoreader.com/developers/

### OAuth Setup (Worker operator)

OAuth tokens are bound on the Worker via `wrangler secret put INOREADER_APP_ID`, `INOREADER_APP_KEY`, and the initial-seed `INOREADER_ACCESS_TOKEN` / `INOREADER_REFRESH_TOKEN`. After bootstrap, the Worker's `inoreader-oauth.ts` module refreshes tokens autonomously and persists to the MCP DB. See [`mcp-server/src/docs/operations/DEPLOY.md`](../../../mcp-server/src/docs/operations/DEPLOY.md) for the full operator runbook.

### Folder Organization

Create folders in Inoreader prefixed with `GST-`:

| Folder                | Category        | Content                          |
| --------------------- | --------------- | -------------------------------- |
| `GST-PE-MA`           | PE & M&A        | Deal activity, fund strategies   |
| `GST-Enterprise-Tech` | Enterprise Tech | Cloud, infrastructure, platforms |
| `GST-AI-Automation`   | AI & Automation | Enterprise AI, ML ops            |
| `GST-Security`        | Security        | Cybersecurity, regulatory        |

### Annotation Workflow (Publishing to FYI)

1. Read an article in Inoreader
2. Highlight a key passage
3. Add a note with practitioner context (becomes "Δ GST Take")
4. Optionally tag with `gst-[category]` for category override

### FYI Content Retention

FYI items have no time-based expiry on the GST side. Visibility is determined by a **most-recent-N window**:

- The Radar fetches the **30 most recent** annotated items from Inoreader each ISR cycle
- An item remains visible until it falls outside that top-30 window (i.e., 30+ newer annotations push it off)
- Removing annotations (highlights/notes) in Inoreader also removes the item
- There is up to a **6-hour stale window** between an item leaving the API and disappearing from the page (due to ISR cache)

## Page UX Features

### Unified Feed

FYI and Wire items render in a single chronological feed below the category filter. The `mergeFeed()` helper in `transform.ts` combines both tiers, sorting FYI items by `annotatedAt` and Wire items by `publishedAt`.

Individual FYI items use native `<details>`/`<summary>` for expand/collapse of their summary, highlight, and GST Take content.

### Category Filter with Gravity Spacing

The category filter pills (`CategoryFilter.astro`) use a gravitational spacing effect:

- Pills are center-justified with `justify-content: center`
- A client-side script computes each button's normalized distance from center (`--d`: 0 at center, 1 at edges)
- CSS uses `--d` squared to calculate horizontal margin: `calc(var(--spacing-xs) + var(--d) * var(--d) * 1.6rem)`
- Center buttons cluster tightly together; edge buttons have progressively wider spacing
- On mobile (< 480px), pills switch to horizontal scroll with uniform spacing

## File Structure

```
src/
├── components/radar/
│   ├── RadarHeader.astro         # Page header with breadcrumb + Santiago timestamp
│   ├── RadarFeed.astro           # Server island — fetches and renders unified feed
│   ├── RadarFeedSkeleton.astro   # Skeleton placeholder while server island loads
│   ├── FyiItem.astro             # Collapsible FYI item with GST Take
│   ├── WireItem.astro            # Compact wire feed item
│   └── CategoryFilter.astro     # Client-side filter pills (gravity spacing)
├── lib/inoreader/
│   ├── types.ts                  # TypeScript interfaces (RadarFyiItem, RadarWireItem, ...)
│   └── transform.ts             # MCP-snapshot adapters + CATEGORIES + mergeFeed
├── pages/hub/radar/
│   └── index.astro               # Main Radar page (SSR + ISR + unified feed)
scripts/
└── inoreader-auth.mjs           # OAuth setup helper
```

## Token Management (Worker-side)

Inoreader OAuth state is now owned end-to-end by the MCP Worker (BL-032.8 Phase B, 2026-05-17). The website holds no OAuth state, runs no refresh logic, and does not write to any `inoreader:*` Upstash namespace. The Worker:

- Stores tokens in the MCP Upstash DB under `mcp:inoreader:access_token` (TTL: `expires_in − 60s`) and `mcp:inoreader:refresh_token` (no TTL)
- Refreshes proactively on the 6h cron tick (TTL-watch) and reactively on Inoreader 401 (single-flight via `mcp:inoreader:refresh-lock`, 10s SET-NX-EX)
- Mints new tokens via `node scripts/inoreader-auth.mjs setup` when the refresh chain itself dies — operator runbook: [`mcp-server/src/docs/operations/DEPLOY.md` § C.5 — Inoreader budget recovery](../../../mcp-server/src/docs/operations/DEPLOY.md)

The legacy `gst-radar-tokens` Upstash database (which held `inoreader:*` keys when the website was the refresh-writer) was decommissioned in the same Phase B operator batch. See DEPLOY.md § C.13 for the cleanup walkthrough.

## Dev-Mode API Cache

### Why It Exists

Inoreader enforces a **200 requests/day** rate limit (100/zone x 2 zones). Each Radar page load makes ~7 API calls (1 annotated items + 1 tag list + ~5 folder streams). During local development, hot reloads and page refreshes can exhaust this budget in under 15 page loads, resulting in **429 Too Many Requests** errors and a blank Radar feed.

Production is unaffected (ISR revalidates every 6 hours = ~28 calls/day), but the dev and production environments share the same API credentials and rate limit bucket.

### Budget envelope (post-BL-032 Phase 4c)

The 200 req/day Inoreader budget is now shared across three production surfaces:

| Surface                                                            | Per-day consumption (typical)                | Notes                                                                                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Website ISR** (`/hub/radar`)                                     | ~28 calls (4 ISR revalidations × 7 calls)    | Vercel-hosted. Cache TTL 6h.                                                                                                                                                              |
| **MCP Worker — `search_radar` + `get_latest_insights` (Phase 4c)** | ≤50 per team-member-key, capped at the cliff | Per-key 5/min and 50/day rate limit. 6h Upstash cache (`mcp:radar:cache:*`) amortizes — repeat calls within the window cost 0 Inoreader requests. Circuit breaker opens on Inoreader 429. |
| **BL-032.5 Cron snapshot refresh** (planned)                       | ~24 calls (4 categories × hourly)            | Worker Cron Trigger. Lands when [BL-032.5](../development/MCP_SERVER_REMOTE_RESOURCES_PROMPTS_BL-032_5.md) ships Resources-over-HTTP.                                                     |

**Combined ceiling at typical usage**: 28 + (3 active analysts × ~10 cache-aware calls each) + 24 ≈ 80/day, well under 200. **Combined ceiling at agent-loop pathological usage**: 28 + (10 keys × 50/day cap) + 24 = 552/day → would tip the budget. The per-key caps + 6h cache + circuit breaker are what keep this bounded; if usage ever pushes the envelope, escalate to Inoreader's paid tier.

### How It Works

When `import.meta.env.DEV` is true (local dev server only), the API client in `src/lib/inoreader/client.ts` checks a file cache before making real API calls:

1. Before each API call, the client checks `.cache/inoreader/` for a cached response
2. Cache files are keyed by function name + parameters (SHA-256 hash)
3. If a valid cache file exists (< 24 hours old), it is returned immediately — no API call made
4. If no cache exists or it has expired, the real API call proceeds and the response is stored

Cache logic lives in `src/lib/inoreader/cache.ts`.

### Cache Location & Cleanup

- **Directory**: `.cache/inoreader/` (project root, gitignored)
- **TTL**: 24 hours (hardcoded)
- **Manual clear**: Delete the `.cache/` directory to force fresh API calls on next page load
- **Production**: Cache is completely bypassed — `import.meta.env.DEV` is `false` in Vercel builds

### Console Output

During dev, the cache logs its behavior to the terminal:

```
[Radar] Dev cache hit: fetchAnnotatedItems        # using cached response
[Radar] Dev cache stored: fetchAllStreams          # fresh response saved
```

## Working Offline / Rate-Limited Development

The website no longer holds an Inoreader cache (post-BL-032.8 Phase B). For offline radar development, point Vercel preview deploys / `npm run dev` at the staging MCP Worker by setting `MCP_RADAR_SNAPSHOT_URL=https://mcp-staging.globalstrategic.tech/radar/snapshot` in your local `.env`. The Worker keeps the snapshot warm via its own cron-driven cache (`mcp:radar:cache:wire` / `:fyi` in the MCP Upstash DB, 6h TTL); offline-tool fixtures live in `mcp-server/tests/fixtures/radar-mock-data.ts` and the corresponding `search_radar_offline` MCP tool covers the no-network case.

## E2E Test Mocking

E2E tests against `/hub/radar` rely on the production / staging MCP Worker's `/radar/snapshot` endpoint (already cron-warmed). Playwright's global-setup and global-teardown are intentionally no-ops post-Phase-B — there's no website-side cache to seed or clear. Set `MCP_KEY_WEBSITE_RADAR` in the Playwright env when running E2E tests so the Astro dev server's SSR fetch authenticates against the Worker.

## Vercel Caching & ISR Details

### How ISR Works for the Radar

The Radar page uses **Incremental Static Regeneration** configured in `astro.config.mjs`:

```js
adapter: vercel({
  isr: {
    expiration: 60 * 60 * 6, // 6 hours (21,600 seconds)
  },
});
```

Because the page sets `export const prerender = false`, Astro delegates it to a Vercel serverless function (`_isr.func`) rather than generating static HTML at build time.

### Cache Lifecycle

1. **First request after deploy** — Vercel invokes the ISR function:
   - Fetches Wire items from Inoreader API (up to 30 across `GST-` folders)
   - Fetches FYI items from Inoreader annotated stream (up to 30)
   - Renders full HTML and **caches the result for 6 hours**
2. **Requests within 6 hours** — Vercel serves the **cached HTML from CDN**. No serverless function runs, no Inoreader API calls.
3. **First request after 6 hours** — **Stale-while-revalidate** pattern:
   - The visitor **immediately gets the stale cached version** (no wait)
   - Vercel **re-renders the page in the background** with fresh API calls
   - The **next visitor** after the background render completes gets fresh content
4. **If background render fails** — Vercel continues serving the last successfully cached version until the next revalidation attempt.

### What Refreshes When

| Content                | Refresh Trigger   | Frequency               |
| ---------------------- | ----------------- | ----------------------- |
| The Wire (RSS feeds)   | ISR revalidation  | Every 6 hours           |
| FYI (annotated items)  | ISR revalidation  | Every 6 hours           |
| Static assets (JS/CSS) | Vercel deployment | Immutable, 1-year cache |

### Vercel Routing

Vercel generates routing rules that send `/hub/radar` requests to the ISR function:

```
/hub/radar → /_isr?x_astro_path=/hub/radar
```

The prerender config (`.vercel/output/functions/_isr.prerender-config.json`) sets:

- `expiration: 21600` (6 hours)
- `allowQuery: ["x_astro_path"]`
- `passQuery: true`

## Error Handling

The website's failure modes shrink to MCP-Worker-call failures (post-BL-032.8 Phase B):

- **MCP Worker reachable, snapshot OK**: feed renders normally
- **MCP Worker returns 5xx / tier-failed envelope**: that tier renders empty; the other tier renders if its envelope is OK
- **MCP Worker unreachable / fetch throws**: feed renders empty with the SSR fallback message; ISR cache continues serving the last good page until next revalidation
- **`MCP_KEY_WEBSITE_RADAR` unbound** (preview deploys with no Vercel env): feed renders empty + warning logged; the page shell still renders

All upstream Inoreader concerns (token refresh, 429 handling, OAuth recovery) live on the Worker — see [`mcp-server/src/docs/operations/DEPLOY.md` § C.5 — Inoreader budget recovery](../../../mcp-server/src/docs/operations/DEPLOY.md).

### `[Radar]` log messages (Vercel serverless / dev console)

Emitted from [`src/components/radar/RadarFeed.astro`](../../components/radar/RadarFeed.astro):

| Log message                                                  | Severity | Meaning                                                                                                                                                                                   |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[Radar] MCP_KEY_WEBSITE_RADAR is not bound on the env. ...` | Warn     | Bearer key missing — set the Vercel env var (see § Environment Vars)                                                                                                                      |
| `[Radar] MCP /radar/snapshot returned {status} {statusText}` | Error    | Worker rejected the request — check status: 401 = bearer wrong; 403 = scope mismatch; 503 = breaker open or rate-limit; 5xx = Worker incident                                             |
| `[Radar] FYI tier failed: {reason} {message}`                | Error    | Worker delivered the response but `snapshot.fyi.ok === false` — `reason` is one of the Worker's failure-taxonomy reasons (`token-stale`, `inoreader-rate-limit`, `inoreader-error`, etc.) |
| `[Radar] Wire tier failed: {reason} {message}`               | Error    | Same as above but for the Wire tier — tiers fail independently                                                                                                                            |
| `[Radar] MCP /radar/snapshot fetch threw: {error}`           | Error    | Network-level failure (DNS, TLS, timeout) — Worker may be down or the URL is misconfigured                                                                                                |

**View in production**: Vercel Dashboard → your project → Logs → filter on `_isr` function + search `[Radar]`.

### Troubleshooting playbook

**Symptom: `/hub/radar` shows the empty fallback in production**

1. `curl -i https://mcp.globalstrategic.tech/health` — Worker reachable?
   - Non-200 / timeout → Worker incident; check Cloudflare status + `mcp-server/src/docs/operations/DEPLOY.md` § C.6
2. `curl -H "Authorization: Bearer $MCP_KEY_WEBSITE_RADAR" https://mcp.globalstrategic.tech/radar/snapshot | jq .` — does the Worker return both tiers OK?
   - `wire.ok === false` or `fyi.ok === false` → check the `reason` field; map to Worker recovery path
3. Check Vercel logs for `[Radar]` lines (above table) — if missing entirely, the SSR fetch never ran (likely missing `MCP_KEY_WEBSITE_RADAR` env var)

**Symptom: Page crashes / 500 error**

The radar code path doesn't throw on Worker failures (it returns empty arrays). A 500 from `/hub/radar` means an unrelated bug in the layout or middleware — check the Vercel function stack trace.

**Symptom: Content is stale (not updating)**

1. Content refreshes every 6 hours via ISR — wait for the next cycle
2. To force a refresh: trigger a redeployment from Vercel dashboard

## Unit Test Coverage

### API Client Tests (`tests/unit/radar-client.test.ts`)

25 tests covering the fetch layer with `configOverride` injection (bypasses `getConfig()`):

- `fetchAnnotatedItems` — URL construction, headers, success/failure, query params
- `fetchFolderStream` — URL encoding, success/failure, query params
- `fetchAllStreams` — Tag discovery, prefix filtering, dedup, sort, partial failures
- Token refresh on 401 — Refresh attempt, retry with new token, refresh failure, missing refresh token

### KV Persistence Tests (`tests/unit/radar-kv-persistence.test.ts`)

18 tests covering the Upstash Redis token persistence layer. These call public functions **without** `configOverride` to exercise the real `getConfig()` → `loadTokensFromKV()` → `getRedis()` code path.

| Group                  | Tests | What's Covered                                                                                                            |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| KV Token Loading       | 6     | Token priority chain (in-memory > Redis > env), one-time load flag, env var fallback, exhausted sources                   |
| Persistence on Refresh | 4     | Save both tokens on 401 refresh, skip when no refresh_token returned, in-memory cache update, KV write failure resilience |
| Graceful Degradation   | 3     | Redis read failure, Redis write failure, cached null instance reuse                                                       |
| resetTokenCache        | 1     | Full state reset triggers fresh KV reload (simulates new serverless invocation)                                           |
| Edge Cases             | 3     | `UPSTASH_REDIS_REST_*` fallback env var names, 30-day TTL verification, correct Redis key names                           |

**Mocking strategy:**

- `@upstash/redis` is mocked at module level via `vi.mock()` — constructor and `get`/`set` methods are individually controllable
- `import.meta.env` properties are set directly on the env object per test (with save/restore in `beforeEach`/`afterEach`)
- Global `fetch` is stubbed to return controlled responses
- Console spies are managed via `afterEach` cleanup to prevent leak on assertion failure

```bash
npm run test:run                                           # All tests (581)
npx vitest run tests/unit/radar-client.test.ts             # API client only (25)
npx vitest run tests/unit/radar-kv-persistence.test.ts     # KV persistence only (18)
```

## Category Inference

Priority order:

1. Explicit `gst-*` tag on the Inoreader item
2. GST-\* folder membership
3. Keyword matching from article title
4. Default: `enterprise-tech`
