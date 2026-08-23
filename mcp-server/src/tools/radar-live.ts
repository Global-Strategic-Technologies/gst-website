/**
 * MCP tools: search_radar + get_latest_insights (BL-032 Phase 4c).
 *
 * Live counterparts to `search_radar_offline` (the snapshot-only stdio
 * tool, post-Q2 rename). Same `SnapshotItem` payload shape so callers
 * composing across both tools see consistent fields.
 *
 * **Transport binding**: registered by `createServer()` (transport-portable).
 * Both stdio AND HTTP entrypoints get these tools. In stdio they require
 * `INOREADER_APP_ID` / `INOREADER_APP_KEY` / `INOREADER_ACCESS_TOKEN` env
 * vars set locally; without them, the tool returns a structured
 * `config-missing` error. In production (Worker) the credentials come
 * from Wrangler secrets per [`AUTH.md`](../docs/operations/AUTH.md) +
 * BL-032 Q13.
 *
 * **Failure modes** (each surfaces a structured MCP error envelope):
 *   - `config-missing` / `token-missing`     → Inoreader app creds not bound
 *   - `token-stale`                           → 401 from Inoreader; website refreshes
 *   - `inoreader-rate-limit`                  → 429 from Inoreader; circuit breaker opens
 *   - `upstream-error` / `network-timeout`    → other fetch failures
 *   - circuit open AND no cached snapshot     → 503 with retry-hint
 *
 * **Circuit breaker integration** (Phase 3 + Phase 4c; reworked in BL-091):
 *   - Before fetching: check `isCircuitOpen(env)`. If open, read the Upstash
 *     snapshot via the **cache-only** readers (`readWireCached` /
 *     `readFyiCached`) — never Inoreader — and serve whatever is cached,
 *     flagged `liveInfo.degraded: true`. This implements the second clause of
 *     ADR-0006 §2 ("radar reads serve cached snapshot data instead of touching
 *     Inoreader"), which had never been wired up.
 *   - Only when NOTHING is cached does the 503 envelope return — its shape is
 *     unchanged from the pre-BL-091 behavior.
 *   - On Inoreader 429 (normal path only): `handleInoreaderFailure` opens the
 *     circuit, then a 503-shaped MCP error returns. Per-tier fail-fast on the
 *     normal path is load-bearing (ADR-0006 T.Z.2: *every* Inoreader call site
 *     routes failures through that handler) — tier-tolerance applies ONLY when
 *     the breaker is already open.
 *
 * **Capability mirror with `search_radar_offline`** (Q2): same single
 * `category` filter, same payload shape. Enables the common "live for
 * production, offline for dev" pattern: write the prompt once, switch
 * tool name based on transport. The 50/day per-key rate limit (Phase 4
 * activation of the radar-tool tier) protects the Inoreader budget; the
 * Upstash cache (6h TTL) amortizes repeat reads.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import { NOOP_METRICS_CONTEXT, withToolMetrics, type MetricsContext } from '../metrics/_index';
import { z } from 'zod';
import type { Env } from '../env';
import {
  readWireLive,
  readFyiLive,
  readWireCached,
  readFyiCached,
  type LiveTierResult,
  type CachedTierResult,
} from '../content/radar-live-store';
import { isCircuitOpen, type CircuitState } from '../ratelimit/circuit-breaker';
import {
  handleInoreaderFailure,
  type InoreaderFailureSource,
} from '../lib/inoreader-failure-handler';
import { serializeToParams as serializeRadarUrl } from '../../../src/utils/radar-url';
import { RadarCategoryEnum } from '../schemas';
import { HUB_BASE } from '../config';
import { boundWireItems } from '../../../src/utils/radar-feed-bounds';
import {
  oldestItemDaysAgo,
  projectItemForModel,
  RADAR_CATEGORIES,
  type SnapshotItem,
  type RadarCategory,
} from '../content/radar-transform';
import { toolOk, toolFail } from './_result';

// ---------------------------------------------------------------------------
// Schemas (shared shape with search_radar_offline; capability-mirror invariant)
// ---------------------------------------------------------------------------

const SearchRadarInputSchema = z.object({
  category: RadarCategoryEnum.optional().describe(
    'Optional category filter. One of "pe-ma" / "enterprise-tech" / "ai-automation" / "security". Omit for all categories. Mirrors the /hub/radar website\'s single category filter.'
  ),
});
type SearchRadarInput = z.infer<typeof SearchRadarInputSchema>;

const GetLatestInsightsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe(
      'Number of FYI items to return (1-30, default 10). FYI items are the GST-annotated tier with highlight + GST Take.'
    ),
  category: RadarCategoryEnum.optional().describe(
    'Optional category filter. Omit for all categories.'
  ),
});
type GetLatestInsightsInput = z.infer<typeof GetLatestInsightsInputSchema>;

// ---------------------------------------------------------------------------
// Tool descriptions
// ---------------------------------------------------------------------------

const SEARCH_RADAR_DESCRIPTION = `Live GST Radar search — strict mirror of the website's /hub/radar page; calls Inoreader directly with a 6h Upstash cache.

Sister tool: \`search_radar_offline\` — same shape, reads from a frozen local snapshot. **Registered on the stdio transport only**, so it is not callable over the remote (HTTP) server; use it for dev/CI/budget-exhausted contexts when running the server locally.

Input: optional \`category\` (one of "pe-ma", "enterprise-tech", "ai-automation", "security"); omit for all categories. Output: unified FYI + Wire feed sorted by \`publishedAt\` newest-first, with \`fetchedAt\` timestamp + \`cacheHit\` flag + \`degraded\` flag + \`deeplink\` URL. **The Wire tier is capped at 30 items** (with up to 3 slots reserved per category so no category is crowded out), mirroring what /hub/radar renders. The curated FYI tier passes through this tool uncapped — though it is already limited upstream to the 15 freshest annotated items. \`returned\` is the count after that cap and \`totalMatched\` the count before it — when they differ, the feed was truncated and the \`deeplink\` opens the full view. Item \`summary\` is plain text (source HTML is stripped). When \`liveInfo.degraded\` is true the results come from the cached snapshot (up to 6h old) because the Inoreader budget circuit is open — treat them as stale-but-real, and check \`fetchedAt\` for age.

Failure modes return \`isError: true\` with a machine-readable \`error\` field in \`structuredContent\` (\`config-missing\` | \`token-missing\` | \`token-stale\` | \`inoreader-rate-limit\` | \`upstream-error\` | \`network-timeout\` | \`service-unavailable\`) — so agents can distinguish "Inoreader stale token, retry later" from "Inoreader rate limit, circuit broken" from "transient network error." \`content[0].text\` carries the human-readable message. A broken circuit only returns an error when there is ALSO no cached snapshot to serve; otherwise you get cached results flagged \`degraded\`.

Per-key budget: 5 requests/minute and 50 requests/day (BL-032 Phase 3 radar tier — activates with this tool). The website's /hub/radar page shares the underlying 200/day Inoreader budget; treat radar tool calls as expensive.`;

const GET_LATEST_INSIGHTS_DESCRIPTION = `Convenience wrapper returning the N most recent FYI items (the GST-annotated tier — highlight text + GST Take).

Equivalent to \`search_radar\` filtered to FYI items only. Use this when you want a quick "what's GST flagging right now" digest; use \`search_radar\` when you need the full Wire+FYI surface or category filtering.

Input: \`limit\` (1-30, default 10), optional \`category\`. Output: \`items[]\` of SnapshotItem shape with annotations populated.

Same Inoreader budget + circuit-breaker semantics as \`search_radar\`.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRadarDeeplink(category?: RadarCategory): string {
  const params = serializeRadarUrl({ category: category ?? null });
  const queryString = params.toString();
  return queryString ? `${HUB_BASE}/hub/radar?${queryString}` : `${HUB_BASE}/hub/radar`;
}

function categoryMatches(item: SnapshotItem, filter?: RadarCategory): boolean {
  return !filter || item.category === filter;
}

/**
 * Build an MCP error envelope from a LiveTierResult failure.
 *
 * T.Z.2 (BL-032.7) — side effects (breaker open + Sentry capture with
 * diagnostic tags) live in the shared `handleInoreaderFailure()` helper
 * so the cron path and the live-tool path open the breaker on the same
 * 429 signal. Prior to T.Z.2, only this path opened the breaker, which
 * extended Inoreader-degradation windows by 6h on top of the upstream
 * incident — see src/docs/adr/0006-inoreader-zone1-budget-protection.md (trace: _archive/BL-032_5_TESTING_FINDINGS.md § T.Z.2).
 */
async function failureResponse(
  env: Env,
  failure: Extract<LiveTierResult, { ok: false }>,
  source: InoreaderFailureSource
) {
  await handleInoreaderFailure(env, failure, source);
  // BL-090: the structured error moved to `structuredContent` — before, this was
  // JSON hand-stringified into the text channel because no structured error
  // convention existed. `content` now carries the human-readable message.
  return toolFail(failure.reason, failure.message, { status: failure.status });
}

/**
 * Build the 503-shaped MCP error envelope for an OPEN circuit with nothing
 * cached to serve (BL-091: this is now the *last* resort, not the first
 * check). Shape is unchanged from the pre-BL-091 behavior so existing clients
 * that handle it keep working.
 */
function circuitOpenEnvelope(state: CircuitState) {
  // BL-090: `error` is now the kebab-case `service-unavailable` (matching every
  // other reason), and the breaker's own trip reason moved from `reason` to
  // `cause` — under `{ error: reason, … }` two different meanings were sharing
  // the word "reason" on a public envelope.
  return toolFail(
    'service-unavailable',
    'Radar tools temporarily unavailable — Inoreader budget circuit is open. ' +
      `Retry after ${state.retryAfterSeconds !== undefined ? `${state.retryAfterSeconds} seconds` : 'some time'}.`,
    {
      status: 503,
      cause: state.reason ?? 'inoreader-rate-limit',
      retryAfterSeconds: state.retryAfterSeconds,
    }
  );
}

/**
 * Normalized per-tier view (BL-091). A tier can be `cache-empty` on the
 * degraded path while its sibling still has data, so `fetchedAt` / `cacheHit`
 * become `null` rather than fabricated values — matching the `liveInfo`
 * contract and this file's existing `oldestItemDaysAgo` null idiom.
 */
interface TierView {
  readonly items: readonly SnapshotItem[];
  readonly fetchedAt: string | null;
  readonly cacheHit: boolean | null;
}

function tierView(result: LiveTierResult | CachedTierResult): TierView {
  return result.ok
    ? { items: result.items, fetchedAt: result.fetchedAt, cacheHit: result.cacheHit }
    : { items: [], fetchedAt: null, cacheHit: null };
}

// ---------------------------------------------------------------------------
// search_radar handler
// ---------------------------------------------------------------------------

export async function handleSearchRadar(env: Env, input: SearchRadarInput, keyOwner?: string) {
  // `null` → Upstash unreachable; fail open to the normal path (unchanged).
  const breaker = await isCircuitOpen(env);
  const degraded = breaker?.open === true;

  let wireView: TierView;
  let fyiView: TierView;

  if (degraded && breaker) {
    // Breaker open → cache only, never Inoreader. Serve whatever is cached;
    // tier-tolerance is deliberately scoped to THIS path (there is nothing
    // left to open, and `cache-empty` carries no upstream signal).
    const [wire, fyi] = await Promise.all([readWireCached(env), readFyiCached(env, 30)]);
    if (!wire.ok && !fyi.ok) return circuitOpenEnvelope(breaker);
    wireView = tierView(wire);
    fyiView = tierView(fyi);
  } else {
    const [wire, fyi] = await Promise.all([
      readWireLive(env, { keyOwner }),
      readFyiLive(env, 30, { keyOwner }),
    ]);
    // Per-tier fail-fast — load-bearing (ADR-0006 T.Z.2): this is the path
    // that routes a 429 into `handleInoreaderFailure` → `openCircuit`.
    if (!wire.ok) return failureResponse(env, wire, 'live-search-radar');
    if (!fyi.ok) return failureResponse(env, fyi, 'live-search-radar');
    wireView = tierView(wire);
    fyiView = tierView(fyi);
  }

  // Merge + dedupe + BOUND + sort, mirroring the website's unified feed — including
  // its display cap, which this tool did not apply until BL-109. The order below is
  // load-bearing in two places; see `src/utils/radar-feed-bounds.ts` for why.
  //
  //   dedupe against FYI → bound globally → merge → apply input.category
  //
  const seen = new Set<string>();
  // FYI dedupes against ITSELF too, not just wire against FYI. The same article
  // annotated from two subscribed feeds arrives as two FYI entries sharing a canonical
  // URL — realistic in an aggregator. An earlier revision of this change seeded `seen`
  // from FYI and then spread `fyiView.items` unconditionally, which reintroduced those
  // duplicates into `matches` and double-counted them in `unboundedMatchCount`.
  const dedupedFyi: SnapshotItem[] = [];
  for (const item of fyiView.items) {
    const key = item.url || item.id;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedFyi.push(item);
    }
  }
  const dedupedWire: SnapshotItem[] = [];
  for (const item of wireView.items) {
    const key = item.url || item.id;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedWire.push(item);
    }
  }

  // Bound BEFORE the category filter, across all categories: the website's category
  // pills filter client-side over the already-bounded set, which is the whole reason
  // MIN_PER_CATEGORY exists. Bounding after the filter would return up to MAX_WIRE
  // items of one category where the page shows a handful.
  const boundedWire = boundWireItems(dedupedWire, RADAR_CATEGORIES);

  const merged: Array<SnapshotItem & { tier: 'fyi' | 'wire' }> = [
    ...dedupedFyi.map((item) => ({ ...item, tier: 'fyi' as const })),
    ...boundedWire.map((item) => ({ ...item, tier: 'wire' as const })),
  ];

  const matched = merged
    .filter((item) => categoryMatches(item, input.category))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .map(projectItemForModel);

  // `totalMatched` counts what matched the REQUEST before the display bound — i.e. the
  // category-filtered but unbounded set — so `returned` vs `totalMatched` tells a caller
  // truncation happened. (Counting `merged.length` instead would report the whole feed
  // on a filtered call.) Same pairing `search_regulations` uses, and it is what makes the
  // existing "N of M radar items" caption below mean something other than "45 of 45".
  const unboundedMatchCount =
    dedupedFyi.filter((item) => categoryMatches(item, input.category)).length +
    dedupedWire.filter((item) => categoryMatches(item, input.category)).length;

  const payload = {
    matches: matched,
    totalMatched: unboundedMatchCount,
    returned: matched.length,
    // BL-031.95 follow-up: freshness signal at the envelope so callers
    // don't have to scan every item's date. `null` when matches is
    // empty; otherwise rolling 24h-bucketed age of the oldest item.
    oldestItemDaysAgo: oldestItemDaysAgo(matched),
    liveInfo: {
      wireFetchedAt: wireView.fetchedAt,
      wireCacheHit: wireView.cacheHit,
      fyiFetchedAt: fyiView.fetchedAt,
      fyiCacheHit: fyiView.cacheHit,
      // BL-091: `true` when served from cache because the breaker is open.
      degraded,
      ...(degraded && breaker?.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: breaker.retryAfterSeconds }
        : {}),
    },
    deeplink: buildRadarDeeplink(input.category),
  };

  return toolOk(
    payload,
    `${payload.returned} of ${payload.totalMatched} radar items${degraded ? ' (degraded — served from cache)' : ''}.`
  );
}

// ---------------------------------------------------------------------------
// get_latest_insights handler
// ---------------------------------------------------------------------------

export async function handleGetLatestInsights(
  env: Env,
  input: GetLatestInsightsInput,
  keyOwner?: string
) {
  // `null` → Upstash unreachable; fail open to the normal path (unchanged).
  const breaker = await isCircuitOpen(env);
  const degraded = breaker?.open === true;

  const limit = input.limit ?? 10;
  // Fetch 30 always so the Upstash cache is shared with search_radar. Note:
  // readFyiLive caps FYI output at FYI_MAX_COUNT (15) via the freshness gate,
  // so `limit` (schema max 30) can never actually yield more than 15 items.
  let fyiView: TierView;
  if (degraded && breaker) {
    const fyi = await readFyiCached(env, Math.max(limit, 30));
    // A cached-but-fully-aged-out blob yields `ok` with zero items — that's an
    // accurate "no fresh items", not an error. Only a true cache miss 503s.
    if (!fyi.ok) return circuitOpenEnvelope(breaker);
    fyiView = tierView(fyi);
  } else {
    const fyi = await readFyiLive(env, Math.max(limit, 30), { keyOwner });
    if (!fyi.ok) return failureResponse(env, fyi, 'live-get-latest-insights');
    fyiView = tierView(fyi);
  }

  const filtered = fyiView.items
    .filter((item) => categoryMatches(item, input.category))
    .slice()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, limit)
    // BL-109: same summary projection as `search_radar`. Without this, one FYI item
    // comes back as plain text from one tool and raw Inoreader HTML from the other —
    // the two are documented as a capability mirror and a model may compose across them.
    .map(projectItemForModel);

  const payload = {
    items: filtered,
    returned: filtered.length,
    // BL-031.95 follow-up: freshness signal at the envelope. `null` when
    // items is empty; otherwise rolling 24h-bucketed age of the oldest.
    oldestItemDaysAgo: oldestItemDaysAgo(filtered),
    liveInfo: {
      fetchedAt: fyiView.fetchedAt,
      cacheHit: fyiView.cacheHit,
      // BL-091: `true` when served from cache because the breaker is open.
      degraded,
      ...(degraded && breaker?.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: breaker.retryAfterSeconds }
        : {}),
    },
  };

  return toolOk(
    payload,
    `${payload.returned} latest insights${degraded ? ' (degraded — served from cache)' : ''}.`
  );
}

// ---------------------------------------------------------------------------
// Registration — transport-portable; called from createServer()
// ---------------------------------------------------------------------------

/**
 * Register the live radar tools with the given env captured in their handler
 * closures. Called from `createServer(env)` per request — the env binding
 * is request-scoped (Worker) or process-scoped (stdio with local creds).
 *
 * In stdio without local Inoreader creds the tools still register; calling
 * them returns a structured `config-missing` error envelope.
 */
export function registerRadarLiveTools(
  server: McpServer,
  env: Env,
  metrics: MetricsContext = NOOP_METRICS_CONTEXT
): void {
  server.registerTool(
    'search_radar',
    {
      title: 'Search Radar (live)',
      description: SEARCH_RADAR_DESCRIPTION,
      inputSchema: SearchRadarInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('search_radar', metrics, (input: SearchRadarInput) =>
      handleSearchRadar(env, input, metrics.keyOwner)
    )
  );

  server.registerTool(
    'get_latest_insights',
    {
      title: 'Get Latest Insights (FYI tier)',
      description: GET_LATEST_INSIGHTS_DESCRIPTION,
      inputSchema: GetLatestInsightsInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    withToolMetrics('get_latest_insights', metrics, (input: GetLatestInsightsInput) =>
      handleGetLatestInsights(env, input, metrics.keyOwner)
    )
  );
}

export {
  SearchRadarInputSchema,
  GetLatestInsightsInputSchema,
  type SearchRadarInput,
  type GetLatestInsightsInput,
};
