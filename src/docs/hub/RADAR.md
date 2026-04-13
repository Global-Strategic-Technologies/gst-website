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
Inoreader API ──► RadarFeed server island ──► Vercel ISR cache (6h) ──► Visitors
                  (streams into page shell)
```

No GitHub Action crons. No auto-committed JSON files. No manual rebuilds for feed content.

### Timestamp

The "Updated" timestamp in the page header (`RadarHeader.astro`) displays the server render time in the **America/Santiago** (Chile) timezone, regardless of where the Vercel edge function executes. This uses `toLocaleDateString('en-US', { timeZone: 'America/Santiago', ... })`.

## Environment Variables

Set in Vercel project settings and local `.env`:

| Variable                  | Purpose                                   | Source                                         |
| ------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `INOREADER_APP_ID`        | Inoreader developer app ID                | Manual (Inoreader dev portal)                  |
| `INOREADER_APP_KEY`       | Inoreader developer app key               | Manual (Inoreader dev portal)                  |
| `INOREADER_ACCESS_TOKEN`  | OAuth access token (initial/fallback)     | OAuth flow or Redis auto-refresh               |
| `INOREADER_REFRESH_TOKEN` | OAuth refresh token (initial/fallback)    | OAuth flow or Redis auto-refresh               |
| `INOREADER_FOLDER_PREFIX` | Folder prefix filter (default: `GST-`)    | Manual                                         |
| `KV_REST_API_URL`         | Upstash Redis REST endpoint               | Auto-provisioned by Vercel Upstash integration |
| `KV_REST_API_TOKEN`       | Upstash Redis standard token (read/write) | Auto-provisioned by Vercel Upstash integration |

The Vercel Upstash integration also provisions `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, and `REDIS_URL` — these are **not used** by the Radar client. See [Environment Variables for Redis](#environment-variables-for-redis) for details.

## Inoreader Setup

### Prerequisites

- Inoreader Pro plan (~$7.50/month)
- Register app at https://www.inoreader.com/developers/

### OAuth Setup

The script reads `INOREADER_APP_ID` and `INOREADER_APP_KEY` from the project root `.env` file automatically.

```bash
node scripts/inoreader-auth.mjs setup        # 1. Prints auth URL to open in browser
node scripts/inoreader-auth.mjs exchange CODE # 2. Exchange auth code for access + refresh tokens
node scripts/inoreader-auth.mjs refresh       # 3. Manual fallback if refresh token needs rotation
```

Do steps 1-2 quickly back-to-back — auth codes expire within minutes. The exchange command prints both `INOREADER_ACCESS_TOKEN` and `INOREADER_REFRESH_TOKEN` to add to `.env` and Vercel env vars.

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
│   ├── types.ts                  # TypeScript interfaces
│   ├── client.ts                 # API client (fetch wrappers + token refresh + Upstash Redis persistence)
│   ├── cache.ts                  # Dev-mode file cache (24h TTL)
│   └── transform.ts             # Data transformation + categories + feed merge
├── pages/hub/radar/
│   └── index.astro               # Main Radar page (SSR + ISR + unified feed)
scripts/
└── inoreader-auth.mjs           # OAuth setup helper
```

## Token Management

### How Token Refresh Works

The API client handles token refresh automatically at runtime:

1. Each API call uses the current access token (resolved from Redis or env var)
2. If Inoreader returns **401** (token expired), the client automatically uses the refresh token to obtain a **new access token AND a new refresh token**
3. Both new tokens are **persisted to Upstash Redis** so they survive across serverless invocations
4. Subsequent API calls in the same page render reuse the in-memory refreshed token
5. The next ISR invocation (up to 6 hours later) loads the Redis-stored tokens automatically

### Token Resolution Priority

When resolving credentials, the client checks three sources in order:

| Priority | Source               | When Used                                                    |
| -------- | -------------------- | ------------------------------------------------------------ |
| 1        | In-memory refresh    | Token was refreshed during this SSR invocation               |
| 2        | Upstash Redis store  | Token was refreshed by a previous invocation and persisted   |
| 3        | Environment variable | Initial setup value; used when Redis is empty or unavailable |

### Upstash Redis Persistence

Tokens are stored in Upstash Redis to survive across serverless invocations:

| Redis Key                 | Value               | TTL     |
| ------------------------- | ------------------- | ------- |
| `inoreader:access_token`  | OAuth access token  | 30 days |
| `inoreader:refresh_token` | OAuth refresh token | 30 days |

**Why this matters:** Without Redis, each serverless invocation starts fresh with the original env var tokens. When Inoreader's refresh endpoint returns a new refresh token (which it does on every refresh), the old refresh token may be invalidated. Without persistence, the next invocation would try to use the now-invalid original refresh token from the env var — eventually causing a permanent auth failure.

With Redis, the refreshed token chain stays alive indefinitely — each refresh stores the new pair, and the next invocation picks it up.

**Graceful degradation:** All Redis operations are wrapped in try/catch. If Redis is unavailable (dev mode, quota exceeded, not configured), the client silently falls back to env vars — matching the pre-Redis behavior.

### Redis Setup

Redis is provisioned via the Upstash integration in the Vercel Marketplace (free tier: 10,000 commands/day, 256MB):

1. **Vercel Dashboard → Storage → Upstash** → Create a Redis database named `gst-radar-tokens`
2. **Connect to the project** — Upstash auto-provisions 5 env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`); only the first two are used by the Radar client
3. **Redeploy** — the code detects Redis automatically via `@upstash/redis`

No code changes or local env var setup needed. For local development, Redis is not used — the client reads tokens from `.env` as usual.

### Environment Variables for Redis

The Vercel Upstash integration auto-provisions **5 environment variables** when you connect a Redis store to the project. The Radar client only uses 2 of them:

| Variable                      | Used by Radar? | Purpose                                                                                                                                                                                                                      |
| ----------------------------- | :------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KV_REST_API_URL`             |    **Yes**     | Upstash Redis REST endpoint (HTTPS) — used by `@upstash/redis` SDK                                                                                                                                                           |
| `KV_REST_API_TOKEN`           |    **Yes**     | Standard token with **full read/write** access — required because the client both reads and writes tokens                                                                                                                    |
| `KV_REST_API_READ_ONLY_TOKEN` |       No       | Read-only token — permits only read commands (GET, not SET). Intended for client-side/browser code where the token is publicly exposed. Not needed here since all Redis calls are server-side in Vercel serverless functions |
| `KV_URL`                      |       No       | Redis protocol connection string (`rediss://...`) — for native Redis clients like `ioredis`. Not needed since we use the REST SDK                                                                                            |
| `REDIS_URL`                   |       No       | Alias for `KV_URL` — same Redis protocol string, provided for compatibility with frameworks that expect this name                                                                                                            |

**Why `KV_REST_API_TOKEN` and not `KV_REST_API_READ_ONLY_TOKEN`?** The Radar client calls `store.set()` to persist refreshed OAuth tokens. The read-only token would reject these write operations. The standard token is safe to use because it never leaves the server — it's only accessed in Vercel serverless functions, never exposed to browsers.

**Fallback env var names:** The code also checks `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as fallbacks, supporting direct Upstash SDK conventions if the Vercel-specific names are not set.

### Manual Fallback

The manual refresh script (`node scripts/inoreader-auth.mjs refresh`) remains available if the entire token chain breaks (e.g., Redis store deleted, both tokens expired). In that case, re-run the full OAuth flow and update the Vercel env vars.

## Dev-Mode API Cache

### Why It Exists

Inoreader enforces a **200 requests/day** rate limit (100/zone x 2 zones). Each Radar page load makes ~7 API calls (1 annotated items + 1 tag list + ~5 folder streams). During local development, hot reloads and page refreshes can exhaust this budget in under 15 page loads, resulting in **429 Too Many Requests** errors and a blank Radar feed.

Production is unaffected (ISR revalidates every 6 hours = ~28 calls/day), but the dev and production environments share the same API credentials and rate limit bucket.

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

When the Inoreader API rate limit (200 requests/day) has been exhausted — or when working without network access — you can seed the dev cache with mock data so the Radar page renders fully without any live API calls.

### Quick Start

```bash
npm run radar:seed
npm run dev
# Visit http://localhost:4321/hub/radar — renders with mock data, zero API calls
```

The `radar:seed` script writes two cache entries into `.cache/inoreader/` with a fresh timestamp (24h TTL). Start the dev server normally afterward.

### How It Works

The seed script (`tests/e2e/fixtures/seed-radar-cache.ts`) writes the same cache files the dev-mode cache system reads. The Astro dev server sees valid cache entries and skips all Inoreader API calls. The mock data includes:

- **5 FYI items** with annotations (highlights + GST Take) across all 4 categories
- **13 Wire items** across all 4 GST-\* folders with realistic titles and sources

### Resetting to Live Data

When you're ready to return to live API data:

```bash
npm run radar:unseed       # Remove seeded mock data
npm run dev                # Next page load fetches from Inoreader and re-caches
```

### Preserving Real Cache Data

If you've already loaded the Radar page with live data and want to keep that cache for offline use, the files in `.cache/inoreader/` persist across dev server restarts. The 24-hour TTL is based on a `timestamp` field stored inside each JSON file, not the file modification time.

To extend expired cache entries without re-fetching:

```bash
# Reset the timestamp inside each cache file to "now"
npx tsx -e "
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const dir = '.cache/inoreader';
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  const entry = JSON.parse(readFileSync(p, 'utf-8'));
  entry.timestamp = Date.now();
  writeFileSync(p, JSON.stringify(entry), 'utf-8');
}
console.log('Cache timestamps refreshed');
"
```

## E2E Test Mocking

### Why Mock Data Is Needed

The Radar page is **server-side rendered** — Inoreader API calls happen in the Astro dev server (Node.js), not in the browser. This means Playwright's `page.route()` cannot intercept these calls. Without mock data, E2E tests either burn through the 200 req/day API budget or silently skip when the API is rate-limited.

### How It Works

E2E tests reuse the dev-mode file cache (see above) to serve deterministic mock data:

1. **Playwright global setup** (`tests/e2e/global-setup.ts`) writes mock Inoreader responses to `.cache/inoreader/` before any test runs
2. The Astro dev server reads these cache files during SSR — zero live API calls
3. **Playwright global teardown** (`tests/e2e/global-teardown.ts`) cleans up the cache after tests complete

Only two cache entries are needed:

- `fetchAnnotatedItems(30)` — seeds 5 FYI items across all 4 categories
- `fetchAllStreams('GST-', 15)` — seeds 13 Wire items across all 4 folders

### File Structure

```
tests/e2e/
├── global-setup.ts              # Seeds mock cache before tests
├── global-teardown.ts           # Clears mock cache after tests
├── fixtures/
│   ├── radar-mock-data.ts       # Mock Inoreader API response factories
│   └── seed-radar-cache.ts      # Writes/clears mock data in .cache/
├── helpers/
│   └── radar.ts                 # Page interaction helpers
└── radar-page.test.ts           # Radar E2E tests (17 tests x 3 browsers)
```

### Cache Key Alignment

The seeding script duplicates `buildCacheKey()` from `src/lib/inoreader/cache.ts` (same SHA-256 hashing of function name + args). If the cache key algorithm changes, E2E tests break immediately — providing fast feedback.

### Mock Data Characteristics

- **FYI items**: 5 articles with annotations (highlighted text + GST Take), covering all 4 categories
- **Wire items**: 13 articles spread across 4 GST-\* folders with realistic titles and sources
- All items have valid URLs, timestamps, sources, and category folder labels
- Category distribution is intentionally uneven so filter tests can verify count changes
- Both tiers render in a single unified feed, interleaved chronologically

### Running Radar E2E Tests

```bash
npx playwright test tests/e2e/radar-page.test.ts              # All browsers
npx playwright test tests/e2e/radar-page.test.ts --project=chromium  # Chromium only
```

Console output confirms mock data is active:

```
[E2E Setup] Radar mock cache seeded
...
[E2E Teardown] Radar mock cache cleared
```

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

- **API down**: Radar page renders with empty FYI/Wire sections and fallback message
- **Token expired**: Automatic refresh via refresh token; both new tokens persisted to Upstash Redis
- **Refresh token expired**: Should not happen if Redis is configured (each refresh stores a new pair). If it does, re-run OAuth flow (`node scripts/inoreader-auth.mjs setup`) and update Vercel env vars
- **No env vars**: Radar page shows "Intelligence feed is currently being refreshed" fallback
- **ISR cache**: Vercel serves last good render even during API outages

### Failure Scenarios in Detail

| Scenario                                 | User Sees                                              | ISR Cache Impact                | Logged                                                                                 |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------- |
| Inoreader API temporarily down           | Fallback message                                       | Degraded page cached for 6h     | `[Radar] Inoreader API error: {status}`                                                |
| Access token expired (refresh works)     | **Normal page** — auto-heals                           | Good page cached                | `[Radar] Access token expired, attempting refresh...` + `Tokens persisted to KV store` |
| Refresh token revoked/expired (no Redis) | Fallback message                                       | Degraded page cached for 6h     | `[Radar] Token refresh failed: {status}`                                               |
| Refresh token revoked (with Redis)       | **Unlikely** — Redis stores fresh pair on each refresh | N/A                             | Should not occur if Redis is healthy                                                   |
| Both tokens invalid + Redis empty        | Fallback message                                       | Degraded page cached for 6h     | `[Radar] Token refresh failed`                                                         |
| Redis unavailable                        | Falls back to env vars                                 | No impact if env vars are valid | `[Radar] KV read failed, falling back to env vars`                                     |
| Env vars missing entirely                | **Page render crashes**                                | No cache generated              | `Inoreader credentials not configured` error                                           |
| Network timeout to Inoreader             | Fallback message                                       | Degraded page cached for 6h     | `[Radar] Wire fetch failed` / `Folder fetch failed`                                    |

**Key risk (mitigated by Redis):** Previously, if the refresh token expired, Vercel ISR would cache a degraded page indefinitely with no alerting. With Upstash Redis, each successful refresh persists a new token pair, keeping the chain alive. The remaining risk is if the Redis store is deleted or both the Redis-stored and env var tokens expire simultaneously — an unlikely scenario under normal operation.

## Production Observability & Troubleshooting

### Current Logging

The Inoreader client (`src/lib/inoreader/client.ts`) logs to `console.error` / `console.warn` / `console.log` with a `[Radar]` prefix at every failure point. These logs are captured by Vercel's serverless function runtime.

**Log messages to watch for:**

| Log Message                                            | Severity | Meaning                                                |
| ------------------------------------------------------ | -------- | ------------------------------------------------------ |
| `[Radar] Access token expired, attempting refresh...`  | Warn     | Normal — token rotation in progress                    |
| `[Radar] Access token refreshed successfully`          | Info     | Normal — self-healed                                   |
| `[Radar] Loaded tokens from KV store`                  | Info     | Normal — using Redis-persisted tokens                  |
| `[Radar] Tokens persisted to KV store`                 | Info     | Normal — fresh tokens saved for next invocation        |
| `[Radar] KV read failed, falling back to env vars`     | Warn     | Redis unavailable — using env vars instead             |
| `[Radar] KV write failed (non-fatal)`                  | Warn     | Redis persistence failed — tokens still work in-memory |
| `[Radar] Token refresh failed: {status}`               | Error    | **Action needed** — refresh token may be revoked       |
| `[Radar] No refresh token available`                   | Error    | **Action needed** — env var missing                    |
| `[Radar] Request failed after token refresh: {status}` | Error    | API issue persists after token refresh                 |
| `[Radar] Inoreader API error: {status} {statusText}`   | Error    | Inoreader returned non-200                             |
| `[Radar] Wire fetch failed`                            | Error    | Network error fetching folders                         |
| `[Radar] No folders found with prefix "GST-"`          | Warn     | No matching folders — check Inoreader organization     |

### How to View Logs

1. **Vercel Dashboard** → Project → **Logs** tab
2. Filter by function: `_isr`
3. Search for `[Radar]` to isolate Radar-specific logs
4. Logs are available for ~24–72 hours depending on Vercel plan

### Verifying It's Working

**Quick manual check:**

- Visit `/hub/radar` — if the unified feed shows FYI and Wire items, it's working
- Empty feed with fallback message indicates an API or token problem

**Vercel dashboard checks:**

- **Logs tab**: Filter for `[Radar]` errors in recent ISR invocations
- **Functions tab**: Check that the `_isr` function is being invoked and returning 200
- **Deployments tab**: View function logs for a specific deployment

### What Does NOT Exist (Current Gaps)

- No Sentry or external error tracking integration
- No alerting (Slack, email, PagerDuty) on API failures
- No health check endpoint (e.g., `/api/radar-health`)
- No structured logging (only console output)
- No retry logic beyond token refresh — single attempt per API call, then returns `null`

### Troubleshooting Playbook

**Symptom: Feed is empty on the live site**

1. Go to Vercel Dashboard → Logs → filter for `[Radar]`
2. Look for `Token refresh failed` → refresh token is dead
   - Fix: Re-run OAuth flow and update Vercel env vars:
     ```bash
     node scripts/inoreader-auth.mjs setup        # Get new auth URL
     node scripts/inoreader-auth.mjs exchange CODE # Get new tokens
     ```
   - Update `INOREADER_ACCESS_TOKEN` and `INOREADER_REFRESH_TOKEN` in Vercel project settings
   - Redeploy or wait up to 6 hours for ISR to pick up the new env vars
3. Look for `Inoreader API error: 429` → rate limited
   - Wait and let the next ISR cycle retry (6 hours)
4. Look for `Wire fetch failed` or `Folder fetch failed` → network issue
   - Usually transient; next ISR cycle should recover
5. Look for `No folders found with prefix "GST-"` → Inoreader folder naming issue
   - Verify folders in Inoreader are prefixed with `GST-`

**Symptom: Page crashes / 500 error**

1. Check Vercel function logs for the error
2. Most likely cause: missing environment variables
3. Verify all five env vars are set in Vercel project settings

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
