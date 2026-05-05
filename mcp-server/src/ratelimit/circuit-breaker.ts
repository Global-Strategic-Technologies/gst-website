/**
 * Inoreader circuit breaker (BL-032 Phase 3 scaffolding).
 *
 * **Why this exists**: GST's Inoreader account has a 200 req/day budget
 * shared across the website's ISR (~28/day), the upcoming Cron-driven
 * snapshot refresh (BL-032.5, ~24/day), and the MCP Worker's per-key
 * rate-limited radar tools. If Inoreader returns 429 (rate-limit on
 * THEIR side), the only safe response is to stop calling them — for ALL
 * keys — until the daily budget resets.
 *
 * **The mechanism**:
 *   - Phase 4 radar tools (Inoreader-touching) catch 429 from upstream
 *     and call `openCircuit(env)` — sets `mcp:radar:circuit-open` in
 *     Upstash with a 6-hour TTL
 *   - The Worker checks `isCircuitOpen(env)` BEFORE invoking any radar
 *     tool. If open, returns 503 with `Retry-After` set to the TTL
 *     remainder
 *   - The flag self-heals via TTL expiry; no manual close in BL-032
 *     (Phase 5 health endpoint will surface the state)
 *
 * **Phase 3 ships the read-side check + 503 envelope**. The trigger
 * (`openCircuit`) wires up in Phase 4 when radar tools come online.
 *
 * **Graceful skip**: when Upstash credentials aren't bound on `env`, all
 * functions return null / no-op. The Worker treats this the same as the
 * limiter's null path — fail open with a safeLog warning.
 */

import { Redis } from '@upstash/redis';
import type { Env } from '../worker';

/** The Upstash key holding the circuit state. */
const CIRCUIT_KEY = 'mcp:radar:circuit-open';

/** TTL (seconds) for which the circuit stays open after an Inoreader 429. */
const CIRCUIT_TTL_SECONDS = 6 * 60 * 60; // 6h, matches the website's ISR cache window

/** Result of the read-side check. */
export interface CircuitState {
  readonly open: boolean;
  /** When `open: true`, seconds until the breaker auto-closes. */
  readonly retryAfterSeconds?: number;
  /** Human-readable reason set when the breaker was opened. */
  readonly reason?: string;
}

/**
 * Build a Redis client from the Worker env, or return null if creds
 * aren't bound. Internal helper — both circuit-breaker functions go
 * through this.
 */
function tryRedis(env: Env): Redis | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Check whether the radar circuit is open. Returns null when Upstash is
 * unreachable (graceful skip — caller treats as fail-open). Otherwise
 * returns `{ open: false }` or `{ open: true, retryAfterSeconds, reason }`.
 */
export async function isCircuitOpen(env: Env): Promise<CircuitState | null> {
  const redis = tryRedis(env);
  if (!redis) return null;

  try {
    const [reason, ttl] = await Promise.all([
      redis.get<string>(CIRCUIT_KEY),
      redis.ttl(CIRCUIT_KEY),
    ]);

    // Upstash @upstash/redis: ttl returns -2 if key doesn't exist, -1 if no
    // TTL set. Either way, circuit is closed. Otherwise return remaining TTL.
    if (!reason || ttl < 0) return { open: false };

    return {
      open: true,
      retryAfterSeconds: ttl,
      reason,
    };
  } catch {
    // Don't surface Upstash errors as 5xx — fail open. Caller logs.
    return null;
  }
}

/**
 * Open the radar circuit — called from Phase 4 radar-tool handlers when
 * upstream Inoreader returns 429 (or 5xx that's plausibly rate-limit-
 * related). No-op if Upstash isn't reachable.
 *
 * Idempotent — re-calling refreshes the TTL window.
 */
export async function openCircuit(env: Env, reason: string): Promise<void> {
  const redis = tryRedis(env);
  if (!redis) return;

  try {
    await redis.set(CIRCUIT_KEY, reason, { ex: CIRCUIT_TTL_SECONDS });
  } catch {
    // Best-effort. If we can't write the flag, the next radar call will
    // hit Inoreader anyway — same behavior as no breaker. The user-side
    // 503 is what protects the budget; this just delays the protection.
  }
}

/**
 * Build a 503 Response from a CircuitState. Mirrors RFC 7231 Retry-After
 * semantics so clients can self-throttle. JSON body lets agents reason
 * about the retry hint structurally.
 */
export function circuitOpenResponse(state: CircuitState): Response {
  if (!state.open) {
    throw new Error('circuitOpenResponse called with open=false; programmer error');
  }
  const retryAfter = String(state.retryAfterSeconds ?? CIRCUIT_TTL_SECONDS);
  return new Response(
    JSON.stringify({
      error: 'service_unavailable',
      message:
        'Radar tools temporarily unavailable — Inoreader budget circuit is open. ' +
        `Retry after ${retryAfter} seconds.`,
      retryAfterSeconds: Number(retryAfter),
      reason: state.reason ?? 'inoreader-rate-limit',
    }),
    {
      status: 503,
      headers: {
        'Retry-After': retryAfter,
        'Content-Type': 'application/json',
      },
    }
  );
}
