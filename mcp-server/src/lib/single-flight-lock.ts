/**
 * Generic single-flight coordination primitive backed by Upstash `SET ... NX EX`.
 *
 * BL-032.8 introduces this module to coalesce concurrent OAuth refresh
 * attempts — without it, parallel 401s from `fetchAllStreams`' five-way fan-out
 * each independently spawn a `/oauth2/token` POST (the BL-040 known issue).
 * The lock is intentionally generic; future work that needs cross-isolate
 * exclusion (e.g. a deduplicated cache-refresh primitive) can reuse it without
 * recreating the same SET-NX-EX pattern.
 *
 * **Semantics**:
 *   - `acquire` returns `true` exactly once per (key, value-cycle); concurrent
 *     callers see `false` and route to `pollForChange` or a fallback branch.
 *   - `pollForChange` watches a sentinel key (typically the artifact the
 *     lock-holder will write) and returns the new value when it differs from
 *     the snapshot taken at call time. Times out cleanly rather than hanging.
 *   - `release` is best-effort `DEL`. The TTL on `acquire` is the safety net:
 *     a crashed lock-holder doesn't permanently wedge the system.
 *
 * **Failure mode**: Upstash unreachable. `acquire` returns `true` (fail-open)
 * so the caller can proceed; this matches the substrate's existing
 * fail-open semantics in `circuit-breaker.ts` and `limiter.ts`. The trade-off
 * is intentional — a hard fail-closed would cascade an Upstash blip into total
 * radar outage.
 *
 * **Why not reuse `circuit-breaker.ts`**: the breaker is idempotent SET (no
 * NX). Two concurrent `openCircuit` calls both succeed; that's the right
 * semantics for "trip the breaker on observed 429." The OAuth lock needs
 * mutual exclusion — exactly one caller can succeed — so the wire-level
 * pattern is different even though both modules use the same Upstash MCP
 * client.
 */

import { createMcpClient } from './upstash-clients';
import type { Env } from '../worker';

export interface PollOptions {
  /** Total time to wait for the key to change before returning null. */
  readonly timeoutMs: number;
  /** Delay between successive Upstash reads. */
  readonly intervalMs: number;
}

const DEFAULT_POLL_OPTIONS: PollOptions = {
  timeoutMs: 15_000,
  intervalMs: 200,
};

/**
 * Attempt to acquire a single-flight lock. Returns `true` if this caller
 * holds the lock and should proceed to do the work; `false` if a peer
 * already holds it (route to `pollForChange` to wait for the peer's
 * result). Fail-open when Upstash is unreachable so a temporary outage
 * can't wedge the OAuth refresh path.
 *
 * The optional `value` is written into the lock key (defaulting to a
 * timestamp) so debug operators can see who/when something is holding
 * the lock; it's never used for ownership checks today, but a future
 * `release` with compare-and-delete semantics could read it.
 */
export async function acquire(
  env: Env,
  key: string,
  ttlSeconds: number,
  value?: string
): Promise<boolean> {
  const redis = createMcpClient(env);
  if (!redis) return true;
  try {
    const result = await redis.set(key, value ?? String(Date.now()), {
      nx: true,
      ex: ttlSeconds,
    });
    return result === 'OK';
  } catch {
    return true;
  }
}

/**
 * Poll a key until its value differs from the snapshot taken when this
 * function was called, or until `timeoutMs` elapses. Returns the new
 * value on change, or `null` on timeout / Upstash unreachable.
 *
 * Used by the loser of a `acquire` race: snapshot the lock-protected
 * resource (e.g. `mcp:inoreader:access_token`) when `acquire` returns
 * false, then call `pollForChange` to wait until the winner writes the
 * fresh value. The string-equality check is sufficient because the
 * winner always writes a non-null, non-empty value (OAuth tokens are
 * opaque strings).
 *
 * Generic in `T` so callers can pin the value shape; today this is
 * always `string` (Upstash returns strings for our `set`/`get` usage),
 * but pinning the generic keeps the call site readable.
 */
export async function pollForChange<T>(
  env: Env,
  key: string,
  opts: Partial<PollOptions> = {}
): Promise<T | null> {
  const { timeoutMs, intervalMs } = { ...DEFAULT_POLL_OPTIONS, ...opts };
  const redis = createMcpClient(env);
  if (!redis) return null;

  let snapshot: T | null;
  try {
    snapshot = await redis.get<T>(key);
  } catch {
    return null;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const current = await redis.get<T>(key);
      // String-equality comparison via JSON.stringify covers both primitive
      // strings (the production use case) and any future opaque-object shapes
      // without forcing callers to provide an equality predicate. Acceptable
      // because the values we lock against are short opaque tokens.
      if (JSON.stringify(current) !== JSON.stringify(snapshot)) {
        return current;
      }
    } catch {
      // Transient Upstash error mid-poll — keep trying until deadline; the
      // alternative of bailing immediately would convert a recoverable blip
      // into a `lock-timeout`-equivalent failure on the caller.
    }
  }
  return null;
}

/**
 * Best-effort lock release. Always `DEL`s the key without ownership
 * verification — the lock TTL is the safety net for misbehaving
 * callers, and the per-isolate request lifecycle means the same isolate
 * always both acquires and releases. Compare-and-delete (CAD) semantics
 * could be added if future use cases need them, but today they'd be
 * complexity without payoff.
 */
export async function release(env: Env, key: string): Promise<void> {
  const redis = createMcpClient(env);
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // Swallow — the TTL will clean up. Caller-side errors are not actionable
    // here; the substrate stays consistent.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
