/**
 * Health endpoint (BL-032 Phase 5; resolves Q8; simplified BL-032.8 Phase B).
 *
 * Response shape:
 *
 *   {
 *     ok:                          boolean,
 *     circuitOpen:                 boolean,           // Inoreader breaker state (informational)
 *     circuitRead:                 boolean,           // BL-122 — false = state unreadable, circuitOpen is a default
 *     version:                     string,            // mcp-server package version
 *     gitSha:                      string,            // deploy-time injected; 'unknown' locally
 *     phase:                       string,
 *     upstashMcp:                  'ok' | 'degraded', // can we reach the MCP DB?
 *     inoreader:                   'ok' | 'degraded' | 'unknown',  // last observed Inoreader API response
 *     inoreaderObservedAt:         string | null,
 *     inoreaderObservedSecondsAgo: number | null,     // age of the observation; null when none
 *     inoreaderObservedSource:     'cron' | 'live-tool' | 'http-snapshot' | null,
 *     radarSnapshotAgeSeconds:     number | null,
 *     inoreaderSpend: {                                  // BL-032.75 Phase 0
 *       read: boolean,                                 // BL-122 — false = counters unreadable, `total` is a default
 *       total:      number,                              // today's Zone-1 spend
 *       byCategory: Record<InoreaderEgressCategory, number>,
 *     },
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
 *
 * **Carve-out (BL-091)**: `circuitOpen` is the one field deliberately EXCLUDED
 * from the `ok` computation. It is an informational discriminator — `ok` is
 * already false during a breaker window via `inoreader: 'degraded'` — so
 * folding it in would add no signal while coupling an already-firing alert to
 * a second input. Do not wire it into `ok`.
 */

import {
  readInoreaderStatus,
  type InoreaderStatus,
  type InoreaderObservedSource,
} from './inoreader-status';
import { createMcpClient } from '../lib/upstash-clients';
import { isCircuitOpen } from '../ratelimit/circuit-breaker';
import { readInoreaderSpend, type InoreaderEgressCategory } from '../lib/inoreader-egress';
import { readAclSelfCheck, type AclSelfCheckResult } from './acl-selfcheck';
import {
  readRefreshHealth,
  type InoreaderRefreshTokenHealth,
} from '../lib/inoreader-refresh-health';
import type { Env } from '../worker';

// Local-dev fallback ONLY. As of BL-033 Slice 4, the real version is injected
// at deploy time from package.json via `deploy.mjs` (`--var VERSION:<v>`) and
// read as `env.VERSION ?? VERSION` below — mirroring the GIT_SHA pipeline — so
// deployed `/health` no longer drifts. This literal is used only when unbound
// (wrangler dev / tests); keep it roughly current but it is no longer
// load-bearing for prod/staging.
const VERSION = '0.43.0';

/** Upstash key written by `radar-live-store.ts` (and refreshed every 6h by `cron/radar-refresh.ts`). */
const RADAR_FYI_CACHE_KEY = 'mcp:radar:cache:fyi';

interface HealthResponse {
  ok: boolean;
  /**
   * BL-091 — whether the Inoreader budget circuit breaker is currently open.
   * While open, every radar read surface serves the cached snapshot and makes
   * NO upstream calls (see `ratelimit/circuit-breaker.ts`).
   *
   * **Informational only — never folded into `ok`.** `ok` is already false in
   * this state via `inoreader: 'degraded'`; this field exists so an operator
   * (or `/status`) can distinguish "Inoreader flaky" from "breaker open,
   * serving cache". `false` when Upstash gives no signal.
   */
  circuitOpen: boolean;
  /**
   * BL-122 — `false` when the breaker state could not be read (Upstash
   * unbound, or the read threw). `circuitOpen` is then `false` by fail-open
   * policy, which is right for BEHAVIOUR but is not a measurement — a surface
   * reporting it must not render `closed` as though it had been observed.
   */
  circuitRead?: boolean;
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
   * (2 × 6h = 43,200 s = 12h — the signed-off freshness SLO in
   * `observability/slo-baselines.md`). Picked FYI (not Wire) because it's
   * the more user-visible tier and refreshes from the same Cron tick.
   */
  radarSnapshotAgeSeconds: number | null;
  /**
   * Inoreader spend accounting (BL-032.75 Phase 0). `total` is today's
   * cumulative Zone-1 spend across all four Zone-1 categories
   * (`cron-radar`, `live-radar`, `http-radar-snapshot`, `401-retry`).
   * `byCategory` breaks the same picture out per category and additionally
   * surfaces the non-Zone-1 `oauth-refresh` count for visibility into auth
   * churn. Zero-values when no traffic has been recorded today or when MCP
   * DB is unreachable.
   *
   * The Phase 0 implementation runs PARALLEL to the pre-existing
   * `mcp:inoreader:day-counter:*` (cron-only) counter — both are populated
   * for the 7-day soak window. The old day-counter is removed in a
   * follow-up PR once reconciliation is verified.
   */
  inoreaderSpend: {
    total: number;
    byCategory: Record<InoreaderEgressCategory, number>;
    /**
     * BL-122 — `false` when the counters could not be read. `total` is then a
     * safe default of 0, not a measurement, so any surface reporting the
     * number must say so rather than render a fabricated 0%.
     */
    read?: boolean;
  };
  /**
   * BL-041 — Worker-side ACL self-check result for the current deploy.
   * Set after the first request post-deploy via `runAclSelfCheckOnce`;
   * `'unknown'` until the probe lands or when Upstash is unreachable.
   * `'degraded'` carries the first command that returned NOPERM so an
   * operator can pinpoint the missing ACL category at a glance.
   *
   * **Read-only here**: this endpoint never RUNS the probe; the worker.ts
   * fetch handler triggers it once per deploy in the background. /health
   * reads the recorded result so a uptime monitor or operator curl sees
   * the same value regardless of which isolate served the request.
   */
  aclSelfCheck: AclSelfCheckResult;
  /**
   * BL-047 T3+T4 — Inoreader OAuth refresh-token health surface.
   * Operator-visible leading indicators on the refresh path so token
   * degradation can be seen BEFORE the next refresh attempts and fails:
   *
   *   - `lastSuccessfulRefreshAt` / `ageSinceLastSuccessfulRefreshSeconds`
   *     answer "are we still refreshing?" — `null` after a fresh deploy
   *     with no refresh observed; the age field becomes the primary
   *     "are we dying?" signal once non-null
   *   - `lastRotationAt` + `rotationsLast24h` answer the rotation-regime
   *     open question pinned in
   *     `mcp-server/src/docs/operations/INOREADER_OAUTH_CONTRACT.md` § 6.
   *     30 days of this data tells us empirically whether Inoreader is
   *     in a dense or sparse rotation mode
   *   - `refreshSuccessLast24h` + `recentRefreshFailureCounts` give a
   *     direct failure-rate read. Per-reason breakdown is non-negotiable
   *     because the four failure modes have different recovery
   *     procedures (see SENTRY_ALERT_RULES.md § 1)
   *
   * Read-only on `/health` — the underlying counters + pointers are
   * written by `inoreader-refresh-health.ts` recorders at the OAuth
   * refresh call sites in `inoreader-oauth.ts`. Fail-open: returns zero
   * counters + null pointers when Upstash is unreachable.
   */
  inoreaderRefreshTokenHealth: InoreaderRefreshTokenHealth;
}

const HEALTH_PROBE_KEY_PREFIX = 'mcp:health:probe:';
const HEALTH_PROBE_TTL_SECONDS = 60; // TTL failsafe in case DEL is missed

/**
 * Probe MCP DB reachability + WRITE permission via SET-then-DEL. The
 * earlier probe was a single GET, which a read-only Upstash REST token
 * would pass cleanly — leading to `upstashMcp: 'ok'` while the next
 * /mcp POST threw inside the rate-limiter on missing write perms
 * (BL-032 T.X.2 incident, 2026-05-12 — ~30 min of false-healthy state
 * during T.C.7 recovery). The SET catches that gap.
 *
 * **Per-call unique key** — every probe writes a fresh
 * `mcp:health:probe:<uuid>` key so two concurrent probes (operator curl
 * + uptime monitor) never race on the same key. The 60s TTL is a
 * failsafe if the DEL silently fails to land (the key auto-evicts).
 *
 * **Semantic**: WRITE permission is proven the moment SET resolves.
 * A subsequent DEL-throw means cleanup is delayed (TTL handles it), but
 * the substrate is healthy — we return `'ok'` regardless. Only a SET
 * failure (catches permission denial, unreachable Upstash, malformed
 * token) flips to `'degraded'`.
 *
 * Cost: 2 extra Upstash round-trips per /health call. /health is hit
 * lightly (operators + uptime monitors), so cost is negligible.
 */
async function probeMcp(env: Env): Promise<'ok' | 'degraded'> {
  const redis = createMcpClient(env);
  if (!redis) return 'degraded';

  const key = `${HEALTH_PROBE_KEY_PREFIX}${crypto.randomUUID()}`;
  try {
    await redis.set(key, '1', { ex: HEALTH_PROBE_TTL_SECONDS });
  } catch {
    return 'degraded';
  }
  // SET succeeded — write permission proven. DEL is best-effort cleanup;
  // a failure here doesn't change health status (TTL evicts the key).
  try {
    await redis.del(key);
  } catch {
    // intentionally ignored — see semantic note above
  }
  return 'ok';
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
export async function probeRadarSnapshotAge(env: Env): Promise<number | null> {
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
  const [
    upstashMcp,
    inoreader,
    radarSnapshotAgeSeconds,
    inoreaderSpend,
    aclSelfCheck,
    inoreaderRefreshTokenHealth,
    circuitState,
  ] = await Promise.all([
    probeMcp(env),
    readInoreaderStatus(env),
    probeRadarSnapshotAge(env),
    readInoreaderSpend(env),
    readAclSelfCheck(env),
    readRefreshHealth(env),
    isCircuitOpen(env),
  ]);

  // ok: true iff MCP DB is reachable AND the last observed Inoreader API
  // call was not degraded. `inoreader: 'unknown'` is intentionally NOT a
  // degraded signal — it just means we haven't seen recent traffic.
  // Worker cold-starts begin in this state.
  // `radarSnapshotAgeSeconds` is informational on /health — staleness
  // alerts live in BL-032.75 (Sentry alert rule on the cron events).
  //
  // BL-091: `circuitOpen` is deliberately NOT a factor here. It is an
  // informational discriminator, not a new breach source — during a breaker
  // window `ok` is ALREADY false (the store records `inoreader: 'degraded'`
  // on the 429 that opened it, and that key persists). What operators lacked
  // was the ability to tell "Inoreader merely flaky" from "breaker open,
  // serving cached data"; `circuitOpen` supplies exactly that. Wiring it into
  // `ok` would add nothing and would couple an already-firing alert
  // (`alert-rules.ts`) to a second signal.
  const ok = upstashMcp === 'ok' && inoreader.status !== 'degraded';

  return {
    ok,
    // `null` from `isCircuitOpen` means Upstash gave no signal — report
    // `false` (fail open), consistent with every other breaker consumer.
    // BL-122: `circuitRead` preserves the distinction the collapse destroys,
    // so /status can say `unknown` instead of asserting an observed `closed`.
    circuitOpen: circuitState?.open === true,
    circuitRead: circuitState !== null,
    version: env.VERSION ?? VERSION,
    gitSha: env.GIT_SHA ?? 'unknown',
    phase: 'BL-032 Phase 5 (observability)',
    upstashMcp,
    inoreader: inoreader.status,
    inoreaderObservedAt: inoreader.observedAt,
    inoreaderObservedSecondsAgo: inoreader.observedSecondsAgo,
    inoreaderObservedSource: inoreader.source,
    radarSnapshotAgeSeconds,
    inoreaderSpend,
    aclSelfCheck,
    inoreaderRefreshTokenHealth,
  };
}
