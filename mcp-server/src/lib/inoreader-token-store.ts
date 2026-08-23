/**
 * Inoreader OAuth token state — sole Upstash I/O surface for tokens.
 *
 * **Post-BL-032.8 Phase B (2026-05-17)**: the Worker is the sole writer
 * AND the sole reader of Inoreader OAuth token state. All token state
 * lives in the **MCP DB** under the `mcp:inoreader:*` namespace. The
 * legacy `inoreader:*` namespace in the website's old Upstash DB has no
 * remaining writer (the website's `inoreader/client.ts` was deleted in
 * Phase A) and no remaining reader (this module's Phase A dual-read
 * fallback was removed in Phase B). The legacy database itself is
 * decommissioned alongside this commit — see PR #140 operator tasks.
 *
 * **Q4 single-writer invariant**: the Worker is the sole writer of
 * `mcp:inoreader:*`. `inoreader-oauth.ts` is the only caller of
 * `writeAccessToken` / `writeRefreshToken` and serializes concurrent
 * refresh attempts via the single-flight lock — so concurrent writes
 * within an isolate are impossible, and cross-isolate writes are
 * mutually excluded by the lock.
 *
 * Keep this docstring current — future humans tracing "who can write what"
 * during incident triage will read it.
 */

import { createMcpClient } from './upstash-clients';
import type { Env } from '../env';

/**
 * MCP DB key holding the Worker-written access token.
 * TTL = `expires_in − 60s` so reads after expiry return null and trigger a
 * fresh refresh rather than a stale token surfacing as a 401.
 */
export const KV_MCP_ACCESS_TOKEN_KEY = 'mcp:inoreader:access_token';

/**
 * MCP DB key holding the Worker-written refresh token.
 * No TTL — long-lived. Rotated only when Inoreader returns a new
 * `refresh_token` in the `/oauth2/token` response (conditional rotation,
 * confirmed via Phase 0 Q0.2).
 */
export const KV_MCP_REFRESH_TOKEN_KEY = 'mcp:inoreader:refresh_token';

/**
 * Buffer subtracted from Inoreader's `expires_in` to derive the Upstash TTL
 * for the access token. Forces a proactive refresh ~1min before Inoreader's
 * clock would reject the token, avoiding the worst-case "first request after
 * expiry pays the 401-refresh-retry latency" edge case.
 */
const ACCESS_TOKEN_TTL_BUFFER_SECONDS = 60;

/**
 * Read the current Inoreader access token. Reads in priority order:
 *
 *   1. MCP DB `mcp:inoreader:access_token` (Worker-written, expected primary)
 *   2. `INOREADER_ACCESS_TOKEN` env var (initial-seed fallback)
 *
 * Returns `null` only when both sources are empty. Callers should treat
 * `null` as `token-missing` (not retryable — needs operator intervention).
 *
 * The function never throws; any Upstash error is silently swallowed and the
 * env-var fallback is consulted. This matches the substrate's
 * fail-toward-degraded posture: a transient Upstash blip shouldn't crash
 * the Worker when the env-var fallback can still serve a usable token
 * during operator-driven bootstrap.
 */
export async function readAccessToken(env: Env): Promise<string | null> {
  const mcpRedis = createMcpClient(env);
  if (mcpRedis) {
    try {
      const mcpToken = await mcpRedis.get<string>(KV_MCP_ACCESS_TOKEN_KEY);
      if (mcpToken) return mcpToken;
    } catch {
      // MCP DB unreachable; fall through to env fallback.
    }
  }

  // Env-var seed (initial deployment / MCP DB unreachable).
  return env.INOREADER_ACCESS_TOKEN ?? null;
}

/**
 * Read the current Inoreader refresh token. Reads in priority order:
 *
 *   1. MCP DB `mcp:inoreader:refresh_token` (Worker-written, expected primary)
 *   2. `INOREADER_REFRESH_TOKEN` env var (initial-seed fallback)
 *
 * Same fail-toward-degraded semantics as `readAccessToken`. Returns `null`
 * only when both sources are empty — at which point the next OAuth refresh
 * attempt will fail with `token-missing` and require operator intervention
 * (manually re-link the Inoreader account by seeding `INOREADER_REFRESH_TOKEN`
 * via `wrangler secret put` and re-deploying).
 */
export async function readRefreshToken(env: Env): Promise<string | null> {
  const mcpRedis = createMcpClient(env);
  if (mcpRedis) {
    try {
      const mcpToken = await mcpRedis.get<string>(KV_MCP_REFRESH_TOKEN_KEY);
      if (mcpToken) return mcpToken;
    } catch {
      // MCP DB unreachable; fall through.
    }
  }

  return env.INOREADER_REFRESH_TOKEN ?? null;
}

/**
 * Persist a freshly-refreshed access token to the MCP DB.
 *
 * TTL is `expiresIn − 60s` (or `3600 − 60` if Inoreader omits `expires_in` —
 * defensive belt-and-suspenders per Phase 0 Q0.1). The 60s buffer ensures
 * the access token disappears from Upstash before Inoreader's clock rejects
 * it, which lets `readAccessToken` correctly return `null` near expiry and
 * trigger a proactive refresh rather than a 401-then-retry latency hit.
 *
 * Returns `true` on success, `false` on Upstash error. Callers should treat
 * `false` as `upstash-write-failed` — token is lost from this isolate and
 * the next request will trigger another refresh, which is wasteful but
 * correct.
 */
export async function writeAccessToken(
  env: Env,
  token: string,
  expiresIn: number | undefined
): Promise<boolean> {
  const mcpRedis = createMcpClient(env);
  if (!mcpRedis) return false;
  const ttl = Math.max(60, (expiresIn ?? 3600) - ACCESS_TOKEN_TTL_BUFFER_SECONDS);
  try {
    await mcpRedis.set(KV_MCP_ACCESS_TOKEN_KEY, token, { ex: ttl });
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist a refresh token to the MCP DB. No TTL — refresh tokens are
 * long-lived (Inoreader doesn't document an expiration; rotation is the
 * substitute). Returns `true` on success, `false` on Upstash error.
 *
 * Phase 0 Q0.2 established that Inoreader rotates conditionally — the
 * response always includes a `refresh_token` field, but the value may be
 * unchanged. Callers (`inoreader-oauth.ts`) should compare the response
 * value against the stored value via `readRefreshToken` and only call
 * `writeRefreshToken` when they differ, to avoid redundant Upstash writes.
 */
export async function writeRefreshToken(env: Env, token: string): Promise<boolean> {
  const mcpRedis = createMcpClient(env);
  if (!mcpRedis) return false;
  try {
    await mcpRedis.set(KV_MCP_REFRESH_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}
