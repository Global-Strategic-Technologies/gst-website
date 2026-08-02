# ADR-0012: Rotating aggregate feeds are `noindex`, and may defer their content

- **Status**: Accepted (2026-08-02)
- **Source initiative**: BL-098 (closed by this decision — see [`../development/BACKLOG.md`](../development/BACKLOG.md))

## Context

`/hub/radar` sat unindexed in Search Console. The diagnosis at the time was mechanical and correct: the feed was an Astro `server:defer` island, so the initial HTML carried roughly 44 words of nav, heading and filter pills, and every item arrived via a second JS-initiated request. Googlebot runs JavaScript on a deferred queue, so the page was repeatedly judged on its shell.

`bbd96fbf` (2026-07-31) inlined the feed to put items in the first response. It worked — and bought nothing, because the page's problem was never crawlability:

- The feed is **replaced wholly every 6h**. A URL whose content rotates has nothing durable for an index to accumulate authority against.
- There are **no per-item permalinks**. The one genuinely original asset — the GST Takes — has no addressable home, so nothing links to it and nothing can rank for it.
- The Takes are commentary _on_ third-party headlines, so they are keyword-bound to news the originating publisher owns and outranks an aggregator for.

The argument is rotation plus the absence of permalinks. It is explicitly **not** that the Takes sit inside collapsed `<details>` elements — Google indexes collapsed content normally, and resting the case there invites an easy and correct rebuttal.

Inlining also had a real cost. It moved the fetch inside the ISR entry, so a failed revalidation cached the empty state as a `200` for up to 6h, where the uncached island had self-healed on the next request. That was BL-098: a genuine availability regression accepted in exchange for an SEO benefit that could not land.

## Decision

**A rotating aggregate feed with no per-item permalinks is not an indexable page type. Classify it `noindex` rather than engineering around the symptom.**

Two consequences follow, and the second depends on the first:

1. **`/hub/radar` is `noindex`, paired with a `/hub/radar` entry in [`src/utils/sitemap-filter.ts`](../../utils/sitemap-filter.ts).** The pairing is mandatory and is enforced by discovery in `tests/unit/indexability.test.ts` — submitting a URL while telling crawlers to drop it is a contradictory signal.

   - **Rejected: sitemap exclusion alone** (the `/colors` precedent). Exclusion keeps a URL out of the sitemap but leaves it indexable via internal links — and `/hub/` links to it. Only `noindex` states the intent.
   - **Required companion**: `public/robots.txt` must keep `Allow: /` for the route. A `Disallow` would stop Googlebot fetching the page and therefore seeing the `noindex`. Robots-disallow and robots-noindex are not two strengths of the same lever.

2. **Because the page is `noindex`, deferring its primary content behind a skeleton is acceptable.** The feed returns to `server:defer` with `RadarFeedSkeleton` in `slot="fallback"`. The general rule — _don't defer a page's primary content_ — is really _don't defer primary content on a page you want indexed_, and this page is the exception that shows where the boundary is.

**If `noindex` is ever removed from a page in this class, the island is no longer defensible and must go with it.** The two facts are asserted on the same payload in `tests/e2e/radar-page.test.ts` and paired again in `tests/unit/indexability.test.ts`, so they cannot drift apart silently.

## Consequences

- **BL-098 is closed by removing the requirement, not by satisfying it.** `@astrojs/vercel` routes `/_server-islands/*` to the uncached render function, so a failed feed fetch self-heals on the very next request. Its acceptance criterion _"`/hub/radar` still ships its feed in the initial HTML"_ is now the opposite of intended behaviour.

- **The island couples indexability to Worker load, and this is the non-obvious chain to carry forward**: `noindex` → deferring content is acceptable → the island bypasses ISR → **one Worker call per pageview** instead of ~4–28/day, bounded by `MCP_KEY_WEBSITE_RADAR`'s `INTERNAL_TIER` (60/min, 1000/day, with the burst ceiling binding before the daily cap). The call is cache-first against Upstash (6h TTL, cron-warmed) so it is normally two Redis reads rather than an Inoreader fetch — but there is no single-flight lock on the cache-miss path, so concurrent requests in the window between TTL expiry and cron re-warm each fall through to a real fetch. Accepted at current traffic. **A second page adopting this pattern inherits that constraint and should not discover it by exhausting the key.** Numbers live in [RADAR.md § What a pageview costs](../hub/RADAR.md).

- **Accepted regression**: the skeleton→content swap reintroduces layout shift the inlined version did not have. `lighthouserc.cjs` asserts CLS ≤ 0.1 on this URL but runs `continue-on-error: true` and is not a required check, so it reports without gating. No mitigation is attempted — an island renders no persistent slot to reserve space on. Reasoning in [RADAR.md § Known trade-off: layout shift](../hub/RADAR.md).

- **[ADR-0005](0005-hub-url-state-deeplink-contract.md) is unaffected but was nearly broken.** Under the island, `CategoryFilter`'s `?category=` hydration runs at `DOMContentLoaded` against items that do not exist yet — the historical bug, and the reason `mcp-server`'s `radar-live.ts` / `radar-offline.ts` deeplinks would have silently stopped filtering. Filtering is now driven by `data-active-category` on `.radar-container`, a shell element, plus CSS: it applies to items whenever they arrive, so island timing cannot break it. The shared encoder and `history.replaceState` behaviour ADR-0005 specifies are untouched.

- **The active category is never server-rendered.** `@astrojs/vercel`'s `buildISRFolder` writes `allowQuery: ['x_astro_path','x_astro_path_token']` with `passQuery: true`, so `/hub/radar/` and `/hub/radar/?category=security` share one ISR cache entry while the param still reaches the function on a miss. A server-rendered active category would pass dev, preview and every test, then serve a sticky mis-filtered variant on the first production cache hit.

- **Revisit trigger**: if a Radar archive with **per-item permalinks** ships, this decision is superseded **for the archive route only** — durable per-item URLs are a genuinely indexable page type and should be indexed. `/hub/radar` itself remains a rotating window and stays `noindex` regardless. Do not read a future archive as license to re-inline this feed; that path was walked in `bbd96fbf` and reverted.
