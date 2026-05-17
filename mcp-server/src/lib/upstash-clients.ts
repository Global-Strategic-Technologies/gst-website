/**
 * Upstash Redis client factory — single MCP DB only (post-BL-032.8 Phase B).
 *
 * **History**: BL-032 Phase 4 originally introduced a two-database
 * architecture (the "Path 2" Q13 resolution) — a website-shared *Inoreader DB*
 * holding `inoreader:*` OAuth-token keys (read via the website's Read-Only
 * token) plus a Worker-owned *MCP DB* holding `mcp:*` rate-limit / circuit /
 * cache keys (read+write via Standard token). The two-DB split provided
 * storage-layer Q4 enforcement (a leaked Worker token couldn't mutate the
 * shared keys) without paying for Upstash's ACL-token feature.
 *
 * **Post-BL-032.8 Phase B (2026-05-17)**: the website no longer touches
 * Inoreader directly, so the Inoreader-DB's `inoreader:*` namespace has no
 * remaining writer. The Worker writes Inoreader tokens to the MCP DB under
 * the `mcp:inoreader:*` namespace (`inoreader-oauth.ts` is sole writer; the
 * single-flight lock mutually excludes concurrent isolates). The
 * Inoreader-DB factory + its `UPSTASH_INOREADER_REST_*` bindings were
 * retired in this PR; the database itself is decommissioned in the
 * Upstash console as part of the same Phase B operator-task batch.
 *
 * The MCP DB factory returns `null` when its credentials aren't bound on
 * env — the same graceful-skip pattern the existing limiter / circuit-breaker
 * / cache-store helpers use. The Worker treats null as "fail open with a
 * warning" rather than blocking user requests on Upstash being unavailable.
 */

import { Redis } from '@upstash/redis';
import type { Env } from '../worker';

/**
 * Build a Redis client for the **MCP DB** (read+write on Worker-owned
 * `mcp:*` keys, including `mcp:inoreader:*` token state). Returns null
 * when credentials aren't bound.
 *
 * The token bound to `UPSTASH_MCP_REST_TOKEN` MUST be the MCP-DB's Standard
 * (read+write) token — the Worker writes rate-limit counters, the circuit
 * breaker flag, Inoreader-status observations, and Inoreader OAuth tokens
 * through this client.
 */
export function createMcpClient(env: Env): Redis | null {
  const url = env.UPSTASH_MCP_REST_URL;
  const token = env.UPSTASH_MCP_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
