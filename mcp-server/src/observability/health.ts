/**
 * Health endpoint (BL-032 Phase 5; resolves Q8; updated for Path 2).
 *
 * Response shape:
 *
 *   {
 *     ok:                 boolean,
 *     version:            string,            // mcp-server package version
 *     gitSha:             string,            // deploy-time injected; 'unknown' locally
 *     phase:              string,
 *     upstashMcp:         'ok' | 'degraded', // can we reach the MCP DB?
 *     upstashInoreader:   'ok' | 'degraded', // can we reach the Inoreader DB?
 *     inoreader:          'ok' | 'degraded' | 'unknown',  // last observed Inoreader API response
 *     inoreaderObservedAt:string | null,
 *   }
 *
 * **Two Upstash subsystems** (Q13 / Path 2): the Worker accesses two
 * separate databases — the website-shared Inoreader DB (Read-Only token,
 * `inoreader:*` keys) and the dedicated MCP DB (Standard token, `mcp:*`
 * keys). They have independent failure modes, so /health probes each
 * independently and the operator can disambiguate "MCP DB misconfigured"
 * from "website's Upstash project is degraded" without log triage.
 *
 * **Cheap by design** — no live Inoreader API call (would burn budget; Q8).
 * The `inoreader` field is the cached read from `mcp:inoreader:last-status`
 * (lives in the MCP DB) which the radar-live tools update as a side-effect
 * of their normal fetches. The two `upstash*` fields are single GET probes
 * — succeed → ok, throw → degraded.
 *
 * `ok: true` returns 200; any degraded subsystem flips to `ok: false` and
 * status 200 stays (degraded != down — uptime monitors should treat this
 * as a partial-degradation signal, not a hard down). A future dashboard
 * surface (BL-032.75) maps `degraded` to a non-pageable alert; only an
 * actual 5xx from /health pages oncall.
 */

import { readInoreaderStatus, type InoreaderStatus } from './inoreader-status';
import { createInoreaderClient, createMcpClient } from '../lib/upstash-clients';
import type { Env } from '../worker';

const VERSION = '0.1.0'; // bumped in lockstep with mcp-server/package.json (see BREAKING_CHANGES.md)

interface HealthResponse {
  ok: boolean;
  version: string;
  gitSha: string;
  phase: string;
  upstashMcp: 'ok' | 'degraded';
  upstashInoreader: 'ok' | 'degraded';
  inoreader: InoreaderStatus;
  inoreaderObservedAt: string | null;
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
 * Probe Inoreader DB reachability via the Read-Only token. Reads
 * `inoreader:access_token` because (a) it always exists when the website
 * is operating normally, (b) reading an existing key exercises both auth
 * and the read path (more failure modes caught than reading a never-set
 * key), (c) it's already accessible to the Read-Only token by design.
 *
 * **PRIVACY**: the access token is sensitive. The probe DISCARDS the
 * returned value — we only care whether the round-trip throws. NEVER log
 * the result of this `redis.get` call; doing so would leak the token to
 * Worker logs.
 */
async function probeInoreader(env: Env): Promise<'ok' | 'degraded'> {
  const redis = createInoreaderClient(env);
  if (!redis) return 'degraded';

  try {
    // Result intentionally unused — see PRIVACY note above.
    await redis.get('inoreader:access_token');
    return 'ok';
  } catch {
    return 'degraded';
  }
}

/**
 * Build the health response payload from the current env state. Pure
 * data — no Response wrapping; that's the worker.ts layer's job (it
 * also adds CORS headers).
 *
 * Three concurrent probes (MCP, Inoreader, cached Inoreader-status); total
 * latency bounded by the slowest. No latency regression vs the prior
 * single-DB shape.
 */
export async function buildHealthPayload(env: Env): Promise<HealthResponse> {
  const [upstashMcp, upstashInoreader, inoreader] = await Promise.all([
    probeMcp(env),
    probeInoreader(env),
    readInoreaderStatus(env),
  ]);

  // ok: true iff both Upstash DBs are reachable AND the last observed
  // Inoreader API call was not degraded. `inoreader: 'unknown'` is
  // intentionally NOT a degraded signal — it just means we haven't seen
  // recent traffic. Worker cold-starts begin in this state.
  const ok = upstashMcp === 'ok' && upstashInoreader === 'ok' && inoreader.status !== 'degraded';

  return {
    ok,
    version: VERSION,
    gitSha: (env.GIT_SHA as string | undefined) ?? 'unknown',
    phase: 'BL-032 Phase 5 (observability)',
    upstashMcp,
    upstashInoreader,
    inoreader: inoreader.status,
    inoreaderObservedAt: inoreader.observedAt,
  };
}
