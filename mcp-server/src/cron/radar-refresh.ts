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
import { captureMessageEnvelope } from '../observability/sentry-envelope';
import { handleInoreaderFailure } from '../lib/inoreader-failure-handler';
import { refreshAccessToken } from '../lib/inoreader-oauth';
import { KV_MCP_ACCESS_TOKEN_KEY } from '../lib/inoreader-token-store';
import { safeLog } from '../auth/safe-logger';
import type { Env } from '../worker';

/**
 * BL-032.8 Phase 2 — proactive refresh threshold. If the access token
 * has less than 5 minutes of TTL remaining when cron fires, refresh it
 * BEFORE the radar fetch so the fetch doesn't pay the 401-retry latency.
 *
 * Live-tool calls don't share this threshold — they take the reactive
 * 401-then-retry path because checking TTL on every live request adds
 * a hot-path Upstash round-trip for marginal benefit (live calls are
 * already retry-tolerant by design).
 */
const PROACTIVE_REFRESH_THRESHOLD_SECONDS = 300;

const DAILY_SOFT_CAP = 180;
/**
 * Inoreader call cost per tier on a successful refresh. Wire tier =
 * 1 tag-list + 4 folder fetches (5 total); FYI tier = 1 annotated-items
 * fetch (1 total). Combined: 6 calls/refresh.
 *
 * T.Z.1 (BL-032.7) — these are NOW used for per-tier accounting: the
 * day-counter is incremented by the sum of `CALLS_PER_*` for tiers
 * that returned ok. A tier that returned 429 / token-stale / network-
 * timeout consumes ZERO budget (Inoreader rejects before serving
 * content). Pre-T.Z.1, `CALLS_PER_REFRESH = 6` was added regardless of
 * outcome, leaking the cap during multi-hour 429 episodes; that broke
 * the counter-as-budget-proxy invariant.
 */
/**
 * Wire-tier cost = 1 tag-list ([`inoreader-client.ts` `fetchAllStreams`
 * tag-list call](../lib/inoreader-client.ts) at the `tagsUrl` line) + 4
 * folder fetches (one per GST-prefixed folder; folder count documented in
 * `fetchAllStreams`'s docstring at [`inoreader-client.ts:381-385`](../lib/inoreader-client.ts#L381-L385)).
 * If a 5th GST-* folder is added, this constant must update — the
 * `inoreader-call-count-regression.test.ts` (BL-032.75 Phase 0) test
 * asserts the actual HTTP call count matches the constant so a CI run
 * fails loudly on drift.
 */
const CALLS_PER_WIRE = 5;
/**
 * FYI-tier cost = 1 annotated-items fetch
 * ([`fetchAnnotatedItems`](../lib/inoreader-client.ts) — single
 * `authenticatedFetch` call per invocation).
 */
const CALLS_PER_FYI = 1;
/**
 * Sum of the per-tier costs. Used by the day-cap pre-flight guard
 * (`counter + CALLS_PER_REFRESH > DAILY_SOFT_CAP`) — we still gate on
 * the WORST-CASE consumption, so a refresh that might succeed on both
 * tiers won't be allowed to push us past the cap. Locked at 6
 * (BL-032.75 Phase 0 pre-impl audit confirmed against the live code).
 */
const CALLS_PER_REFRESH = CALLS_PER_WIRE + CALLS_PER_FYI;
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
/**
 * T.Z.1 (BL-032.7) — `partial` outcomes split into two sub-kinds so
 * callers + tests can distinguish "one tier succeeded, the other
 * didn't" (cache still useful, partial budget consumed) from "both
 * tiers failed" (no budget consumed, but staleness alerts should fire
 * faster). Pre-T.Z.1 these were collapsed into one `partial` kind,
 * which masked the multi-hour Inoreader degradation pattern surfaced
 * during the 2026-05-15 BL-032.6 demo-day RCA.
 */
export type RefreshOutcome =
  | { kind: 'success'; wireItems: number; fyiItems: number; callsConsumed: number }
  | {
      kind: 'partial-one-tier-ok';
      wireOk: boolean;
      fyiOk: boolean;
      callsConsumed: number;
    }
  | { kind: 'partial-both-failed'; wireReason: string; fyiReason: string }
  | { kind: 'skipped'; reason: 'circuit-open' | 'day-cap-reached'; counter?: number }
  | { kind: 'error'; message: string };

export async function refreshRadarSnapshot(env: Env): Promise<RefreshOutcome> {
  // Guard 1 — circuit breaker. `isCircuitOpen` returns null when Upstash
  // isn't reachable; treat as "no signal, proceed."
  const circuit = await isCircuitOpen(env);
  if (circuit?.open) {
    await captureMessageEnvelope(
      env,
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
    await captureMessageEnvelope(
      env,
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

  // BL-032.8 Phase 2 — proactive token refresh.
  //
  // If the access token is about to expire (< 5 min remaining), refresh it
  // BEFORE the parallel radar fetch so the fetch doesn't pay the
  // 401-then-retry latency. Cron is the right surface for this proactive
  // check because (a) it runs on a predictable schedule, (b) it's
  // latency-tolerant, and (c) it pre-warms the token for any live calls
  // that arrive in the minutes immediately after.
  //
  // The check is best-effort: any failure (lock-timeout, inoreader-error,
  // upstash-write-failed) falls through to the radar fetch, which will
  // exercise the reactive 401 self-heal cascade in inoreader-client.ts if
  // needed. Sentry observability fires on the refreshAccessToken side, so
  // we don't double-capture here.
  await maybeProactiveRefresh(env);

  try {
    const [wire, fyi] = await Promise.all([
      readWireLive(env, { forceRefresh: true, source: 'cron' }),
      readFyiLive(env, 30, { forceRefresh: true, source: 'cron' }),
    ]);

    // T.Z.1 (BL-032.7) — only count Inoreader calls that actually
    // succeeded. A tier that 429'd (or hit any other upstream failure)
    // consumed zero successful calls; counting them anyway burns the
    // soft cap on no-op fetches and was the load-bearing cause of the
    // 2026-05-15 demo-day budget leak. Each tier's cost is independent
    // and reflects only the tier-specific endpoints called.
    const wireCalls = wire.ok ? CALLS_PER_WIRE : 0;
    const fyiCalls = fyi.ok ? CALLS_PER_FYI : 0;
    const callsConsumed = wireCalls + fyiCalls;
    if (callsConsumed > 0) {
      await incrementDayCounter(env, callsConsumed);
    }

    if (wire.ok && fyi.ok) {
      await captureMessageEnvelope(
        env,
        'cron.radar-refresh.success',
        'info',
        { wireItems: wire.items.length, fyiItems: fyi.items.length, callsConsumed },
        'cron.radar-refresh'
      );
      safeLog({
        event: 'cron.radar-refresh.success',
        success: true,
      });
      return {
        kind: 'success',
        wireItems: wire.items.length,
        fyiItems: fyi.items.length,
        callsConsumed,
      };
    }

    // At least one tier failed. Don't escalate to 'error' — the radar-live
    // tools will surface a service-degraded response if the operator hits
    // them; the BL-032.75 alert rule on `radarSnapshotAgeSeconds` catches
    // sustained refresh failures.
    //
    // T.Z.1 (BL-032.7) — split into `partial-one-tier-ok` (cache half-
    // refreshed, some Inoreader budget consumed) vs `partial-both-failed`
    // (zero budget consumed, faster staleness alert path).
    //
    // T.Z.2 (BL-032.7) — route any tier-level inoreader-rate-limit
    // failure through the shared handler so the circuit breaker opens
    // immediately, identically to how the live tool path handles it.
    // Pre-T.Z.2 the cron emitted only a partial event and let the next
    // live tool call trip the breaker — extending the degradation
    // window by 6h on top of the upstream incident.
    if (!wire.ok) {
      await handleInoreaderFailure(env, wire, 'cron-wire');
    }
    if (!fyi.ok) {
      await handleInoreaderFailure(env, fyi, 'cron-fyi');
    }
    const bothFailed = !wire.ok && !fyi.ok;
    await captureMessageEnvelope(
      env,
      bothFailed ? 'cron.radar-refresh.partial-both-failed' : 'cron.radar-refresh.partial',
      'warning',
      {
        wireOk: wire.ok,
        fyiOk: fyi.ok,
        wireReason: !wire.ok ? wire.reason : undefined,
        fyiReason: !fyi.ok ? fyi.reason : undefined,
        callsConsumed,
      },
      bothFailed ? 'cron.radar-refresh.partial-both-failed' : 'cron.radar-refresh.partial'
    );
    safeLog({
      event: bothFailed ? 'cron.radar-refresh.partial-both-failed' : 'cron.radar-refresh.partial',
      success: false,
      errorCode: !wire.ok ? wire.reason : !fyi.ok ? fyi.reason : 'unknown',
    });
    if (bothFailed) {
      // Both .ok === false, so .reason exists on both branches.
      const wireReason = !wire.ok ? wire.reason : 'unknown';
      const fyiReason = !fyi.ok ? fyi.reason : 'unknown';
      return { kind: 'partial-both-failed', wireReason, fyiReason };
    }
    return {
      kind: 'partial-one-tier-ok',
      wireOk: wire.ok,
      fyiOk: fyi.ok,
      callsConsumed,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await captureMessageEnvelope(
      env,
      'cron.radar-refresh.error',
      'error',
      { message },
      'cron.radar-refresh'
    );
    safeLog({
      event: 'cron.radar-refresh.error',
      success: false,
      errorCode: 'uncaught-exception',
      reason: message.slice(0, 200),
    });
    return { kind: 'error', message };
  }
}

/**
 * BL-032.8 Phase 2 — Proactive token refresh on cron.
 *
 * Reads the remaining TTL of `mcp:inoreader:access_token`. If less than
 * `PROACTIVE_REFRESH_THRESHOLD_SECONDS` remain (or the key is absent),
 * calls `refreshAccessToken('cron')` to top it up before the radar fetch.
 *
 * Failure handling is intentionally permissive: any non-ok result from
 * `refreshAccessToken` falls through, and the subsequent radar fetch's
 * reactive 401-self-heal cascade in `inoreader-client.ts` will take
 * another swing. Cron is the "best opportunity" path, not the "only
 * opportunity" path.
 *
 * Returns nothing — all observability is delegated to the OAuth module
 * (it emits its own `safeLog`/`captureMessage` per outcome) plus a
 * lightweight `cron.proactive-refresh.*` event here.
 */
async function maybeProactiveRefresh(env: Env): Promise<void> {
  const redis = createMcpClient(env);
  if (!redis) {
    // No MCP DB bound; nothing to check or write. The reactive path will
    // exercise refreshAccessToken on first 401 anyway.
    return;
  }

  let ttlSeconds: number | null;
  try {
    // Upstash TTL returns the remaining lifetime in seconds. A return of
    // -2 means "key does not exist"; -1 means "no expiry"; otherwise the
    // remaining seconds. We treat -2 (absent) as below-threshold so the
    // first cron run after a token wipe pre-warms the cache.
    const raw = await redis.ttl(KV_MCP_ACCESS_TOKEN_KEY);
    ttlSeconds = typeof raw === 'number' ? raw : null;
  } catch {
    // Upstash unreachable for TTL probe — skip the proactive check; the
    // reactive path remains available.
    return;
  }

  // ttl === -1 means no expiry (shouldn't happen for access_token but
  // handle gracefully); ttl === -2 means absent (treat as expired).
  // Positive values are remaining seconds.
  const needsRefresh =
    ttlSeconds === null ||
    ttlSeconds === -2 ||
    (ttlSeconds >= 0 && ttlSeconds < PROACTIVE_REFRESH_THRESHOLD_SECONDS);

  if (!needsRefresh) {
    safeLog({
      event: 'cron.proactive-refresh.skipped',
      reason: 'ttl-fresh',
      durationMs: 0,
    });
    return;
  }

  safeLog({
    event: 'cron.proactive-refresh.triggered',
    reason: ttlSeconds === -2 ? 'token-absent' : `ttl-${ttlSeconds}s`,
  });
  // refreshAccessToken emits its own outcome log + Sentry capture; we
  // don't re-capture here.
  await refreshAccessToken(env, 'cron');
}
