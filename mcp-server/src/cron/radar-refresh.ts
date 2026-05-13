/**
 * Hourly radar snapshot refresh (BL-032.5 Phase 4).
 *
 * Cloudflare Cron Trigger fires this every hour (see `wrangler.toml`
 * `[triggers] crons`). It force-refreshes both Upstash radar cache
 * tiers — `mcp:radar:cache:wire` and `mcp:radar:cache:fyi` — so MCP
 * Resource consumers (Claude Desktop, Claude Code, mobile clients)
 * see snapshots that are at most 60 minutes stale, independent of
 * read traffic.
 *
 * **Inoreader budget protection**: each refresh consumes up to 6
 * Inoreader API calls (1 tag-list + 4 folder fetches for wire, plus 1
 * annotated-items fetch for fyi). Combined with website ISR (~28/day)
 * and rate-limited live tools (~8/day in steady state), the daily
 * total stays under the 200/day Inoreader cap. Two guards prevent
 * over-spending in pathological cases:
 *
 *   1. **Circuit breaker** — if `mcp:radar:circuit-open` is set
 *      (some upstream call recently hit Inoreader's 429), skip the
 *      refresh entirely. The flag self-heals via 6h TTL.
 *   2. **Daily soft cap** — `mcp:inoreader:day-counter:<YYYY-MM-DD>`
 *      tracks calls made by THIS module. When it reaches 180, the
 *      Cron skips until midnight UTC (counter expires).
 *
 * **Observability**: every run emits one of:
 *   - `cron.radar-refresh.success` (info)        — both tiers refreshed
 *   - `cron.radar-refresh.partial` (warning)     — one tier failed
 *   - `cron.radar-refresh.skipped` (info)        — guard tripped
 *   - `cron.radar-refresh.error` (error)         — uncaught exception
 *
 * BL-032.75 alert rules consume these messages + the new
 * `radarSnapshotAgeSeconds` field on `/health` to surface staleness.
 */

import { readWireLive, readFyiLive } from '../content/radar-live-store';
import { isCircuitOpen } from '../ratelimit/circuit-breaker';
import { createMcpClient } from '../lib/upstash-clients';
import { captureMessage } from '../observability/sentry';
import { safeLog } from '../auth/safe-logger';
import type { Env } from '../worker';

const DAILY_SOFT_CAP = 180;
/** Approximate Inoreader call count for one full refresh (5 wire + 1 fyi). */
const CALLS_PER_REFRESH = 6;
/** Day-counter Upstash key prefix; suffix is UTC `YYYY-MM-DD`. */
const DAY_COUNTER_PREFIX = 'mcp:inoreader:day-counter:';
/** TTL slightly past 24h so the key naturally rolls over at UTC midnight. */
const DAY_COUNTER_TTL_SECONDS = 25 * 60 * 60;

function todayUtcKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${DAY_COUNTER_PREFIX}${y}-${m}-${d}`;
}

/**
 * Read today's Inoreader call counter. Returns 0 on miss / Upstash
 * unreachable (fail-open — Cron will run rather than silently skipping
 * because of infrastructure noise).
 */
async function readDayCounter(env: Env): Promise<number> {
  const redis = createMcpClient(env);
  if (!redis) return 0;
  try {
    const raw = await redis.get<number | string>(todayUtcKey());
    if (raw == null) return 0;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Increment today's counter by the supplied amount. Best-effort —
 * Upstash unreachable returns silently.
 */
async function incrementDayCounter(env: Env, by: number): Promise<void> {
  const redis = createMcpClient(env);
  if (!redis) return;
  const key = todayUtcKey();
  try {
    // INCRBY returns the new value; on first increment of the day we also
    // set the TTL so the key auto-rolls at UTC midnight.
    const next = await redis.incrby(key, by);
    if (next === by) {
      await redis.expire(key, DAY_COUNTER_TTL_SECONDS);
    }
  } catch {
    // Counter is a soft cap. Failing to record the increment means the
    // next run might overshoot by one tick — acceptable; safeLog below
    // surfaces this to the operator.
    safeLog({
      event: 'cron.radar-refresh.counter-write-failed',
      reason: 'upstash-error',
    });
  }
}

/**
 * Hourly Cron handler. Idempotent; safe to invoke manually via
 * `wrangler triggers test` for verification.
 *
 * Returns a result envelope so unit tests can assert on the path taken
 * without instrumenting Sentry / Upstash mocks. Production callers
 * ignore the return value — `scheduled` handlers don't have a response
 * surface beyond status code.
 */
export type RefreshOutcome =
  | { kind: 'success'; wireItems: number; fyiItems: number }
  | { kind: 'partial'; wireOk: boolean; fyiOk: boolean }
  | { kind: 'skipped'; reason: 'circuit-open' | 'day-cap-reached'; counter?: number }
  | { kind: 'error'; message: string };

export async function refreshRadarSnapshot(env: Env): Promise<RefreshOutcome> {
  // Guard 1 — circuit breaker. `isCircuitOpen` returns null when Upstash
  // isn't reachable; treat as "no signal, proceed."
  const circuit = await isCircuitOpen(env);
  if (circuit?.open) {
    captureMessage(
      'cron.radar-refresh.skipped',
      'info',
      { reason: 'circuit-open', retryAfterSeconds: circuit.retryAfterSeconds },
      'cron.radar-refresh'
    );
    safeLog({
      event: 'cron.radar-refresh.skipped',
      reason: 'circuit-open',
    });
    return { kind: 'skipped', reason: 'circuit-open' };
  }

  // Guard 2 — daily soft cap. Skip if next refresh would push us over.
  const counter = await readDayCounter(env);
  if (counter + CALLS_PER_REFRESH > DAILY_SOFT_CAP) {
    captureMessage(
      'cron.radar-refresh.skipped',
      'info',
      { reason: 'day-cap-reached', counter, cap: DAILY_SOFT_CAP },
      'cron.radar-refresh'
    );
    safeLog({
      event: 'cron.radar-refresh.skipped',
      reason: 'day-cap-reached',
    });
    return { kind: 'skipped', reason: 'day-cap-reached', counter };
  }

  try {
    const [wire, fyi] = await Promise.all([
      readWireLive(env, { forceRefresh: true }),
      readFyiLive(env, 30, { forceRefresh: true }),
    ]);

    // Increment regardless of outcome — the Inoreader calls happened (or
    // were attempted) whether or not the parsed response was usable.
    await incrementDayCounter(env, CALLS_PER_REFRESH);

    if (wire.ok && fyi.ok) {
      captureMessage(
        'cron.radar-refresh.success',
        'info',
        { wireItems: wire.items.length, fyiItems: fyi.items.length },
        'cron.radar-refresh'
      );
      safeLog({
        event: 'cron.radar-refresh.success',
        success: true,
      });
      return { kind: 'success', wireItems: wire.items.length, fyiItems: fyi.items.length };
    }

    // At least one tier failed. Don't escalate to 'error' — the radar-live
    // tools will surface a service-degraded response if the operator hits
    // them; the BL-032.75 alert rule on `radarSnapshotAgeSeconds` catches
    // sustained refresh failures.
    captureMessage(
      'cron.radar-refresh.partial',
      'warning',
      {
        wireOk: wire.ok,
        fyiOk: fyi.ok,
        wireReason: !wire.ok ? wire.reason : undefined,
        fyiReason: !fyi.ok ? fyi.reason : undefined,
      },
      'cron.radar-refresh'
    );
    safeLog({
      event: 'cron.radar-refresh.partial',
      success: false,
      errorCode: !wire.ok ? wire.reason : !fyi.ok ? fyi.reason : 'unknown',
    });
    return { kind: 'partial', wireOk: wire.ok, fyiOk: fyi.ok };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    captureMessage('cron.radar-refresh.error', 'error', { message }, 'cron.radar-refresh');
    safeLog({
      event: 'cron.radar-refresh.error',
      success: false,
      errorCode: 'uncaught-exception',
      reason: message.slice(0, 200),
    });
    return { kind: 'error', message };
  }
}
