/**
 * Inoreader egress accounting (BL-032.75 Phase 0).
 *
 * **Why this exists**: the pre-existing `mcp:inoreader:day-counter:*` counter
 * in `cron/radar-refresh.ts` only incremented on the cron path. Live MCP-tool
 * calls, the `/radar/snapshot` SSR endpoint, and OAuth refresh all bypassed
 * it — so dashboards built on that counter undercount Inoreader spend by an
 * estimated 15–25%. BL-032.8 Day-5 soak (2026-05-21) surfaced this gap.
 *
 * This module exposes one chokepoint — {@link recordInoreaderEgress} — that
 * the {@link './inoreader-client.ts'} `singleFetch` wrapper and
 * {@link './inoreader-oauth.ts'} `refreshAccessToken` POST call after every
 * received Response. The wrapper increments two Upstash counters:
 *
 *   - `mcp:inoreader:zone1-spend:<YYYY-MM-DD>` — Zone-1 total
 *     (`'cron-radar' | 'live-radar' | 'http-radar-snapshot' | '401-retry'`)
 *   - `mcp:inoreader:zone1-spend:<YYYY-MM-DD>:<category>` — per-category
 *
 * The `'oauth-refresh'` category is recorded per-category but is **excluded
 * from the Zone-1 total**: Inoreader's Zone tables at
 * https://www.inoreader.com/developers/rate-limiting list only endpoints
 * under `/reader/api/0/*`. The OAuth endpoint `/oauth2/token` is in a
 * separate URL space and is not classified in either Zone — confirmed
 * 2026-05-26 against the docs.
 *
 * **Source of truth for spend reporting**: every authenticated Inoreader
 * response carries `X-Reader-Zone1-Usage` (parsed in
 * `inoreader-client.ts::parseRateLimitHeaders` at line 258, populated on
 * 2xx **and 429** responses per the line 69-70 comment). The Upstash
 * counter is a pre-flight cap guard — useful when no header has been
 * observed yet today — and a drift-detection peer. When the counter and
 * the latest observed header disagree by more than 2 (in either
 * direction), a `inoreader.spend.drift` Sentry message is captured so an
 * operator can investigate the missing or extra call.
 *
 * **Why not delete the old day-counter at the same time**: see
 * [`MCP_SERVER_OBSERVABILITY_BL-032_75.md`](../../../src/docs/development/MCP_SERVER_OBSERVABILITY_BL-032_75.md)
 * Phase 0 Step 5 — old keys stay in place for a 7-day parallel-soak
 * window. Removal is a follow-up PR.
 *
 * **429 increment**: a 429 response counts as a successful Inoreader hit
 * from the quota's perspective — `X-Reader-Zone1-Usage` is populated on
 * 429s. To stay synchronized with Inoreader's own counter we MUST
 * increment when the response is a 429. The wrapper increments on every
 * received Response and skips only when no response was received (network
 * timeout / abort — nothing reached Inoreader, nothing was counted by
 * them).
 */

import { createMcpClient } from './upstash-clients';
import { safeLog } from '../auth/safe-logger';
import { captureMessage } from '../observability/sentry';
import type { Env } from '../worker';

/**
 * Categories used to attribute every outbound Inoreader call. The five
 * values cover every known egress path in the Worker as of 2026-05-26:
 *
 *   - `'cron-radar'`            — `cron/radar-refresh.ts` 6x/24h via `readWireLive` / `readFyiLive` with `source: 'cron'`.
 *   - `'live-radar'`            — MCP-tool live calls (search_radar, get_latest_insights, etc.) with `source: 'live-tool'`.
 *   - `'http-radar-snapshot'`   — the website's SSR endpoint at `worker.ts:357` (`GET /radar/snapshot`), with `source: 'http-snapshot'` (Phase 0 widening).
 *   - `'oauth-refresh'`         — `refreshAccessToken` POST to `/oauth2/token`. Reported separately; excluded from Zone-1 totals (see module docstring).
 *   - `'401-retry'`             — the second leg of `authenticatedFetch` after a 401. A real Inoreader call that counts against Zone-1.
 */
export type InoreaderEgressCategory =
  | 'cron-radar'
  | 'live-radar'
  | 'http-radar-snapshot'
  | 'oauth-refresh'
  | '401-retry';

/** All categories. Useful for enumeration and tests. */
export const INOREADER_EGRESS_CATEGORIES: ReadonlyArray<InoreaderEgressCategory> = [
  'cron-radar',
  'live-radar',
  'http-radar-snapshot',
  'oauth-refresh',
  '401-retry',
];

/** Categories whose calls count against Inoreader's daily Zone-1 quota. */
const ZONE1_CATEGORIES: ReadonlySet<InoreaderEgressCategory> = new Set<InoreaderEgressCategory>([
  'cron-radar',
  'live-radar',
  'http-radar-snapshot',
  '401-retry',
]);

export function categoryCountsAgainstZone1(cat: InoreaderEgressCategory): boolean {
  return ZONE1_CATEGORIES.has(cat);
}

const SPEND_KEY_PREFIX = 'mcp:inoreader:zone1-spend:';

/** Slightly past 24h so the key naturally rolls over at UTC midnight. */
const TTL_SECONDS = 25 * 60 * 60;

/**
 * Drift threshold: when the local counter and the latest header-observed
 * `X-Reader-Zone1-Usage` disagree by more than this many calls in either
 * direction, a Sentry message fires. Set to 2 because a brief race between
 * "we wrote our increment" and "Inoreader's counter ticked" can produce a
 * legitimate ±1 momentary gap; anything beyond means a real path is uncounted.
 */
const DRIFT_THRESHOLD_ABS = 2;

function todayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function totalSpendKey(date: string = todayUtc()): string {
  return `${SPEND_KEY_PREFIX}${date}`;
}

export function categorySpendKey(cat: InoreaderEgressCategory, date: string = todayUtc()): string {
  return `${SPEND_KEY_PREFIX}${date}:${cat}`;
}

export interface RecordEgressOptions {
  readonly env: Env;
  readonly category: InoreaderEgressCategory;
  /** HTTP status received from Inoreader. */
  readonly status: number;
  /**
   * `X-Reader-Zone1-Usage` from the response, if present. When supplied AND
   * the category counts against Zone-1, the wrapper checks for drift between
   * the local counter and Inoreader's reported total.
   */
  readonly zone1UsageHeader?: number;
  /** Short identifier of the call site (e.g. 'fetchAllStreams', 'oauth-refresh'). Logged only. */
  readonly source?: string;
}

/**
 * Record one outbound Inoreader call. Called by the `inoreader-client.ts`
 * `singleFetch` wrapper after a Response is received, and by the
 * `inoreader-oauth.ts` OAuth POST.
 *
 * Always increments the per-category counter; additionally increments the
 * Zone-1 total iff the category is a Zone-1 category. Drift-checks against
 * `zone1UsageHeader` when supplied.
 *
 * Best-effort — Upstash unreachable is logged but never thrown. Observability
 * must never fail a user request.
 */
export async function recordInoreaderEgress(opts: RecordEgressOptions): Promise<void> {
  const inZone1 = ZONE1_CATEGORIES.has(opts.category);

  // Always emit the structured log line — even when Upstash is unreachable,
  // wrangler-tail observers still see the per-call breadcrumb.
  safeLog({
    event: 'inoreader.egress',
    category: opts.category,
    status: opts.status,
    success: opts.status >= 200 && opts.status < 300,
    ...(opts.zone1UsageHeader !== undefined ? { zone1Usage: opts.zone1UsageHeader } : {}),
    ...(opts.source ? { tool: opts.source } : {}),
  });

  const redis = createMcpClient(opts.env);
  if (!redis) return;

  try {
    const catKey = categorySpendKey(opts.category);
    const catNext = await redis.incr(catKey);
    if (catNext === 1) await redis.expire(catKey, TTL_SECONDS);

    if (!inZone1) return;

    const tKey = totalSpendKey();
    const tNext = await redis.incr(tKey);
    if (tNext === 1) await redis.expire(tKey, TTL_SECONDS);

    if (opts.zone1UsageHeader !== undefined && Number.isFinite(opts.zone1UsageHeader)) {
      const drift = tNext - opts.zone1UsageHeader;
      if (Math.abs(drift) > DRIFT_THRESHOLD_ABS) {
        captureMessage(
          'inoreader.spend.drift',
          'warning',
          {
            counter: tNext,
            observed: opts.zone1UsageHeader,
            drift,
            category: opts.category,
          },
          'inoreader.spend.drift',
          {
            'inoreader.spend.drift': drift,
            'inoreader.spend.counter': tNext,
            'inoreader.spend.observed': opts.zone1UsageHeader,
            'inoreader.spend.category': opts.category,
          }
        );
      }
    }
  } catch {
    // Counter is a guard rail, not auth — degraded Upstash shouldn't fail
    // user requests. Surface to the operator via safeLog.
    safeLog({
      event: 'inoreader.egress.counter-write-failed',
      category: opts.category,
      success: false,
    });
  }
}

/**
 * Read today's spend totals for `/health` reporting. Returns 0 for any
 * missing/unreachable counter rather than throwing.
 */
export async function readInoreaderSpend(env: Env): Promise<{
  total: number;
  byCategory: Record<InoreaderEgressCategory, number>;
}> {
  const byCategory: Record<InoreaderEgressCategory, number> = {
    'cron-radar': 0,
    'live-radar': 0,
    'http-radar-snapshot': 0,
    'oauth-refresh': 0,
    '401-retry': 0,
  };

  const redis = createMcpClient(env);
  if (!redis) return { total: 0, byCategory };

  try {
    const date = todayUtc();
    const totalRaw = await redis.get<number | string>(totalSpendKey(date));
    const total = toFiniteNumber(totalRaw);

    for (const cat of INOREADER_EGRESS_CATEGORIES) {
      const raw = await redis.get<number | string>(categorySpendKey(cat, date));
      byCategory[cat] = toFiniteNumber(raw);
    }

    return { total, byCategory };
  } catch {
    return { total: 0, byCategory };
  }
}

function toFiniteNumber(raw: number | string | null | undefined): number {
  if (raw == null) return 0;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(n) ? n : 0;
}
