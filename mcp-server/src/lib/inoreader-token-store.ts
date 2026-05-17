/**
 * Inoreader OAuth token state — sole Upstash I/O surface for tokens.
 *
 * **Phase 1 scope (current)**: read-only Worker-side reader. Today the Worker
 * reads `inoreader:access_token` from the **Inoreader DB** (Q13 Path 2) and
 * falls through to the `INOREADER_ACCESS_TOKEN` env var when Upstash is
 * unreachable or the key is empty. The website (`src/lib/inoreader/client.ts`)
 * remains sole refresh-writer in Phase 1 — this module just consolidates the
 * read path so Phase 2 can add write methods alongside.
 *
 * **Phase 2 scope (planned)**: add `writeAccessToken(env, token, expiresIn)`
 * and `writeRefreshToken(env, token)` against the **MCP DB** namespace
 * (`mcp:inoreader:*` keys). At that point the Q4 single-writer invariant
 * (today: "website is sole refresh-writer") relocates to "Worker is sole
 * refresh-writer." See [MCP_SERVER_RADAR_UNIFICATION_BL-032_8.md] §
 * Phase 2 for the migration plan.
 *
 * **Q4 single-writer invariant** (informal, version-locked):
 *
 * - **Today (Phase 1)**: The website is the sole writer of
 *   `inoreader:access_token` and `inoreader:refresh_token` in the Inoreader DB.
 *   The Worker is read-only on these keys (enforced at the Upstash ACL layer
 *   via a read-only token — see [`upstash-clients.ts`](./upstash-clients.ts)).
 *   The Worker triggers refresh via the BL-039 endpoint, never writes the
 *   refresh result itself.
 *
 * - **After Phase 2**: The Worker becomes sole writer of `mcp:inoreader:*`
 *   token keys in the MCP DB. The website's Inoreader DB keys can be
 *   retired after Phase 6 once nothing reads from them.
 *
 * Keep this docstring current — future humans tracing "who can write what"
 * during incident triage will read it.
 */

import { createInoreaderClient } from './upstash-clients';
import type { Env } from '../worker';

/**
 * Inoreader DB key holding the current access token. Read by every Worker
 * call to Inoreader; written today by the website (Phase 1). `inoreader:*`
 * namespace is the shared website / Worker contract — do NOT change this
 * name without coordinating both consumers.
 */
export const KV_ACCESS_TOKEN_KEY = 'inoreader:access_token';

/**
 * Read the current Inoreader access token. Tries the Inoreader DB first
 * (read-only Upstash client), falls through to the `INOREADER_ACCESS_TOKEN`
 * env var when:
 *
 *   - Upstash creds are not bound on the Worker env
 *   - Upstash is unreachable (network blip, regional outage)
 *   - The key returns `null` (initial-state edge case before the website
 *     has written its first refresh)
 *
 * Returns `null` only when both the Upstash key and the env fallback are
 * empty. Callers should treat `null` as `token-missing` (not retryable —
 * needs operator intervention).
 *
 * The function never throws; any Upstash error is silently swallowed and
 * the env fallback is consulted. This matches the substrate's
 * fail-toward-degraded posture: a transient Upstash blip shouldn't crash
 * the Worker when the env var still holds a usable seed token.
 */
export async function readAccessToken(env: Env): Promise<string | null> {
  let accessToken: string | null = null;
  const inoreaderRedis = createInoreaderClient(env);
  if (inoreaderRedis) {
    try {
      accessToken = await inoreaderRedis.get<string>(KV_ACCESS_TOKEN_KEY);
    } catch {
      // Upstash unreachable; fall through to env fallback below.
    }
  }
  return accessToken ?? env.INOREADER_ACCESS_TOKEN ?? null;
}
