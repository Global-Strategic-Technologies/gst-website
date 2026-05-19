/**
 * Cached Inoreader-liveness state for the /health endpoint (BL-032 Q8).
 *
 * **Why this exists**: a naive `/health` implementation would call Inoreader
 * on every probe to confirm liveness. Health endpoints get hammered by
 * uptime monitors — the BACKLOG calls out this exact failure mode. So
 * we instead **cache the last observed Inoreader response status** in
 * Upstash. The radar-live tools' real Inoreader calls write to this key;
 * the health endpoint just reads it.
 *
 * Status semantics:
 *   - `'ok'`        — last Inoreader call was 2xx
 *   - `'degraded'`  — last Inoreader call returned 429 / 5xx / timed out
 *   - `'unknown'`   — no Inoreader call has been observed yet (cold start,
 *                     pre-first-cron) or the entry is unreadable
 *
 * **Stale-while-OK semantics** (2026-05-19): the key has no TTL — the
 * most recent observation persists indefinitely. The `observedAt`
 * timestamp is the truth; readers (health endpoint, operator, dashboards)
 * compute their own staleness threshold. This replaced the original
 * 5-minute TTL because the 6h cron cadence + cache-only website traffic
 * meant the key was expired ~98% of the time — `/health` reported
 * `'unknown'` continuously between cron firings, regardless of whether
 * Inoreader was actually healthy.
 *
 * **Source field**: each entry records whether the observation came from
 * the cron path or from a live MCP tool call. Diagnostically useful for
 * "is anyone actively using this server?" — if every observation for
 * weeks is `source: 'cron'`, no human has triggered an MCP tool call.
 *
 * **Storage location**: despite the `inoreader` in the file name, the
 * `mcp:inoreader:last-status` key is Worker-observed state about Inoreader's
 * responses (NOT Inoreader's own data) — it lives in the **MCP DB** under
 * the `mcp:*` namespace, written via the MCP DB's Standard token.
 */

import { createMcpClient } from '../lib/upstash-clients';
import type { Env } from '../worker';

const STATUS_KEY = 'mcp:inoreader:last-status';

export type InoreaderStatus = 'ok' | 'degraded' | 'unknown';
export type InoreaderObservedSource = 'cron' | 'live-tool';

interface StatusEntry {
  readonly status: 'ok' | 'degraded';
  readonly observedAt: string;
  readonly source: InoreaderObservedSource;
  /** Optional context — error code on degraded; method name on ok. */
  readonly note?: string;
}

/**
 * Record the last observed Inoreader status. Called from the radar-live
 * tools after each Inoreader call:
 *
 *   - on `ok` (2xx response with parsed body): `recordInoreaderStatus(env, 'ok', source)`
 *   - on `degraded` (429 / 5xx / timeout / token-stale): `recordInoreaderStatus(env, 'degraded', source, reason)`
 *
 * `source` distinguishes cron-triggered observations from live-MCP-tool
 * observations. Operators reading `/health` use this to tell "the cron
 * is the only thing exercising Inoreader" from "active client traffic."
 *
 * Best-effort write — Upstash failures are swallowed (caller proceeds).
 * No-op when Upstash creds aren't bound.
 */
export async function recordInoreaderStatus(
  env: Env,
  status: 'ok' | 'degraded',
  source: InoreaderObservedSource,
  note?: string
): Promise<void> {
  const redis = createMcpClient(env);
  if (!redis) return;

  const entry: StatusEntry = {
    status,
    observedAt: new Date().toISOString(),
    source,
    note,
  };

  try {
    // No TTL — the most recent observation persists indefinitely. See
    // the "Stale-while-OK semantics" section in the module-level docstring
    // for the rationale.
    await redis.set(STATUS_KEY, JSON.stringify(entry));
  } catch {
    // Best-effort. Status reporting is observability, not auth — degraded
    // Upstash shouldn't fail user requests.
  }
}

/**
 * Read the cached Inoreader status. Returns `'unknown'` when no entry
 * exists (never written) OR when Upstash is unreachable. Includes the
 * timestamp of the last observation (`observedAt`), its age in seconds
 * (`observedSecondsAgo`), and the source of that observation so the
 * health endpoint can surface them.
 *
 * Backwards-compatible with entries written by the pre-2026-05-19 code
 * path (which lacked the `source` field): those reads return
 * `source: null` and otherwise behave normally. The next refresh
 * upgrades the entry to the new shape.
 */
export async function readInoreaderStatus(env: Env): Promise<{
  status: InoreaderStatus;
  observedAt: string | null;
  observedSecondsAgo: number | null;
  source: InoreaderObservedSource | null;
  note: string | null;
}> {
  const redis = createMcpClient(env);
  if (!redis) {
    return {
      status: 'unknown',
      observedAt: null,
      observedSecondsAgo: null,
      source: null,
      note: null,
    };
  }

  try {
    // Upstash auto-parses JSON values stored via redis.set(JSON.stringify(...)).
    // Handle both shapes (parsed object OR raw string).
    const raw = await redis.get<StatusEntry | string | null>(STATUS_KEY);
    if (raw == null) {
      return {
        status: 'unknown',
        observedAt: null,
        observedSecondsAgo: null,
        source: null,
        note: null,
      };
    }
    const entry: StatusEntry = typeof raw === 'string' ? (JSON.parse(raw) as StatusEntry) : raw;
    const observedAtMs = new Date(entry.observedAt).getTime();
    const observedSecondsAgo = Number.isFinite(observedAtMs)
      ? Math.max(0, Math.floor((Date.now() - observedAtMs) / 1000))
      : null;
    return {
      status: entry.status,
      observedAt: entry.observedAt,
      observedSecondsAgo,
      source: entry.source ?? null,
      note: entry.note ?? null,
    };
  } catch {
    return {
      status: 'unknown',
      observedAt: null,
      observedSecondsAgo: null,
      source: null,
      note: null,
    };
  }
}
