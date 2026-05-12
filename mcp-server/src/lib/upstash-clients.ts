/**
 * Upstash Redis client factories (BL-032 Q13 / Path 2).
 *
 * The MCP Worker uses TWO separate Upstash databases:
 *
 *   1. **Inoreader DB** — the website's existing Upstash database. Holds the
 *      shared `inoreader:*` OAuth-token keys that the website's token-refresh
 *      job writes. The Worker accesses this DB via the database's **Read-Only**
 *      token (free, ships alongside the Standard token). Storage-layer
 *      enforcement: a leaked Worker token cannot mutate `inoreader:*`.
 *
 *   2. **MCP DB** — a dedicated free Upstash database owned by the MCP Worker.
 *      Holds Worker-managed `mcp:*` keys (rate-limit counters, the radar
 *      circuit-breaker, the health probe key, the cached Inoreader-status
 *      observation). The Worker uses this DB's **Standard** token for
 *      read+write. Rotation isolation: rotating this token has zero
 *      website-side blast radius.
 *
 * **Why two databases instead of one ACL-scoped token**: Upstash gates the
 * `ACL SETUSER` / `ACL RESTTOKEN` commands behind their paid Prod Pack
 * add-on. Two free DBs is the free-tier path that achieves both rotation
 * isolation AND storage-layer Q4 enforcement without paying for features
 * BL-032 doesn't need (99.99% SLA, multi-zone HA, etc). Full rationale in
 * the BL-032 design doc's Q13 Resolved-revision (2026-05-05) stanza.
 *
 * Each helper returns `null` when its credentials aren't bound on env —
 * the same graceful-skip pattern the existing limiter / circuit-breaker /
 * cache-store helpers use. The Worker treats null as "fail open with a
 * warning" rather than blocking user requests on Upstash being unavailable.
 */

import { Redis } from '@upstash/redis';
import type { Env } from '../worker';

/**
 * Build a Redis client for the **Inoreader DB** (read-only access to shared
 * `inoreader:*` keys). Returns null when credentials aren't bound.
 *
 * The token bound to `UPSTASH_INOREADER_REST_TOKEN` MUST be the website-DB's
 * Read-Only token; pasting the Standard token here defeats Q4's storage-layer
 * read-only invariant. See DEPLOY.md § A.3 for the operator walkthrough.
 */
export function createInoreaderClient(env: Env): Redis | null {
  const url = env.UPSTASH_INOREADER_REST_URL;
  const token = env.UPSTASH_INOREADER_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Build a Redis client for the **MCP DB** (read+write on Worker-owned
 * `mcp:*` keys). Returns null when credentials aren't bound.
 *
 * The token bound to `UPSTASH_MCP_REST_TOKEN` MUST be the MCP-DB's Standard
 * (read+write) token — the Worker writes rate-limit counters, the circuit
 * breaker flag, and Inoreader-status observations through this client.
 */
export function createMcpClient(env: Env): Redis | null {
  const url = env.UPSTASH_MCP_REST_URL;
  const token = env.UPSTASH_MCP_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
