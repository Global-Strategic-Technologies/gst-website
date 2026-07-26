/**
 * Shared Cloudflare Analytics Engine SQL query runner (BL-033 Slice 4).
 *
 * Extracted verbatim-behavior from the alert evaluator's private
 * `queryAeFactory` so both the evaluator (alert rules) and the status-page
 * metrics precompute use ONE AE client. Returns `null` (never throws) when
 * credentials are unbound, the request fails, times out, or the response
 * shape is unexpected — every caller fails open on `null`.
 *
 * Auth: `env.CF_AE_TOKEN` (Bearer) + `env.CF_ACCOUNT_ID` (note: the Worker
 * uses `CF_ACCOUNT_ID`, not `CLOUDFLARE_ACCOUNT_ID`). SQL is sent as the raw
 * request body with `FORMAT JSON` appended here (callers pass bare SQL).
 */
import { safeLog } from '../auth/safe-logger';
import type { Env } from '../worker';

/** One AE SQL row — string/number columns as returned by the AE SQL API. */
export type AeRow = Record<string, string | number>;

/** Bare-SQL in (no `FORMAT JSON`), rows or `null` (fail-open) out. */
export type AeQuery = (sql: string) => Promise<AeRow[] | null>;

const AE_QUERY_TIMEOUT_MS = 4000;

/**
 * Build an `AeQuery` bound to this env's credentials. When `CF_AE_TOKEN` /
 * `CF_ACCOUNT_ID` are unbound, returns a query that always yields `null`
 * (so AE-backed callers degrade gracefully rather than throw).
 */
export function createAeQuery(env: Env): AeQuery {
  const token = env.CF_AE_TOKEN as string | undefined;
  const accountId = env.CF_ACCOUNT_ID as string | undefined;
  if (!token || !accountId) {
    return async () => null;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;
  return async (sql: string): Promise<AeRow[] | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AE_QUERY_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: `${sql} FORMAT JSON`,
        signal: controller.signal,
      });
      if (!res.ok) {
        safeLog({
          event: 'ae-query.non-2xx',
          status: res.status,
          success: false,
          errorCode: 'ae-query-non-2xx',
        });
        return null;
      }
      const json = (await res.json()) as { data?: AeRow[] };
      return Array.isArray(json.data) ? json.data : null;
    } catch (err) {
      safeLog({
        event: 'ae-query.failed',
        success: false,
        errorCode: 'ae-query-failed',
        reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
