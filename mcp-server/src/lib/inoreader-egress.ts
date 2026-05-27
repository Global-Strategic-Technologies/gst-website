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
 *
 * **Closed gap** (historical, retained for context): prior to BL-032.8
 * Phase B (PR #140, merged 2026-05-27), the BL-039 website-refresh
 * fallback emitted `/oauth2/token` POSTs that Inoreader counted against
 * the quota but this counter never saw — estimated <5 calls/day. Phase B
 * retired the fallback; the Worker is now the sole egress point, so this
 * counter captures every Worker-side Inoreader call.
 */

import type { Redis } from '@upstash/redis';
import { createMcpClient } from './upstash-clients';
import { safeLog } from '../auth/safe-logger';
import { captureMessageEnvelope } from '../observability/sentry-envelope';
import type { Env } from '../worker';

/**
 * Single source of truth for every egress category. The five entries cover
 * every known outbound Inoreader call path in the Worker as of 2026-05-26.
 * Adding a sixth category is a one-line change here; the derived
 * `INOREADER_EGRESS_CATEGORIES` array, the Zone-1 membership check, and
 * the `readInoreaderSpend` initializer all follow automatically.
 *
 *   - `'cron-radar'`           — `cron/radar-refresh.ts` 6×/24h via `readWireLive` / `readFyiLive` with `source: 'cron'`.
 *   - `'live-radar'`           — MCP-tool live calls (search_radar, get_latest_insights, etc.) with `source: 'live-tool'`.
 *   - `'http-radar-snapshot'`  — website's SSR endpoint at `worker.ts:357` (`GET /radar/snapshot`), with `source: 'http-snapshot'` (Phase 0 widening).
 *   - `'oauth-refresh'`        — `refreshAccessToken` POST to `/oauth2/token`. Reported per-category but `zone1: false` — excluded from Zone-1 totals (see module docstring).
 *   - `'401-retry'`            — the retry leg of `authenticatedFetch` after a 401. A real Inoreader call against the Zone-1 quota.
 */
const CATEGORIES = {
  'cron-radar': { zone1: true },
  'live-radar': { zone1: true },
  'http-radar-snapshot': { zone1: true },
  'oauth-refresh': { zone1: false },
  '401-retry': { zone1: true },
} as const satisfies Record<string, { zone1: boolean }>;

export type InoreaderEgressCategory = keyof typeof CATEGORIES;

/** All categories. Derived from the source-of-truth map. */
export const INOREADER_EGRESS_CATEGORIES = Object.keys(CATEGORIES) as InoreaderEgressCategory[];

/** Does this category contribute to Inoreader's Zone-1 daily quota? */
export function categoryCountsAgainstZone1(cat: InoreaderEgressCategory): boolean {
  return CATEGORIES[cat].zone1;
}

const SPEND_KEY_PREFIX = 'mcp:inoreader:zone1-spend:';
const DRIFT_ALERT_FLAG_PREFIX = 'mcp:inoreader:drift-alerted:';

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
  const inZone1 = CATEGORIES[opts.category].zone1;

  // Always emit the structured log line — even when Upstash is unreachable,
  // wrangler-tail observers still see the per-call breadcrumb.
  safeLog({
    event: 'inoreader.egress',
    category: opts.category,
    status: opts.status,
    success: opts.status >= 200 && opts.status < 300,
    ...(opts.zone1UsageHeader !== undefined ? { zone1Usage: opts.zone1UsageHeader } : {}),
    ...(opts.source ? { egressSource: opts.source } : {}),
  });

  const redis = createMcpClient(opts.env);
  if (!redis) return;

  try {
    // BL-032.75 Phase 0 (audit fix C1): always re-issue EXPIRE on every
    // INCR. The previous "only set TTL when INCR returns 1" optimization
    // was non-atomic — a Worker isolate evicted between INCR and EXPIRE
    // would leave the key permanent and the counter would survive past
    // UTC rollover. Always-EXPIRE is idempotent and ~free; the next
    // successful call repairs any prior partial-fail. Cost: 2 extra
    // Upstash ops per call (~120/day at current scale; free-tier headroom
    // is orders of magnitude larger).
    const catKey = categorySpendKey(opts.category);
    await redis.incr(catKey);
    await redis.expire(catKey, TTL_SECONDS);

    if (!inZone1) return;

    const tKey = totalSpendKey();
    const tNext = await redis.incr(tKey);
    await redis.expire(tKey, TTL_SECONDS);

    await maybeAlertDrift(opts.env, redis, opts.category, tNext, opts.zone1UsageHeader);
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
 * Drift detection with daily debounce (audit fix S4).
 *
 * Without the debounce, every call within a drifted day re-evaluates the
 * drift condition and re-emits the Sentry breadcrumb — easily 100+
 * captureMessage calls per day. Sentry's fingerprint-based dedupe shows
 * one issue in the UI, but the underlying event quota still ticks.
 *
 * The debounce uses an atomic SET-NX-EX flag (`mcp:inoreader:drift-alerted:
 * <UTC-date>`). The first drifted call of a UTC day SETs the flag and emits;
 * subsequent calls see the SET return null and stay silent. The counters
 * themselves keep the operator-visible truth in `/health.inoreaderSpend`.
 *
 * Falls open silently on Upstash flap: if the flag SET throws, we just
 * don't emit (rather than firing 100×). Observability must never throw.
 */
async function maybeAlertDrift(
  env: Env,
  redis: Redis,
  category: InoreaderEgressCategory,
  counter: number,
  observed: number | undefined
): Promise<void> {
  if (observed === undefined || !Number.isFinite(observed)) return;
  const drift = counter - observed;
  if (Math.abs(drift) <= DRIFT_THRESHOLD_ABS) return;

  const alertOk = await trySetDailyAlertFlag(redis);
  if (!alertOk) return; // already alerted today, or Upstash unreachable

  await captureMessageEnvelope(
    env,
    'inoreader.spend.drift',
    'warning',
    {
      counter,
      observed,
      drift,
      category,
    },
    'inoreader.spend.drift',
    {
      'inoreader.spend.drift': drift,
      'inoreader.spend.counter': counter,
      'inoreader.spend.observed': observed,
      'inoreader.spend.category': category,
    }
  );
}

/**
 * Returns `true` when the daily-debounce flag was newly set (so the caller
 * should emit), `false` when the flag was already set today (already
 * emitted) or when Upstash is unreachable (fail-silent — better to lose
 * one drift event than to spam).
 */
async function trySetDailyAlertFlag(redis: Redis): Promise<boolean> {
  try {
    const key = `${DRIFT_ALERT_FLAG_PREFIX}${todayUtc()}`;
    const result = await redis.set(key, '1', { nx: true, ex: TTL_SECONDS });
    return result === 'OK';
  } catch {
    return false;
  }
}

/**
 * Build a zero-initialized per-category record. Derived from the
 * `CATEGORIES` source-of-truth so new categories don't require touching
 * a second place. Audit fix M2.
 */
function emptyByCategory(): Record<InoreaderEgressCategory, number> {
  return INOREADER_EGRESS_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = 0;
      return acc;
    },
    {} as Record<InoreaderEgressCategory, number>
  );
}

/**
 * Read today's spend totals for `/health` reporting. Returns zeros for any
 * missing/unreachable counter rather than throwing.
 *
 * Uses MGET (audit fix S2) so the entire read is one Upstash round-trip,
 * not 1 + N. `/health` is polled by uptime monitors — at 1 probe/min that's
 * the difference between ~1440 reads/day and ~10000 reads/day from this
 * code path alone.
 */
export async function readInoreaderSpend(env: Env): Promise<{
  total: number;
  byCategory: Record<InoreaderEgressCategory, number>;
}> {
  const byCategory = emptyByCategory();

  const redis = createMcpClient(env);
  if (!redis) return { total: 0, byCategory };

  try {
    const date = todayUtc();
    // Order is load-bearing: index 0 = total; indices 1..N = categories
    // in INOREADER_EGRESS_CATEGORIES order. The deconstruction below
    // mirrors the construction here.
    const keys: string[] = [
      totalSpendKey(date),
      ...INOREADER_EGRESS_CATEGORIES.map((c) => categorySpendKey(c, date)),
    ];
    const values = (await redis.mget<(number | string | null)[]>(...keys)) ?? [];

    const total = toFiniteNumber(values[0]);
    INOREADER_EGRESS_CATEGORIES.forEach((cat, i) => {
      byCategory[cat] = toFiniteNumber(values[i + 1]);
    });

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
