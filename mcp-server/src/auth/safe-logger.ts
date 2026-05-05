/**
 * Safe structured-logging helper for the MCP Worker (BL-032 Phase 2).
 *
 * **Why this exists**: Cloudflare's `wrangler tail` and Sentry both
 * surface anything written to `console.log` / `console.error`. A careless
 * `console.log(request.headers)` on a Worker fetch handler dumps the
 * Authorization header (and any cookies, if present) to those streams.
 * The BL-032 BACKLOG calls out exactly this risk.
 *
 * The mitigation is twofold:
 *   1. This module — accept ONLY structured fields, never a raw Headers
 *      object. Auto-redact known-sensitive header values if a caller
 *      slipped one in.
 *   2. ESLint `no-console` rule scoped to `src/worker.ts` and
 *      `src/auth/**` — forces use of `safeLog()` in the Worker code path.
 *      The stdio entrypoint (`src/index.ts`) is exempt; stdio MUST use
 *      `console.error` for diagnostic output (stdout is reserved for
 *      MCP protocol traffic).
 *
 * Phase 2 ships the minimum viable log line. Phase 5 (observability)
 * extends the schema with `tool`, `durationMs`, `errorCode`, etc., and
 * wires Sentry breadcrumbs.
 */

const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'cookie', 'x-api-key']);
const REDACTED = '[REDACTED]';

/** Phase 2 log-event shape. Phase 5 extends. */
export interface LogEvent {
  /** Short event identifier — e.g. 'auth.ok', 'auth.failed', 'mcp.delegated'. */
  event: string;
  /** Stripped suffix of `MCP_KEY_*` for the authenticated request, if any. */
  keyOwner?: string;
  /** Pathname of the inbound request. */
  path?: string;
  /** Numeric response status. */
  status?: number;
  /** Failure reason for `auth.failed` etc. — keep prose short and non-PII. */
  reason?: string;
}

/**
 * Emit one structured JSON line to the Worker's stdout. `wrangler tail`
 * picks this up automatically; Phase 5 adds Sentry forwarding via the
 * same emitter.
 */
export function safeLog(event: LogEvent): void {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    ...event,
  };

  // Defensive scrub: if a future caller passes a full headers map by
  // mistake (e.g. spreading `...Object.fromEntries(request.headers)`),
  // redact known-sensitive values before emitting. This is belt-and-
  // suspenders; the typed LogEvent shape above already prevents the
  // common case at compile time.
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== 'string') continue;
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      payload[key] = REDACTED;
    }
  }

  // Single direct call site for `console.log` — by design, the only place
  // in the Worker code path where it appears. The ESLint override makes
  // this the ONE permitted occurrence; everywhere else uses safeLog().
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}
