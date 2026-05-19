/**
 * Health endpoint (BL-032 Phase 5; resolves Q8; simplified BL-032.8 Phase B).
 *
 * Response shape:
 *
 *   {
 *     ok:                          boolean,
 *     version:                     string,            // mcp-server package version
 *     gitSha:                      string,            // deploy-time injected; 'unknown' locally
 *     phase:                       string,
 *     upstashMcp:                  'ok' | 'degraded', // can we reach the MCP DB?
 *     inoreader:                   'ok' | 'degraded' | 'unknown',  // last observed Inoreader API response
 *     inoreaderObservedAt:         string | null,
 *     inoreaderObservedSecondsAgo: number | null,     // age of the observation; null when none
 *     inoreaderObservedSource:     'cron' | 'live-tool' | null,
 *     radarSnapshotAgeSeconds:     number | null,
 *   }
 *
 * **Single Upstash subsystem (post-BL-032.8 Phase B)**: the Worker is the
 * sole reader and writer of Inoreader-related Upstash state. All state
 * (rate-limit counters, circuit breaker, OAuth tokens, status cache, radar
 * caches) lives in the MCP DB. The website's legacy Inoreader DB was
 * decommissioned in Phase B — `upstashInoreader` was dropped from the
 * response shape in the same commit. Consumers of this endpoint should
 * not expect `upstashInoreader` to come back; it is an intentional removal,
 * not a bug.
 *
 * **Stale-while-OK semantics for `inoreader`** (2026-05-19): the
 * `mcp:inoreader:last-status` key persists indefinitely — the most
 * recent observation is always returned. `inoreaderObservedSecondsAgo`
 * surfaces freshness so readers (this endpoint's consumers, dashboards,
 * operators) compute their own staleness threshold. Previous version
 * had a 5-minute TTL on the key, which meant `inoreader: 'unknown'`
 * ~98% of the time because the 6h cron cadence was the dominant
 * Inoreader-call source and 5 minutes ≪ 6 hours. See inoreader-status.ts
 * docstring for the full rationale.
 *
 * **Cheap by design** — no live Inoreader API call (would burn budget; Q8).
 * The `inoreader` field is the cached read from `mcp:inoreader:last-status`
 * which the radar-live tools update as a side-effect of their normal
 * fetches. The `upstashMcp` field is a single GET probe — succeed → ok,
 * throw → degraded.
 *
 * `ok: true` returns 200; any degraded subsystem flips to `ok: false` and
 * status 200 stays (degraded != down — uptime monitors should treat this
 * as a partial-degradation signal, not a hard down). A future dashboard
 * surface (BL-032.75) maps `degraded` to a non-pageable alert; only an
 * actual 5xx from /health pages oncall.
 */

import {
  readInoreaderStatus,
  type InoreaderStatus,
  type InoreaderObservedSource,
} from './inoreader-status';
import { createMcpClient } from '../lib/upstash-clients';
import type { Env } from '../worker';

const VERSION = '0.1.0'; // bumped in lockstep with mcp-server/package.json (see BREAKING_CHANGES.md)

/** Upstash key written by `radar-live-store.ts` (and refreshed hourly by `cron/radar-refresh.ts`). */
const RADAR_FYI_CACHE_KEY = 'mcp:radar:cache:fyi';

interface HealthResponse {
  ok: boolean;
  version: string;
  gitSha: string;
  phase: string;
  upstashMcp: 'ok' | 'degraded';
  inoreader: InoreaderStatus;
  inoreaderObservedAt: string | null;
  /**
   * Age of the last Inoreader observation in seconds. `null` when no
   * observation has been recorded (cold start, pre-first-cron). Readers
   * use this to decide whether the `inoreader` status is fresh enough
   * to act on: an `'ok'` from 12h ago means the cron has missed at
   * least one firing, regardless of what the static field says.
   */
  inoreaderObservedSecondsAgo: number | null;
  /**
   * Source of the last observation — `'cron'` for cron-triggered
   * refreshes, `'live-tool'` for MCP tool / `/radar/snapshot` calls.
   * Diagnostically useful: if every recent observation is `'cron'`,
   * no human is actively using the MCP surface. `null` for entries
   * written by pre-2026-05-19 code (the field is back-compat optional).
   */
  inoreaderObservedSource: InoreaderObservedSource | null;
  /**
   * Age of the FYI radar snapshot in seconds (BL-032.5 Phase 4). `null` when
   * the snapshot has never been populated or when MCP DB is unreachable.
   * BL-032.75 alert rules trip when this exceeds 2× the Cron interval
   * (~7200 s = 2 h). Picked FYI (not Wire) because it's the more
   * user-visible tier and refreshes from the same Cron tick.
   */
  radarSnapshotAgeSeconds: number | null;
}

/**
 * Probe MCP DB reachability with a single cheap GET. The key
 * `mcp:health:probe` doesn't need to exist — we just want to confirm
 * the REST endpoint responds. Anything other than a thrown error counts
 * as `'ok'`.
 */
async function probeMcp(env: Env): Promise<'ok' | 'degraded'> {
  const redis = createMcpClient(env);
  if (!redis) return 'degraded';

  try {
    await redis.get('mcp:health:probe');
    return 'ok';
  } catch {
    return 'degraded';
  }
}

/**
 * Compute the age (seconds) of the FYI radar snapshot from its Upstash
 * cache entry. Returns null when:
 *   - MCP DB unreachable
 *   - Snapshot key missing (Cron hasn't run yet)
 *   - Cache value is malformed (no `fetchedAt`)
 *
 * Implementation note: `radar-live-store.ts` writes the entry wrapped in
 * the `upstash-cache-store` Entry envelope (`{ storedAt, data }`). We read
 * the same shape and pull `data.fetchedAt`. Falls back to `storedAt` if
 * `fetchedAt` is missing for any reason. The cost is one cheap GET.
 */
async function probeRadarSnapshotAge(env: Env): Promise<number | null> {
  const redis = createMcpClient(env);
  if (!redis) return null;
  try {
    const raw = await redis.get<
      { storedAt: number; data?: { fetchedAt?: string } } | string | null
    >(RADAR_FYI_CACHE_KEY);
    if (raw == null) return null;
    const entry =
      typeof raw === 'string'
        ? (JSON.parse(raw) as { storedAt: number; data?: { fetchedAt?: string } })
        : raw;
    const fetchedAtMs =
      entry.data?.fetchedAt != null ? new Date(entry.data.fetchedAt).getTime() : entry.storedAt;
    if (!Number.isFinite(fetchedAtMs)) return null;
    return Math.max(0, Math.floor((Date.now() - fetchedAtMs) / 1000));
  } catch {
    return null;
  }
}

/**
 * Build the health response payload from the current env state. Pure
 * data — no Response wrapping; that's the worker.ts layer's job (it
 * also adds CORS headers).
 *
 * Three concurrent probes (MCP, cached Inoreader-status, radar snapshot age);
 * total latency bounded by the slowest. The Phase B simplification (removing
 * the Inoreader DB probe) shaved one Upstash round-trip off this path.
 */
export async function buildHealthPayload(env: Env): Promise<HealthResponse> {
  const [upstashMcp, inoreader, radarSnapshotAgeSeconds] = await Promise.all([
    probeMcp(env),
    readInoreaderStatus(env),
    probeRadarSnapshotAge(env),
  ]);

  // ok: true iff MCP DB is reachable AND the last observed Inoreader API
  // call was not degraded. `inoreader: 'unknown'` is intentionally NOT a
  // degraded signal — it just means we haven't seen recent traffic.
  // Worker cold-starts begin in this state.
  // `radarSnapshotAgeSeconds` is informational on /health — staleness
  // alerts live in BL-032.75 (Sentry alert rule on the cron events).
  const ok = upstashMcp === 'ok' && inoreader.status !== 'degraded';

  return {
    ok,
    version: VERSION,
    gitSha: env.GIT_SHA ?? 'unknown',
    phase: 'BL-032 Phase 5 (observability)',
    upstashMcp,
    inoreader: inoreader.status,
    inoreaderObservedAt: inoreader.observedAt,
    inoreaderObservedSecondsAgo: inoreader.observedSecondsAgo,
    inoreaderObservedSource: inoreader.source,
    radarSnapshotAgeSeconds,
  };
}
