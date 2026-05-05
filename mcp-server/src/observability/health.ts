/**
 * Health endpoint (BL-032 Phase 5; resolves Q8).
 *
 * BACKLOG-specified response shape:
 *
 *   {
 *     ok:        boolean,
 *     version:   string,            // mcp-server package version
 *     gitSha:    string,             // deploy-time injected; 'unknown' locally
 *     redis:     'ok' | 'degraded',  // can we reach Upstash?
 *     inoreader: 'ok' | 'degraded' | 'unknown',  // last observed Inoreader response
 *   }
 *
 * **Cheap by design** — no live Inoreader call (would burn budget; Q8).
 * The `inoreader` field is the cached read from `mcp:inoreader:last-status`
 * which the radar-live tools update as a side-effect of their normal
 * fetches. The `redis` field is a single Upstash GET against a meaningless
 * key — succeeds → ok, throws → degraded.
 *
 * `ok: true` returns 200; any degraded subsystem flips to `ok: false` and
 * status 200 stays (degraded != down — uptime monitors should treat this
 * as a partial-degradation signal, not a hard down). A future dashboard
 * surface (BL-032.75) maps `degraded` to a non-pageable alert; only an
 * actual 5xx from /health pages oncall.
 */

import { Redis } from '@upstash/redis';
import { readInoreaderStatus, type InoreaderStatus } from './inoreader-status';
import type { Env } from '../worker';

const VERSION = '0.1.0'; // bumped in lockstep with mcp-server/package.json (see BREAKING_CHANGES.md)

interface HealthResponse {
  ok: boolean;
  version: string;
  gitSha: string;
  phase: string;
  redis: 'ok' | 'degraded';
  inoreader: InoreaderStatus;
  inoreaderObservedAt: string | null;
}

/**
 * Probe Upstash reachability with a single cheap GET. The key
 * `mcp:health:probe` doesn't need to exist — we just want to confirm
 * the REST endpoint responds. Anything other than a thrown error counts
 * as `'ok'`.
 */
async function probeRedis(env: Env): Promise<'ok' | 'degraded'> {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return 'degraded';

  try {
    const redis = new Redis({ url, token });
    await redis.get('mcp:health:probe');
    return 'ok';
  } catch {
    return 'degraded';
  }
}

/**
 * Build the health response payload from the current env state. Pure
 * data — no Response wrapping; that's the worker.ts layer's job (it
 * also adds CORS headers).
 */
export async function buildHealthPayload(env: Env): Promise<HealthResponse> {
  const [redis, inoreader] = await Promise.all([probeRedis(env), readInoreaderStatus(env)]);

  // ok: true unless any subsystem is hard-degraded. `inoreader: 'unknown'`
  // is intentionally NOT a degraded signal — it just means we haven't seen
  // recent traffic. Worker cold-starts begin in this state.
  const ok = redis === 'ok' && inoreader.status !== 'degraded';

  return {
    ok,
    version: VERSION,
    gitSha: (env.GIT_SHA as string | undefined) ?? 'unknown',
    phase: 'BL-032 Phase 5 (observability)',
    redis,
    inoreader: inoreader.status,
    inoreaderObservedAt: inoreader.observedAt,
  };
}
