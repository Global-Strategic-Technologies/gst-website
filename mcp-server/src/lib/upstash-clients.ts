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
import type { Env } from '../env';

/** Per-call overrides for {@link createMcpClient}. */
export interface McpClientOptions {
  /**
   * BL-121 — pass `false` to disable retry/backoff for callers that have
   * already promised to fail quiet.
   *
   * The SDK default is 5 `retries`, and the request loop runs
   * `for (i = 0; i <= attempts; i++)` with the sleep guarded by `i < attempts`
   * — so the default is **six fetch attempts and five sleeps**
   * (`exp(0..4) * 50` = 4,289 ms) before a call gives up. Any caller that
   * awaits such a client puts that whole budget on its own response path
   * during an Upstash brownout.
   *
   * `false` resolves to `{attempts: 1, backoff: () => 0}` — two fetch
   * attempts, no sleep. Note this is the true floor: `{retries: 1}` yields
   * the same two attempts *plus* a 50 ms sleep, so it is strictly worse for
   * a fail-quiet caller. There is no zero-retry setting.
   */
  readonly retry?: false;
}

/**
 * Build a Redis client for the **MCP DB** (read+write on Worker-owned
 * `mcp:*` keys, including `mcp:inoreader:*` token state). Returns null
 * when credentials aren't bound.
 *
 * The token bound to `UPSTASH_MCP_REST_TOKEN` MUST be the MCP-DB's Standard
 * (read+write) token — the Worker writes rate-limit counters, the circuit
 * breaker flag, Inoreader-status observations, and Inoreader OAuth tokens
 * through this client.
 *
 * Building a second client is free — the SDK is stateless HTTP, so there is
 * no pool or connection to duplicate.
 */
export function createMcpClient(env: Env, opts: McpClientOptions = {}): Redis | null {
  const url = env.UPSTASH_MCP_REST_URL;
  const token = env.UPSTASH_MCP_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, ...(opts.retry === false ? { retry: false } : {}) });
}
