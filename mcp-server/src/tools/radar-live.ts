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
 *   - circuit already open                    → 503 with retry-hint
 *
 * **Circuit breaker integration** (Phase 3 + Phase 4c):
 *   - Before fetching: check `isCircuitOpen(env)`. If open, return 503 envelope
 *     immediately without touching Inoreader.
 *   - On Inoreader 429: call `openCircuit(env, reason)` then return 503-shaped
 *     MCP error.
 *
 * **Capability mirror with `search_radar_offline`** (Q2): same single
 * `category` filter, same payload shape. Enables the common "live for
 * production, offline for dev" pattern: write the prompt once, switch
 * tool name based on transport. The 50/day per-key rate limit (Phase 4
 * activation of the radar-tool tier) protects the Inoreader budget; the
 * Upstash cache (6h TTL) amortizes repeat reads.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../worker';
import { readWireLive, readFyiLive, type LiveTierResult } from '../content/radar-live-store';
import { isCircuitOpen, openCircuit } from '../ratelimit/circuit-breaker';
import { serializeToParams as serializeRadarUrl } from '../../../src/utils/radar-url';
import { RadarCategoryEnum } from '../schemas';
import { HUB_BASE } from '../config';
import type { SnapshotItem, RadarCategory } from '../content/radar-transform';

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

Sister tool: \`search_radar_offline\` (same shape, reads from a frozen local snapshot — for dev/CI/budget-exhausted contexts).

Input: optional \`category\` (one of "pe-ma", "enterprise-tech", "ai-automation", "security"); omit for all categories. Output: unified FYI + Wire feed sorted by \`publishedAt\` newest-first, with \`fetchedAt\` timestamp + \`cacheHit\` flag + \`deeplink\` URL.

Failure modes return a structured \`isError: true\` envelope with \`reason\` field — agents can distinguish "Inoreader stale token, retry later" from "Inoreader rate limit, circuit broken" from "transient network error."

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
 * Build an MCP error envelope from a LiveTierResult failure. Calls
 * `openCircuit()` when the failure is `inoreader-rate-limit` so subsequent
 * radar requests across all keys see the breaker.
 */
async function failureResponse(env: Env, failure: Extract<LiveTierResult, { ok: false }>) {
  if (failure.reason === 'inoreader-rate-limit') {
    await openCircuit(env, 'inoreader-429');
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          error: failure.reason,
          status: failure.status,
          message: failure.message,
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Check the circuit breaker; if open, return the 503-shaped error envelope.
 * Returns null if the breaker is closed OR Upstash isn't reachable (graceful
 * skip — fail open per the rate-limit + circuit-breaker design).
 */
async function checkCircuitBreaker(env: Env) {
  const state = await isCircuitOpen(env);
  if (!state || !state.open) return null;
  // Convert circuitOpenResponse's HTTP-flavored Response into an MCP-flavored
  // error envelope. Same status/reason fields, transport-appropriate shape.
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          error: 'service_unavailable',
          status: 503,
          reason: state.reason ?? 'inoreader-rate-limit',
          retryAfterSeconds: state.retryAfterSeconds,
          message:
            'Radar tools temporarily unavailable — Inoreader budget circuit is open. ' +
            `Retry after ${state.retryAfterSeconds ?? 'some time'}.`,
        }),
      },
    ],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// search_radar handler
// ---------------------------------------------------------------------------

export async function handleSearchRadar(env: Env, input: SearchRadarInput) {
  const breakerCheck = await checkCircuitBreaker(env);
  if (breakerCheck) return breakerCheck;

  const [wireResult, fyiResult] = await Promise.all([readWireLive(env), readFyiLive(env, 30)]);

  if (!wireResult.ok) return failureResponse(env, wireResult);
  if (!fyiResult.ok) return failureResponse(env, fyiResult);

  // Merge + dedupe + sort, mirroring the website's unified feed.
  const seen = new Set<string>();
  const merged: Array<SnapshotItem & { tier: 'fyi' | 'wire' }> = [];
  for (const item of fyiResult.items) {
    if (!seen.has(item.url || item.id)) {
      seen.add(item.url || item.id);
      merged.push({ ...item, tier: 'fyi' });
    }
  }
  for (const item of wireResult.items) {
    if (!seen.has(item.url || item.id)) {
      seen.add(item.url || item.id);
      merged.push({ ...item, tier: 'wire' });
    }
  }

  const matched = merged
    .filter((item) => categoryMatches(item, input.category))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  const payload = {
    matches: matched,
    totalMatched: matched.length,
    returned: matched.length,
    liveInfo: {
      wireFetchedAt: wireResult.fetchedAt,
      wireCacheHit: wireResult.cacheHit,
      fyiFetchedAt: fyiResult.fetchedAt,
      fyiCacheHit: fyiResult.cacheHit,
    },
    deeplink: buildRadarDeeplink(input.category),
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// get_latest_insights handler
// ---------------------------------------------------------------------------

export async function handleGetLatestInsights(env: Env, input: GetLatestInsightsInput) {
  const breakerCheck = await checkCircuitBreaker(env);
  if (breakerCheck) return breakerCheck;

  const limit = input.limit ?? 10;
  const fyiResult = await readFyiLive(env, Math.max(limit, 30)); // fetch 30 always so cache shared with search_radar
  if (!fyiResult.ok) return failureResponse(env, fyiResult);

  const filtered = fyiResult.items
    .filter((item) => categoryMatches(item, input.category))
    .slice()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, limit);

  const payload = {
    items: filtered,
    returned: filtered.length,
    liveInfo: {
      fetchedAt: fyiResult.fetchedAt,
      cacheHit: fyiResult.cacheHit,
    },
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
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
export function registerRadarLiveTools(server: McpServer, env: Env): void {
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
    (input: SearchRadarInput) => handleSearchRadar(env, input)
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
    (input: GetLatestInsightsInput) => handleGetLatestInsights(env, input)
  );
}

export {
  SearchRadarInputSchema,
  GetLatestInsightsInputSchema,
  type SearchRadarInput,
  type GetLatestInsightsInput,
};
