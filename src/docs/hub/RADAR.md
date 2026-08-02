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

- **Radar page** (`/hub/radar`): shell server-rendered with Vercel ISR (6-hour cache); **`noindex`**, paired with a sitemap exclusion in `src/utils/sitemap-filter.ts`
- **RadarFeed**: an Astro **server island** (`server:defer`) with `RadarFeedSkeleton` in `slot="fallback"` — its markup is _not_ in the initial HTML; see below
- **All other pages**: Unchanged, remain fully static

### Why the page is `noindex`

The Radar is not an indexable page type, and this is a classification rather than a concession — see **[ADR-0012](../adr/0012-rotating-feeds-are-noindex.md)**:

- The feed is replaced **wholly every 6h**. A URL whose content rotates has nothing durable for an index to hold.
- There are **no per-item permalinks**. The one original asset — the GST Takes — has no addressable home.
- The Takes are commentary _on_ third-party headlines, so they are keyword-bound to news the original publisher owns and outranks an aggregator for.

Note the argument is rotation plus the absence of permalinks. It is **not** that the Takes sit inside collapsed `<details>` — Google indexes collapsed content normally.

This was learned the expensive way. The page sat unindexed in Search Console, and `bbd96fbf` (2026-07-31) inlined the feed to fix it. That made the page crawlable but not rankable, because nothing above changed — so it was reverted. If Radar content should ever rank, the answer is **per-item permalinks on a separate archive route**, not inlining this feed.

### Why the feed is a server island

Deferring a page's primary content normally costs indexability: Googlebot runs JS on a deferred queue and judges the shell. That cost does not apply to a `noindex` page, so the island is free here — and it buys two real things:

- **Self-healing.** `@astrojs/vercel` routes `/_server-islands/*` to the **uncached** render function (the `_server-islands` → `NODE_PATH` branch in the adapter). A failed fetch self-heals on the very next request instead of baking an empty feed into an ISR entry for 6h. That failure mode was **BL-098**, now closed by removing the requirement rather than fixing it.
- **A legible wait.** `RadarFeedSkeleton.astro` paints immediately instead of the visitor staring at an unpainted page while the Worker responds.

The fetch carries a 5s `AbortSignal.timeout`. Without it, an unbounded call to a hung Worker would hold a serverless invocation open for undici's 300s default — the island function sets no `maxDuration`, exactly as the inline render did not.

**If you remove `noindex`, this island is no longer defensible.** `tests/unit/indexability.test.ts` asserts the pairing and will fail, pointing here.

### What a pageview costs

The island bypasses ISR, so **each pageview makes one Worker call**. That is the same property as self-healing, not a separate defect — an uncached endpoint is what heals. What the call actually costs:

- `GET /radar/snapshot` reaches `readWireLive`/`readFyiLive`, which are **cache-first against Upstash with a 6h TTL** (`mcp-server/src/content/radar-live-store.ts`), warmed by the 6h cron. A typical pageview is **two Redis reads and one HTTPS hop — not an Inoreader fetch**, so ADR-0006's Zone-1 budget is not exposed per-pageview.
- **It is not never, though.** `single-flight-lock.ts` is not applied to the radar cache-miss path (it guards OAuth refresh, admin re-auth, the audit consumer and cron dedup — but not this), so in the window between TTL expiry and cron re-warm, concurrent requests each fall through to a real Inoreader fetch. Under ISR that window was hit by one renderer; under the island, by whatever concurrency is live. The day-counter and the BL-091 breaker are the backstops.
- The binding ceiling is the Worker's own limiter: `MCP_KEY_WEBSITE_RADAR` resolves to `INTERNAL_TIER` — **60/min, 1000/day**. A bodyless GET has no tool name to classify, so it fail-safes to the `general` class (that pair), not radar's 5/50. **At a traffic spike the 60/min burst ceiling binds long before the daily cap.**

`/hub/radar` traffic is very low, so this is accepted with ample headroom. Note the substrate was built for this: `handle-authenticated.ts` calls this SSR path "the highest-volume Inoreader consumer" and BL-091 hardened it for exactly that reason.

### Known trade-off: layout shift

Restoring the island reintroduces a skeleton→content swap, and therefore CLS that the inlined version did not have. `lighthouserc.cjs` **and** `lighthouserc.mobile.cjs` both assert `cumulative-layout-shift ≤ 0.1` on this URL, and the same workflow runs both — but `.github/workflows/lighthouse.yml` runs them with `continue-on-error: true` and Lighthouse is not a required check, so they report without gating.

**No mitigation is attempted, deliberately.** A `server:defer` island renders no persistent slot element to reserve space on, so a `min-height` would have to hang on `.radar-container` (which also holds the header, filter and CTA) and would stabilize nothing. Sizing `.radar-empty` instead would only help the keyless dev/LHCI case no visitor sees, and would turn a misconfiguration state into a tall blank box. This is a restoration of pre-`bbd96fbf` behaviour on an un-gated audit, accepted and recorded. If CLS here ever matters, it is its own piece of work with its own measurement.

### Data Flow

```
Inoreader API ──► MCP Worker (mcp.globalstrategic.tech)
                  • OAuth refresh (single-flight)
                  • /radar/snapshot endpoint (resource:radar:read scope)
                  • cron pre-warm every 6h (cron/radar-refresh.ts)
                       │
                       ▼
                  RadarFeed server island (Vercel SSR, 5s fetch timeout)
                  • /_server-islands/* — UNCACHED, one call per pageview
                       │
                       ▼
                  Visitors (page shell itself is ISR-cached, 6h)
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
│   ├── RadarFeed.astro           # Fetches + renders the unified feed (server:defer island)
│   ├── RadarFeedSkeleton.astro   # slot="fallback" for the island above
│   ├── FyiItem.astro             # Collapsible FYI item with GST Take
│   ├── WireItem.astro            # Compact wire feed item
│   └── CategoryFilter.astro     # Filter pills; sets data-active-category on .radar-container
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

**Website path, with no secret at all**: `npm run radar:stub` serves a fixed offline snapshot on `127.0.0.1:8787` — 6 wire + 2 FYI items across two categories, all 8 of which render. (FYI items carry their own URLs deliberately: `RadarFeed` dedupes wire entries whose URL also appears in FYI, so reusing one would silently drop a wire item.) Point the site at it in `.env`:

```dotenv
MCP_RADAR_SNAPSHOT_URL=http://127.0.0.1:8787/radar/snapshot
MCP_KEY_WEBSITE_RADAR=stub-bearer-not-a-real-secret   # any non-empty value
```

The bearer must be non-empty or `RadarFeed.astro` short-circuits before the fetch and renders the empty state regardless of the URL. **This is what makes the content-dependent E2E assertions runnable** — without it they `test.skip()` everywhere, including the one proving `?category=` actually filters the feed rather than merely activating a pill. Two categories is deliberate: with one, a totally broken filter produces the same DOM as a working one. Note 8787 is also `wrangler dev`'s default port — with the Worker running locally you would hit the real Worker instead of the fixture, so set `STUB_PORT` if both are up.

**Local stdio MCP server path** (the `search_radar_offline` tool, `gst://radar/*` Resources over stdio, and the `gst_radar_brief_today` prompt's embed): these read a local snapshot at `<repo>/.cache/inoreader/` — populated and cleared from the repo root with:

```bash
npm run radar:seed      # write the offline snapshot (7 FYI + 13 Wire mock items, all 4 categories)
npm run radar:unseed    # remove it (surfaces return the structured "snapshot missing" message)
```

The seeded data is **deterministic mock fixture content** (`mcp-server/tests/fixtures/radar-mock-data.mjs` — the same single source of truth the unit suite asserts against); **no live Inoreader API calls are ever made**, so the shared 200 req/day budget is untouched. Item timestamps anchor to seed time, and the reader reports the snapshot file's mtime as `lastSeededAt` — re-run `radar:seed` to refresh. The seeder↔reader format contract is enforced by `mcp-server/tests/integration/radar-seed-roundtrip.test.ts`.

**Full new-developer journey** (install → build → register in Claude Desktop → seed → invoke): follow [`mcp-server/README.md`](../../../mcp-server/README.md) for install/build and client registration, then run `npm run radar:seed` and invoke `search_radar_offline` (or `/gst_radar_brief_today`) from your MCP client. Snapshot semantics detail: [`mcp-server/README.md` § Snapshot semantics](../../../mcp-server/README.md#snapshot-semantics-radar-only).

## E2E Test Mocking

Playwright's global-setup and global-teardown are intentionally no-ops post-Phase-B — there's no website-side cache to seed or clear. Two ways to give the tests a feed:

- **`npm run radar:stub`** (preferred, no secret): a fixed offline snapshot. Point `MCP_RADAR_SNAPSHOT_URL` at it and set any non-empty `MCP_KEY_WEBSITE_RADAR` — see § Working Offline for the exact values.
- **The real staging Worker**: set a real `MCP_KEY_WEBSITE_RADAR` so the SSR fetch authenticates.

**Without either, the content-dependent tests `test.skip()` — including the one asserting `?category=` actually filters the feed rather than just activating a pill.** CI has no bearer, so that test never runs there. That is not a theoretical gap: the deep-link was broken in exactly that way for months and nothing caught it, while the MCP tools hand clients those links.

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

**Two independent lifecycles.** The page shell is ISR-cached; the feed is not cached at Vercel at all. Do not reason about them as one.

**The shell** (header, filter pills, CTA — everything except the feed):

1. **First request after deploy** — Vercel invokes the ISR function, renders the shell plus the island's skeleton fallback, and **caches that for 6 hours**.
2. **Requests within 6 hours** — Vercel serves the cached shell HTML from CDN. No serverless function runs for the shell.
3. **First request after 6 hours** — stale-while-revalidate: the visitor immediately gets the stale shell while Vercel re-renders in the background.

**The feed** (`/_server-islands/RadarFeed`):

1. **Every pageview** invokes the island function — `@astrojs/vercel` routes `/_server-islands/*` past the ISR pipeline, so there is no Vercel-side caching here at all.
2. That function calls the Worker's `GET /radar/snapshot`, which is **cache-first against Upstash (6h TTL, cron-warmed)**. So a pageview normally costs two Redis reads, not an Inoreader fetch — see § What a pageview costs for the exception and the rate-limit ceiling.
3. **If the fetch fails**, the visitor sees `.radar-empty` and the **next request retries from scratch**. Nothing is cached, so nothing to un-cache — this is the self-healing property the island exists for.

### What Refreshes When

| Content                | Refresh Trigger             | Frequency               |
| ---------------------- | --------------------------- | ----------------------- |
| The Wire (RSS feeds)   | Worker Upstash cache + cron | Every 6 hours           |
| FYI (annotated items)  | Worker Upstash cache + cron | Every 6 hours           |
| Page shell             | ISR revalidation            | Every 6 hours           |
| Static assets (JS/CSS) | Vercel deployment           | Immutable, 1-year cache |

Worst-case visitor-visible content age is now bounded by the Worker's 6h cache alone (the ISR window no longer stacks on top of it, as it did while the feed was inlined), plus whatever a missed cron adds.

### Vercel Routing

Two routes, and the difference is load-bearing:

```
/hub/radar               → /_isr?x_astro_path=/hub/radar     (ISR-cached shell)
/_server-islands/*       → the Node render function          (UNCACHED — the feed)
```

The adapter special-cases `/_server-islands` (and `/_image`) past the ISR pipeline. **That bypass is why a failed feed fetch self-heals** rather than persisting in a cache entry.

The prerender config (`.vercel/output/functions/_isr.prerender-config.json`) sets:

- `expiration: 21600` (6 hours)
- `allowQuery: ["x_astro_path", "x_astro_path_token"]`
- `passQuery: true`

**`allowQuery` is the allowlist of params that participate in the cache key** — everything else is stripped from it, while `passQuery: true` still forwards the full query string to the function on a miss. So `/hub/radar/` and `/hub/radar/?category=security` **share one cache entry**.

That is why the active category is resolved client-side and never server-rendered from `Astro.url.searchParams`: on a cache miss the param arrives intact, so a server-rendered version would work in dev, in preview, and in every test — then serve whichever category warmed the entry to everyone for 6h on the first production cache hit.

## Error Handling

The website's failure modes shrink to MCP-Worker-call failures (post-BL-032.8 Phase B):

- **MCP Worker reachable, snapshot OK**: feed renders normally
- **MCP Worker returns 5xx / tier-failed envelope**: that tier renders empty; the other tier renders if its envelope is OK
- **MCP Worker unreachable / fetch throws**: feed renders empty with the SSR fallback message. The island is uncached, so the **next request retries** — a 30-second outage stays a 30-second outage
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
