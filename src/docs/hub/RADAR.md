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
- **RadarFeed**: Rendered **inline** — its markup is in the initial HTML response. Deliberately _not_ a server island; see below
- **All other pages**: Unchanged, remain fully static

### Why the feed is not a server island

The feed used to be an Astro server island (`server:defer`) with a skeleton in `slot="fallback"`, so the shell painted instantly and the feed streamed in. That is a good pattern for secondary content and the wrong one here, because **the feed is the page's entire substance**.

Under `server:defer` the initial HTML carried roughly 44 words — nav, heading, filter pills — and every item arrived via a second JS-initiated request. Googlebot executes JavaScript, but on a deferred queue, so the page was repeatedly judged on the shell and sat unindexed in Search Console. Inlining puts the items in the first response.

`RadarFeedSkeleton.astro` was deleted with the island; nothing else used it. The generic `.skeleton-*` utilities in `src/styles/components/skeleton.css` are unaffected and still used elsewhere.

**Do not reintroduce `server:defer` here.** Two guards will fail: a source tripwire in `tests/unit/indexability.test.ts`, and — more importantly — a behavioural check in `tests/e2e/radar-page.test.ts` that fetches the raw HTML without executing scripts and asserts the island marker is absent and RadarFeed's markup is present.

### Accepted trade-off: negative caching

Inlining moves the MCP fetch inside the cached ISR entry, and that changes both paths:

- **Failure path.** A failed revalidation now bakes the empty state into a `200` for up to 6 hours. The island did not have this problem: `@astrojs/vercel` routes `/_server-islands/*` to the uncached render function, so a failed island self-healed on the next request. This is tracked as **BL-098** and is accepted, not overlooked.
- **Success path.** The feed was previously re-fetched on _every_ pageview; it is now fetched once per revalidation. Worst-case content age roughly doubles — the 6h ISR window on top of the Worker's own 6h cron — which sits exactly at the `snapshot age ≤ 12h` SLO recorded in the MCP server's ARCHITECTURE.md. The compensating win is that Worker load drops from per-pageview to per-revalidation.

A future fix must first distinguish a **failed** fetch from a **legitimately empty** feed — today both render identically, which is precisely why "just don't cache the empty case" is not implementable as stated. Note also that BL-091 (circuit-breaker serves cached radar) does **not** make this degrade safely: breaker-open is cache-only, so a cold cache still renders empty.

The fetch carries a 5s `AbortSignal.timeout`. Without it an unbounded call to a hung Worker would 5xx the very crawler this inlining exists to serve — undici defaults to 300s and the function sets no `maxDuration`.

### Data Flow

```
Inoreader API ──► MCP Worker (mcp.globalstrategic.tech)
                  • OAuth refresh (single-flight)
                  • /radar/snapshot endpoint (resource:radar:read scope)
                  • cron pre-warm every 6h (cron/radar-refresh.ts)
                       │
                       ▼
                  RadarFeed, rendered inline (Vercel SSR, 5s fetch timeout)
                       │
                       ▼
                  Vercel ISR cache (6h) ──► Visitors + crawlers
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

FYI (curated) items age out under a **dual cap** enforced Worker-side, so a curated take no longer pins indefinitely:

- **Age cap** — `FYI_MAX_AGE_DAYS = 30`: an item is dropped once its **annotation** (`annotatedAt`) is more than 30 days old. Age is measured from the annotation date, not the article's publish date.
- **Count cap** — `FYI_MAX_COUNT = 15`: at most the **newest 15** surviving items (by annotation date) render.
- Both caps are applied by `filterFreshFyi` (`mcp-server/src/content/radar-transform.ts`) inside `readFyiLive` (`radar-live-store.ts`) — the single choke point every live consumer routes through (website `/radar/snapshot`, `search_radar`, `get_latest_insights`, the `gst://radar/fyi` Resource, the hourly cron).
- The filter runs at **read time** against the current clock; the Upstash cache stores the **raw** annotated items, so an item ages out the moment it crosses 30 days — the 6h cache no longer delays expiry.
- **The FYI tier may render empty** if every annotation is older than 30 days. That is the intended consequence of the age cap — there is no "keep newest N even if stale" fallback.
- Removing annotations (highlights/notes) in Inoreader still removes the item on the next refresh.
- Constants live in `radar-transform.ts` — tune both in one place.

> **Offline tier is exempt (by design).** The seeded offline snapshot (`npm run radar:seed`, the `search_radar_offline` tool, the `gst_radar_brief_today` prompt embed) uses static fixture timestamps for deterministic, budget-free CI/dev. `filterFreshFyi` is **not** applied there — see the header note in `mcp-server/src/content/radar-snapshot.ts`.

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
│   ├── RadarFeed.astro           # Fetches and renders the unified feed INLINE (not an island)
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

## Inoreader Budget (shared 200 req/day)

Post-BL-032.8 Phase B the website makes **no direct Inoreader calls** — the MCP Worker is the single caller (hourly cron refresh + cache-amortized live radar tools), and the website's `/hub/radar` reads the Worker's `/radar/snapshot` endpoint at SSR time. The authoritative budget model (per-key caps, 6h Upstash cache, circuit breaker, spend accounting) lives in [ARCHITECTURE.md § Rate limiting & Inoreader budget](../../../mcp-server/src/docs/ARCHITECTURE.md#rate-limiting--inoreader-budget) — this doc deliberately does not duplicate the numbers.

Local development consumes **zero** Inoreader budget on either path: the website dev server reads the staging Worker's already-warmed snapshot, and the local stdio MCP server reads the seeded mock snapshot — both described in § Working Offline below. (The pre-Phase-B website-side dev cache — `src/lib/inoreader/client.ts` + `cache.ts` with a 24h-TTL file cache — was deleted in `606f4848`; its `.cache/inoreader/` directory is now used exclusively by the stdio MCP snapshot.)

## Working Offline / Rate-Limited Development

**Website path**: the website no longer holds an Inoreader cache (post-BL-032.8 Phase B). For offline radar development, point Vercel preview deploys / `npm run dev` at the staging MCP Worker by setting `MCP_RADAR_SNAPSHOT_URL=https://mcp-staging.globalstrategic.tech/radar/snapshot` in your local `.env`. The Worker keeps the snapshot warm via its own cron-driven cache (`mcp:radar:cache:wire` / `:fyi` in the MCP Upstash DB, 6h TTL).

**Local stdio MCP server path** (the `search_radar_offline` tool, `gst://radar/*` Resources over stdio, and the `gst_radar_brief_today` prompt's embed): these read a local snapshot at `<repo>/.cache/inoreader/` — populated and cleared from the repo root with:

```bash
npm run radar:seed      # write the offline snapshot (7 FYI + 13 Wire mock items, all 4 categories)
npm run radar:unseed    # remove it (surfaces return the structured "snapshot missing" message)
```

The seeded data is **deterministic mock fixture content** (`mcp-server/tests/fixtures/radar-mock-data.mjs` — the same single source of truth the unit suite asserts against); **no live Inoreader API calls are ever made**, so the shared 200 req/day budget is untouched. Item timestamps anchor to seed time, and the reader reports the snapshot file's mtime as `lastSeededAt` — re-run `radar:seed` to refresh. The seeder↔reader format contract is enforced by `mcp-server/tests/integration/radar-seed-roundtrip.test.ts`.

**Full new-developer journey** (install → build → register in Claude Desktop → seed → invoke): follow [`mcp-server/README.md`](../../../mcp-server/README.md) for install/build and client registration, then run `npm run radar:seed` and invoke `search_radar_offline` (or `/gst_radar_brief_today`) from your MCP client. Snapshot semantics detail: [`mcp-server/README.md` § Snapshot semantics](../../../mcp-server/README.md#snapshot-semantics-radar-only).

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

| Log message                                                  | Severity | Meaning                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[Radar] MCP_KEY_WEBSITE_RADAR is not bound on the env. ...` | Warn     | Bearer key missing — set the Vercel env var (see § Environment Vars)                                                                                                                                                                        |
| `[Radar] MCP /radar/snapshot returned {status} {statusText}` | Error    | Worker rejected the request — check status: 401 = bearer wrong; 403 = scope mismatch; 503 = rate-limit (the breaker itself no longer 503s this endpoint — it returns 200 with `degraded: true`); 5xx = Worker incident                      |
| `[Radar] FYI tier failed: {reason} {message}`                | Error    | Worker delivered the response but `snapshot.fyi.ok === false` — `reason` is one of the Worker's failure-taxonomy reasons (`token-stale`, `inoreader-rate-limit`, `inoreader-error`, `cache-empty` = breaker open with nothing cached, etc.) |
| `[Radar] Wire tier failed: {reason} {message}`               | Error    | Same as above but for the Wire tier — tiers fail independently                                                                                                                                                                              |
| `[Radar] MCP /radar/snapshot fetch threw: {error}`           | Error    | Network-level failure (DNS, TLS, timeout) — Worker may be down or the URL is misconfigured                                                                                                                                                  |

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
