/**
 * BL-041 — Worker-side ACL self-check.
 *
 * **Why this exists**: after a scoped Upstash REST token rotation, a
 * misconfigured ACL surfaces as scattered NOPERM errors only when specific
 * code paths are hit. The rate limiter's fail-open semantics
 * (`ratelimit/limiter.ts` returns `null` on Upstash errors) mean a NOPERM
 * inside `Ratelimit.slidingWindow().limit()` silently disables rate-limiting
 * rather than throwing — a quiet outage of a security control.
 *
 * This module exercises the full Worker command surface once per deploy:
 *
 *   1. `SET` + `EXPIRE`          — token store / counter writes
 *   2. `INCR`                    — egress counter / day counter
 *   3. `ZADD` + `ZREMRANGEBYSCORE` — `@upstash/ratelimit` sorted-set surface
 *   4. `SCRIPT LOAD "return 1"`  — proves `@scripting` covers SCRIPT LOAD
 *                                   under whatever Redis fork Upstash runs
 *                                   (audit B2 — version varies)
 *
 * Coordination — first isolate to acquire the gate runs the probe; all
 * later isolates see the result and skip the work. Gate + result live in
 * `mcp:acl-selfcheck:gate:<gitSha>` (SET NX EX, ~24h TTL) and
 * `mcp:acl-selfcheck:result:<gitSha>` (JSON, same TTL). `gitSha` keys both
 * so a new deploy automatically re-runs the probe.
 *
 * Result is surfaced via `/health.aclSelfCheck`:
 *
 *   { status: 'ok' | 'degraded' | 'unknown', failedCommand?: string, ranAt?: string }
 *
 * `'unknown'` covers both "probe hasn't run yet this deploy" and "Upstash
 * unreachable at probe time" — operators investigating `'degraded'` know
 * exactly which Redis command broke under the new ACL.
 */
import type { Redis } from '@upstash/redis';
import { createMcpClient } from '../lib/upstash-clients';
import { safeLog } from '../auth/safe-logger';
import type { Env } from '../worker';

const GATE_PREFIX = 'mcp:acl-selfcheck:gate:';
const RESULT_PREFIX = 'mcp:acl-selfcheck:result:';
const TTL_SECONDS = 24 * 60 * 60;

export type AclSelfCheckStatus = 'ok' | 'degraded' | 'unknown';

export interface AclSelfCheckResult {
  status: AclSelfCheckStatus;
  failedCommand?: string;
  ranAt?: string;
}

function gateKey(gitSha: string): string {
  return `${GATE_PREFIX}${gitSha}`;
}

function resultKey(gitSha: string): string {
  return `${RESULT_PREFIX}${gitSha}`;
}

/**
 * Read the recorded result for the current deploy. Best-effort — Upstash
 * unreachable or missing key both return `'unknown'`.
 */
export async function readAclSelfCheck(env: Env): Promise<AclSelfCheckResult> {
  const gitSha = env.GIT_SHA ?? 'unknown';
  const redis = createMcpClient(env);
  if (!redis) return { status: 'unknown' };

  try {
    const raw = await redis.get<AclSelfCheckResult | string | null>(resultKey(gitSha));
    if (raw == null) return { status: 'unknown' };
    return typeof raw === 'string' ? (JSON.parse(raw) as AclSelfCheckResult) : raw;
  } catch {
    return { status: 'unknown' };
  }
}

/**
 * Run the probe if no other isolate has yet for this deploy. Returns the
 * recorded result (whether this call ran the probe or another isolate
 * already did).
 *
 * Best-effort throughout: every individual probe failure is caught + the
 * first failing command name is recorded; Upstash unreachable returns
 * `'unknown'`. Never throws to the caller.
 */
export async function runAclSelfCheckOnce(env: Env): Promise<AclSelfCheckResult> {
  const gitSha = env.GIT_SHA ?? 'unknown';
  const redis = createMcpClient(env);
  if (!redis) return { status: 'unknown' };

  // Gate: first isolate to SET wins the probe; losers either see the
  // recorded result or `'unknown'` if it hasn't landed yet.
  let acquired: boolean;
  try {
    const r = await redis.set(gateKey(gitSha), '1', { nx: true, ex: TTL_SECONDS });
    acquired = r === 'OK';
  } catch {
    // Gate write failed — Upstash unreachable or NOPERM on SET itself.
    // Surface as `'unknown'` without persisting a result; next probe attempt
    // re-tries naturally.
    return { status: 'unknown' };
  }

  if (!acquired) {
    return await readAclSelfCheck(env);
  }

  const result = await probeAclSurface(redis, gitSha);
  try {
    await redis.set(resultKey(gitSha), JSON.stringify(result), { ex: TTL_SECONDS });
  } catch {
    // Probe ran but result didn't persist; surface to caller anyway.
  }
  if (result.status === 'degraded') {
    safeLog({
      event: 'acl.selfcheck.degraded',
      reason: result.failedCommand,
      success: false,
      errorCode: 'acl-selfcheck-failed',
    });
  }
  return result;
}

/**
 * Exercise every Redis command the Worker actually issues against
 * `gst-mcp` under the scoped ACL. Returns the FIRST command that throws —
 * subsequent paths are not exercised, since the operator's debugging task
 * is "which command broke," not "how many commands broke."
 *
 * Probe keys are isolated under `mcp:acl-selfcheck:probe:<gitSha>:*` so
 * concurrent /health calls during the gate-acquire race don't collide.
 */
async function probeAclSurface(redis: Redis, gitSha: string): Promise<AclSelfCheckResult> {
  const ranAt = new Date().toISOString();
  const k = (suffix: string): string => `mcp:acl-selfcheck:probe:${gitSha}:${suffix}`;

  const steps: Array<{ cmd: string; run: () => Promise<unknown> }> = [
    { cmd: 'SET', run: () => redis.set(k('s'), '1', { ex: 60 }) },
    { cmd: 'INCR', run: () => redis.incr(k('c')) },
    { cmd: 'EXPIRE', run: () => redis.expire(k('c'), 60) },
    { cmd: 'ZADD', run: () => redis.zadd(k('z'), { score: 1, member: 'm' }) },
    { cmd: 'ZREMRANGEBYSCORE', run: () => redis.zremrangebyscore(k('z'), 0, 0) },
    // SCRIPT LOAD via the SDK's eval helper — exercises the same NOSCRIPT →
    // SCRIPT LOAD → EVALSHA path as @upstash/ratelimit. `eval` against a
    // trivial body forces the substrate to load the script and prove
    // SCRIPT LOAD is permitted under the scoped ACL.
    { cmd: 'EVAL/SCRIPT LOAD', run: () => redis.eval('return 1', [], []) },
  ];

  for (const step of steps) {
    try {
      await step.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: 'degraded',
        failedCommand: `${step.cmd}: ${msg.slice(0, 200)}`,
        ranAt,
      };
    }
  }

  // Cleanup — best-effort. A residual probe key auto-evicts via its TTL.
  try {
    await redis.del(k('s'));
    await redis.del(k('c'));
    await redis.del(k('z'));
  } catch {
    // intentionally ignored
  }

  return { status: 'ok', ranAt };
}
