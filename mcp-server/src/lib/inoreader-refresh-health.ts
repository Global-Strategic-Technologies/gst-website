/**
 * BL-047 T3 + T4 — Inoreader OAuth refresh-token health telemetry.
 *
 * Surfaces three pieces of operational state about the refresh path:
 *
 *   1. **Refresh-success cadence** (T4) — date-bucketed counter
 *      `mcp:inoreader:refresh-success:<YYYY-MM-DD>` incremented on every
 *      successful `RefreshResult.ok === true`. Pair with the failure
 *      counters to compute a refresh-failure rate without leaving the
 *      worker.
 *
 *   2. **Per-reason failure cadence** (T4) — date-bucketed counters
 *      `mcp:inoreader:refresh-failure:<reason>:<YYYY-MM-DD>` for each of
 *      the four failure modes (`invalid-refresh-token`, `token-missing`,
 *      `upstash-write-failed`, `inoreader-error`). Lets the operator see
 *      WHICH failure dominates rather than just total-failure-count.
 *
 *   3. **Rotation cadence** (T3) — date-bucketed counter
 *      `mcp:inoreader:rotations:<YYYY-MM-DD>` incremented on every
 *      detected refresh-token rotation (Inoreader returned a NEW
 *      refresh_token, not the same one we sent). 30 days of this counter
 *      empirically answers the rotation-regime open question pinned in
 *      `mcp-server/src/docs/operations/INOREADER_OAUTH_CONTRACT.md` § 6.
 *
 * Plus two pointer keys for leading-indicator visibility:
 *
 *   - `mcp:inoreader:last-refresh-success-at` — ISO timestamp SET on each
 *     successful refresh. Drives `ageSinceLastSuccessfulRefreshSeconds`
 *     in `/health` so the operator sees "we have not refreshed in 18h"
 *     BEFORE the next refresh attempts and fails.
 *   - `mcp:inoreader:last-rotation-at` — ISO timestamp SET on each
 *     rotation event. Combined with the rotations counter this answers
 *     "are we in a sparse-rotation or dense-rotation regime?" empirically.
 *
 * **Fail-open contract**: every recorder swallows Upstash errors so a
 * downstream observability failure NEVER blocks the OAuth refresh path
 * itself. The reader path returns null/zero values when Upstash is
 * unreachable so `/health` keeps responding.
 *
 * **TTL**: counters expire at 25h (90000s) — enough to outlast the daily
 * roll-over so yesterday's data stays readable for ~1h into today.
 * Pointer timestamps have no TTL (they're overwritten on each event;
 * stale values are themselves the signal).
 */

import { Redis } from '@upstash/redis';
import { createMcpClient } from './upstash-clients';
import { safeLog } from '../auth/safe-logger';
import { captureMessageEnvelope } from '../observability/sentry-envelope';
import type { Env } from '../worker';

const KEY_REFRESH_SUCCESS_PREFIX = 'mcp:inoreader:refresh-success:';
const KEY_REFRESH_FAILURE_PREFIX = 'mcp:inoreader:refresh-failure:';
const KEY_ROTATIONS_PREFIX = 'mcp:inoreader:rotations:';
const KEY_LAST_SUCCESS = 'mcp:inoreader:last-refresh-success-at';
const KEY_LAST_ROTATION = 'mcp:inoreader:last-rotation-at';
const COUNTER_TTL_SECONDS = 90_000; // 25 hours

export type RefreshFailureReason =
  'invalid-refresh-token' | 'token-missing' | 'upstash-write-failed' | 'inoreader-error';

const FAILURE_REASONS: readonly RefreshFailureReason[] = [
  'invalid-refresh-token',
  'token-missing',
  'upstash-write-failed',
  'inoreader-error',
];

export interface InoreaderRefreshTokenHealth {
  lastSuccessfulRefreshAt: string | null;
  ageSinceLastSuccessfulRefreshSeconds: number | null;
  lastRotationAt: string | null;
  rotationsLast24h: number;
  refreshSuccessLast24h: number;
  recentRefreshFailureCounts: Record<RefreshFailureReason, number>;
}

const ZERO_HEALTH: InoreaderRefreshTokenHealth = {
  lastSuccessfulRefreshAt: null,
  ageSinceLastSuccessfulRefreshSeconds: null,
  lastRotationAt: null,
  rotationsLast24h: 0,
  refreshSuccessLast24h: 0,
  recentRefreshFailureCounts: {
    'invalid-refresh-token': 0,
    'token-missing': 0,
    'upstash-write-failed': 0,
    'inoreader-error': 0,
  },
};

function utcDayBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function bump(redis: Redis, key: string): Promise<void> {
  await redis.incr(key);
  // Best-effort TTL set on every INCR — Upstash returns 0 on first INCR
  // (no TTL set) and then EXPIRE pins the lifecycle. Repeated EXPIRE on
  // subsequent days is harmless (resets the TTL clock; counters that
  // get traffic stay readable; cold counters expire on schedule).
  await redis.expire(key, COUNTER_TTL_SECONDS);
}

/**
 * T4 — record a successful refresh. Increments the day counter and SETs
 * the last-success pointer. Never throws.
 */
export async function recordRefreshSuccess(env: Env): Promise<void> {
  const redis = createMcpClient(env);
  if (!redis) return;
  const now = new Date();
  try {
    await Promise.all([
      bump(redis, `${KEY_REFRESH_SUCCESS_PREFIX}${utcDayBucket(now)}`),
      redis.set(KEY_LAST_SUCCESS, now.toISOString()),
    ]);
  } catch {
    // Fail-open — observability failure must never block OAuth.
  }
}

/**
 * T4 — record a refresh failure by reason. Increments the per-reason day
 * counter. Never throws.
 */
export async function recordRefreshFailure(env: Env, reason: RefreshFailureReason): Promise<void> {
  const redis = createMcpClient(env);
  if (!redis) return;
  try {
    await bump(redis, `${KEY_REFRESH_FAILURE_PREFIX}${reason}:${utcDayBucket()}`);
  } catch {
    // Fail-open.
  }
}

/**
 * T3 — record a refresh-token rotation event. Increments the rotations
 * day counter, SETs the last-rotation pointer, emits a `safeLog` entry
 * with `event: 'inoreader.oauth.rotation'`, and emits a Sentry event
 * `inoreader.oauth.refresh-token.rotated` so the regime question can
 * be answered from the Sentry timeline as well as the Upstash counter.
 *
 * Caller invokes this at the rotation-detected branch of
 * `inoreader-oauth.ts:332` (`parsed.refresh_token !== refreshToken`).
 *
 * Never throws.
 */
export async function recordRotation(env: Env): Promise<void> {
  const redis = createMcpClient(env);
  const now = new Date();
  safeLog({
    event: 'inoreader.oauth.rotation',
    success: true,
  });
  // Sentry event is independent of Upstash health — fire it first so a
  // sustained Upstash outage doesn't suppress the regime telemetry.
  await captureMessageEnvelope(
    env,
    'Inoreader refresh-token rotated',
    'info',
    { occurredAt: now.toISOString() },
    'inoreader.oauth.refresh-token.rotated'
  );
  if (!redis) return;
  try {
    await Promise.all([
      bump(redis, `${KEY_ROTATIONS_PREFIX}${utcDayBucket(now)}`),
      redis.set(KEY_LAST_ROTATION, now.toISOString()),
    ]);
  } catch {
    // Fail-open.
  }
}

/**
 * BL-047 — record a grace-window hedge recovery event. Fires when a
 * primary refresh failed with `invalid_grant` but a retry with the
 * in-memory cached previous token succeeded. Empirically observable
 * proof that the grace-window hedge is closing real failure modes;
 * sustained zero-count would suggest the hedge could be retired.
 *
 * Emits:
 *   - safeLog `{ event: 'inoreader.oauth.grace-window-recovery' }`
 *   - Sentry envelope event tagged `inoreader.oauth.grace-window-recovery`
 *     (info-level — never pages; the recovery itself is the success)
 *   - Upstash counter `mcp:inoreader:grace-recovery:<YYYY-MM-DD>`
 *
 * Never throws.
 */
export async function recordGraceWindowRecovery(env: Env): Promise<void> {
  const redis = createMcpClient(env);
  const now = new Date();
  safeLog({
    event: 'inoreader.oauth.grace-window-recovery',
    success: true,
  });
  await captureMessageEnvelope(
    env,
    'Inoreader refresh-token grace-window recovery',
    'info',
    { occurredAt: now.toISOString() },
    'inoreader.oauth.grace-window-recovery'
  );
  if (!redis) return;
  try {
    await bump(redis, `mcp:inoreader:grace-recovery:${utcDayBucket(now)}`);
  } catch {
    // Fail-open.
  }
}

/**
 * T4 — read the refresh-token health surface for `/health`. Single
 * round-trip via MGET (Upstash REST batches). Fail-open: returns all
 * zeros / nulls when Upstash is unreachable.
 */
export async function readRefreshHealth(env: Env): Promise<InoreaderRefreshTokenHealth> {
  const redis = createMcpClient(env);
  if (!redis) return ZERO_HEALTH;
  const today = utcDayBucket();
  const failureKeys = FAILURE_REASONS.map(
    (r) => `${KEY_REFRESH_FAILURE_PREFIX}${r}:${today}` as const
  );
  try {
    // mget returns one entry per requested key; ordering is preserved.
    const values = await redis.mget<(string | number | null)[]>(
      KEY_LAST_SUCCESS,
      KEY_LAST_ROTATION,
      `${KEY_REFRESH_SUCCESS_PREFIX}${today}`,
      `${KEY_ROTATIONS_PREFIX}${today}`,
      ...failureKeys
    );
    const [lastSuccess, lastRotation, successCount, rotationsCount, ...failureCounts] = values;
    const lastSuccessIso = typeof lastSuccess === 'string' ? lastSuccess : null;
    const parsedSuccessTs = lastSuccessIso ? Date.parse(lastSuccessIso) : NaN;
    return {
      lastSuccessfulRefreshAt: lastSuccessIso,
      ageSinceLastSuccessfulRefreshSeconds: Number.isFinite(parsedSuccessTs)
        ? Math.max(0, Math.floor((Date.now() - parsedSuccessTs) / 1000))
        : null,
      lastRotationAt: typeof lastRotation === 'string' ? lastRotation : null,
      rotationsLast24h: toCount(rotationsCount),
      refreshSuccessLast24h: toCount(successCount),
      recentRefreshFailureCounts: {
        'invalid-refresh-token': toCount(failureCounts[0]),
        'token-missing': toCount(failureCounts[1]),
        'upstash-write-failed': toCount(failureCounts[2]),
        'inoreader-error': toCount(failureCounts[3]),
      },
    };
  } catch {
    return ZERO_HEALTH;
  }
}

function toCount(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
