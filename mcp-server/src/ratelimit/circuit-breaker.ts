/**
 * Inoreader circuit breaker.
 *
 * **Why this exists**: GST's Inoreader account budget is shared across the
 * website's ISR, the 6-hourly Cron snapshot refresh, and the MCP Worker's
 * per-key rate-limited radar tools. (The authoritative ceiling is
 * `ZONE1_DAILY_HARD_CAP` in `lib/inoreader-egress.ts`, not the 200/day figure
 * this docstring used to quote.) If Inoreader returns 429 — rate-limit on
 * THEIR side — the only safe response is to stop calling them, for ALL
 * callers, until the budget resets.
 *
 * **The mechanism**:
 *   - Every Inoreader call site routes failures through
 *     `handleInoreaderFailure`, which calls `openCircuit(env)` on a 429 —
 *     setting `mcp:radar:circuit-open` in Upstash with a 6-hour TTL.
 *   - While open, every radar READ surface (tools, `gst://radar/*` Resources,
 *     `/radar/snapshot`) switches to the **cache-only** readers in
 *     `content/radar-live-store.ts` and serves the stored snapshot flagged
 *     `degraded` — never touching Inoreader. Only when there is nothing
 *     cached does a 503-shaped error surface. The cron skips entirely.
 *   - The flag self-heals via TTL expiry. There is no automatic half-open
 *     probe: a naive one can *extend* an outage (it can succeed on the last
 *     unit of headroom, and the follow-on refill's 429 resets the full 6h
 *     TTL). Manual reset is documented in `operations/RATE_LIMITS.md`.
 *   - `/health` and `/status` surface `circuitOpen` so an operator can tell
 *     "breaker open, serving cache" from "Inoreader merely flaky".
 *
 * **Graceful skip**: when Upstash credentials aren't bound on `env`, all
 * functions return null / no-op. The Worker treats this the same as the
 * limiter's null path — fail open with a safeLog warning.
 */

import { createMcpClient } from '../lib/upstash-clients';
import type { Env } from '../worker';

/** The Upstash key holding the circuit state (lives in the MCP DB). */
const CIRCUIT_KEY = 'mcp:radar:circuit-open';

/** TTL (seconds) for which the circuit stays open after an Inoreader 429. */
const CIRCUIT_TTL_SECONDS = 6 * 60 * 60; // 6h, matches the radar snapshot cache TTL

/** Result of the read-side check. */
export interface CircuitState {
  readonly open: boolean;
  /** When `open: true`, seconds until the breaker auto-closes. */
  readonly retryAfterSeconds?: number;
  /** Human-readable reason set when the breaker was opened. */
  readonly reason?: string;
}

/**
 * Check whether the radar circuit is open. Returns null when the MCP DB is
 * unreachable (graceful skip — caller treats as fail-open). Otherwise
 * returns `{ open: false }` or `{ open: true, retryAfterSeconds, reason }`.
 */
export async function isCircuitOpen(env: Env): Promise<CircuitState | null> {
  const redis = createMcpClient(env);
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
  const redis = createMcpClient(env);
  if (!redis) return;

  try {
    await redis.set(CIRCUIT_KEY, reason, { ex: CIRCUIT_TTL_SECONDS });
  } catch {
    // Best-effort. If we can't write the flag, the next radar call will
    // hit Inoreader anyway — same behavior as no breaker. Suppressing
    // upstream calls is what protects the budget; this just delays the
    // protection by one call.
  }
}
