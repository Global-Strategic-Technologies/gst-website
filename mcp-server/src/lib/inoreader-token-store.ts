/**
 * Inoreader OAuth token state — sole Upstash I/O surface for tokens.
 *
 * **Phase A scope (BL-032.8 Phase 2)**: Worker is now an active refresh-writer
 * via the new `inoreader-oauth.ts` module. Tokens written by the Worker land
 * in the **MCP DB** under the `mcp:inoreader:*` namespace; tokens written by
 * the website (Phase A retention) continue landing in the **Inoreader DB**
 * under the `inoreader:*` namespace. Reads check MCP DB first and fall back
 * to the Inoreader DB so the dual-write window doesn't lose data on either
 * side.
 *
 * **Phase B scope (planned — see MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md)**:
 * the website's refresh-writer retires; the `inoreader:*` namespace becomes
 * read-only-with-eventual-deletion; the fallback read is dropped from
 * `readAccessToken`. At that point the Worker is the sole token-store writer.
 *
 * **Q4 single-writer invariant** (informal, version-locked):
 *
 * - **Today (Phase A)**: The Worker is the **primary** refresh-writer to
 *   `mcp:inoreader:*` in the MCP DB. The website remains a refresh-writer
 *   to `inoreader:*` in the Inoreader DB during the Phase A dual-write
 *   window; this is structural fallback insurance while we soak the new
 *   path. Reads prefer the MCP DB value when present (Worker-owned, most
 *   recent), fall back to the Inoreader DB value otherwise.
 *
 * - **After Phase B**: The Worker is sole writer of `mcp:inoreader:*` token
 *   keys. The website's Inoreader DB keys are retired.
 *
 * Keep this docstring current — future humans tracing "who can write what"
 * during incident triage will read it.
 */

import { createInoreaderClient, createMcpClient } from './upstash-clients';
import type { Env } from '../worker';

/**
 * Inoreader DB key holding the current access token (website-written).
 * Read fallback only — Phase A retention so the website-side ISR's refresh
 * still propagates to the Worker if the Worker's own MCP-DB key is empty.
 *
 * `inoreader:*` namespace is the shared website / Worker contract — do NOT
 * change this name; coordinate with website team if it ever changes.
 */
export const KV_ACCESS_TOKEN_KEY = 'inoreader:access_token';

/**
 * Inoreader DB key holding the current refresh token (website-written).
 * Read fallback only — Phase A retention so the Worker's `inoreader-oauth.ts`
 * can bootstrap from the website's pre-Phase-B state on first invocation.
 */
export const KV_REFRESH_TOKEN_KEY = 'inoreader:refresh_token';

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
 *   2. Inoreader DB `inoreader:access_token` (website-written, Phase A fallback)
 *   3. `INOREADER_ACCESS_TOKEN` env var (initial-seed fallback)
 *
 * Returns `null` only when all three sources are empty. Callers should treat
 * `null` as `token-missing` (not retryable — needs operator intervention).
 *
 * The function never throws; any Upstash error is silently swallowed and the
 * next-priority source is consulted. This matches the substrate's
 * fail-toward-degraded posture: a transient Upstash blip in one DB shouldn't
 * crash the Worker when another source can still serve a usable token.
 */
export async function readAccessToken(env: Env): Promise<string | null> {
  // Priority 1: MCP DB (Worker-owned source of truth post-Phase-A).
  const mcpRedis = createMcpClient(env);
  if (mcpRedis) {
    try {
      const mcpToken = await mcpRedis.get<string>(KV_MCP_ACCESS_TOKEN_KEY);
      if (mcpToken) return mcpToken;
    } catch {
      // MCP DB unreachable; fall through to Inoreader DB.
    }
  }

  // Priority 2: Inoreader DB (website-owned, Phase A retention).
  const inoreaderRedis = createInoreaderClient(env);
  if (inoreaderRedis) {
    try {
      const websiteToken = await inoreaderRedis.get<string>(KV_ACCESS_TOKEN_KEY);
      if (websiteToken) return websiteToken;
    } catch {
      // Inoreader DB unreachable; fall through to env fallback.
    }
  }

  // Priority 3: env-var seed (initial deployment / both DBs unreachable).
  return env.INOREADER_ACCESS_TOKEN ?? null;
}

/**
 * Read the current Inoreader refresh token. Reads in priority order:
 *
 *   1. MCP DB `mcp:inoreader:refresh_token` (Worker-written, expected primary)
 *   2. Inoreader DB `inoreader:refresh_token` (website-written, Phase A fallback)
 *   3. `INOREADER_REFRESH_TOKEN` env var (initial-seed fallback)
 *
 * Same fail-toward-degraded semantics as `readAccessToken`. Returns `null`
 * only when all sources are empty — at which point the next OAuth refresh
 * attempt will fail with `token-missing` and require operator intervention
 * (manually re-link the Inoreader account via the website's OAuth flow).
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

  const inoreaderRedis = createInoreaderClient(env);
  if (inoreaderRedis) {
    try {
      const websiteToken = await inoreaderRedis.get<string>(KV_REFRESH_TOKEN_KEY);
      if (websiteToken) return websiteToken;
    } catch {
      // Inoreader DB unreachable; fall through.
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
