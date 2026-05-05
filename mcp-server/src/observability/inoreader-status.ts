/**
 * Cached Inoreader-liveness state for the /health endpoint (BL-032 Q8).
 *
 * **Why this exists**: a naive `/health` implementation would call Inoreader
 * on every probe to confirm liveness. Health endpoints get hammered by
 * uptime monitors — the BACKLOG calls out this exact failure mode. So
 * we instead **cache the last observed Inoreader response status** in
 * Upstash with a short TTL. The radar-live tools' real Inoreader calls
 * write to this key; the health endpoint just reads it.
 *
 * Status semantics:
 *   - `'ok'`        — last Inoreader call within the TTL window was 2xx
 *   - `'degraded'`  — last Inoreader call returned 429 / 5xx / timed out
 *   - `'unknown'`   — no recent radar-live call (TTL expired, or Worker
 *                     hasn't served any radar request since cold start)
 *
 * `'unknown'` is **not a failure** — it's a literal "we don't know yet."
 * The health endpoint reports it as such so dashboards can distinguish
 * "Inoreader is broken" from "no traffic yet to test against."
 *
 * **TTL**: 5 minutes. Long enough that radar-tool traffic keeps the flag
 * fresh under normal load; short enough that a stale flag doesn't mask a
 * sudden Inoreader degradation for too long.
 */

import { Redis } from '@upstash/redis';
import type { Env } from '../worker';

const STATUS_KEY = 'mcp:inoreader:last-status';
const STATUS_TTL_SECONDS = 5 * 60;

export type InoreaderStatus = 'ok' | 'degraded' | 'unknown';

interface StatusEntry {
  readonly status: 'ok' | 'degraded';
  readonly observedAt: string;
  /** Optional context — error code on degraded; method name on ok. */
  readonly note?: string;
}

function tryRedis(env: Env): Redis | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Record the last observed Inoreader status. Called from the radar-live
 * tools after each Inoreader call:
 *
 *   - on `ok` (2xx response with parsed body): `recordInoreaderStatus(env, 'ok')`
 *   - on `degraded` (429 / 5xx / timeout / token-stale): `recordInoreaderStatus(env, 'degraded', reason)`
 *
 * Best-effort write — Upstash failures are swallowed (caller proceeds).
 * No-op when Upstash creds aren't bound.
 */
export async function recordInoreaderStatus(
  env: Env,
  status: 'ok' | 'degraded',
  note?: string
): Promise<void> {
  const redis = tryRedis(env);
  if (!redis) return;

  const entry: StatusEntry = {
    status,
    observedAt: new Date().toISOString(),
    note,
  };

  try {
    await redis.set(STATUS_KEY, JSON.stringify(entry), { ex: STATUS_TTL_SECONDS });
  } catch {
    // Best-effort. Status reporting is observability, not auth — degraded
    // Upstash shouldn't fail user requests.
  }
}

/**
 * Read the cached Inoreader status. Returns `'unknown'` when no entry
 * exists (TTL expired or never written) OR when Upstash is unreachable.
 * Also returns the timestamp of the last observation so the health
 * endpoint can surface its age.
 */
export async function readInoreaderStatus(env: Env): Promise<{
  status: InoreaderStatus;
  observedAt: string | null;
  note: string | null;
}> {
  const redis = tryRedis(env);
  if (!redis) return { status: 'unknown', observedAt: null, note: null };

  try {
    // Upstash auto-parses JSON values stored via redis.set(JSON.stringify(...)).
    // Handle both shapes (parsed object OR raw string).
    const raw = await redis.get<StatusEntry | string | null>(STATUS_KEY);
    if (raw == null) return { status: 'unknown', observedAt: null, note: null };
    const entry: StatusEntry = typeof raw === 'string' ? (JSON.parse(raw) as StatusEntry) : raw;
    return {
      status: entry.status,
      observedAt: entry.observedAt,
      note: entry.note ?? null,
    };
  } catch {
    return { status: 'unknown', observedAt: null, note: null };
  }
}
