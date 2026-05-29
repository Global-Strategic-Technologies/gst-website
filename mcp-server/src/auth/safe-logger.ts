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

/**
 * Structured log-event shape. Phase 5 extends Phase 2's minimal envelope
 * with the BACKLOG-specified observability fields:
 *   { timestamp, keyOwner, tool, durationMs, success, errorCode }
 *
 * `tool` and `durationMs` are optional in Phase 5 — the Worker boundary
 * doesn't pre-parse the MCP body to extract the tool name (that's a
 * BL-032.75 maturity step that requires `request.clone()` + JSON-RPC
 * parse before delegation, with a measurable latency cost). Tool-side
 * logging (within each tool handler) records its own `tool` name when
 * useful; the Worker layer logs the request envelope.
 */
export interface LogEvent {
  /** Short event identifier — e.g. 'auth.ok', 'auth.failed', 'mcp.request'. */
  event: string;
  /** Stripped suffix of `MCP_KEY_*` for the authenticated request, if any. */
  keyOwner?: string;
  /** Pathname of the inbound request. */
  path?: string;
  /** Numeric response status. */
  status?: number;
  /** Failure reason — keep prose short and non-PII. */
  reason?: string;
  /** MCP tool name, when known. Populated by tool-side handlers; Worker boundary leaves blank (see module docstring above). */
  tool?: string;
  /** Wall-clock duration in milliseconds. Useful at handler boundaries; Worker layer measures end-to-end. */
  durationMs?: number;
  /** Whether the operation succeeded. Distinct from `status` — a 401 is "successful auth-rejection," not a service success. */
  success?: boolean;
  /** Structured error code for failure events — e.g. 'inoreader-rate-limit', 'token-stale'. */
  errorCode?: string;
  /** MCP Resource URI (e.g. `gst://library/vdr-structure`). Carried on `resource_cache_*` events from BL-032.5 Phase 1; safe to log (URIs are public identifiers). */
  uri?: string;
  /**
   * Sub-classification for `auth.failed` events — the discriminator from
   * `AuthFailure.reason`. Lets `wrangler tail`-side analysis distinguish
   * probe traffic (`missing-header` / `empty-token` / `bad-scheme`) from
   * actionable failures (`invalid-token` / `malformed-scopes`) even when
   * Sentry capture was suppressed for the probe-class entries.
   */
  authFailureReason?: string;
  /**
   * Inoreader egress attribution (BL-032.75 Phase 0). One of the values in
   * `InoreaderEgressCategory` — `'cron-radar'`, `'live-radar'`,
   * `'http-radar-snapshot'`, `'oauth-refresh'`, `'401-retry'`. Carried on
   * `inoreader.egress` and `inoreader.egress.counter-write-failed` events.
   */
  category?: string;
  /**
   * `X-Reader-Zone1-Usage` value from an Inoreader response, when present.
   * Carried on `inoreader.egress` events so per-call spend is visible in
   * wrangler-tail output without having to cross-reference Upstash.
   */
  zone1Usage?: number;
  /**
   * Short identifier of an Inoreader egress call site — e.g.
   * `'fetchAnnotatedItems'`, `'tag-list'`, `'folder:GST-pe-ma'`,
   * `'refresh-cron'`. Carried on `inoreader.egress` events alongside
   * `category`. BL-032.75 Phase 0 audit fix S3: previously these values
   * were overloaded onto the `tool` field, which downstream Sentry
   * queries (filtering `tool = "search_radar"`) treated as MCP tool
   * names. The dedicated field keeps `tool` clean for its semantic
   * meaning and lets egress filters scope to call-site granularity
   * without pre-joining the category breakdown.
   */
  egressSource?: string;
  /**
   * Cron expression from `ScheduledController.cron` (e.g.
   * `0` `<asterisk-slash-6>` `<asterisk>` `<asterisk>` `<asterisk>` — escaped
   * here because JSDoc otherwise treats the embedded `*` `/` `6` as a
   * close-comment-then-divide-by-6). Carried on cron-path events so operator
   * queries can filter by schedule when multiple cron entries are defined.
   * BL-032.77 dedup added this for `cron.scheduled.deduplicated` correlation.
   */
  cron?: string;
  /**
   * `ScheduledController.scheduledTime` — epoch ms of the scheduled fire
   * (NOT wall-clock at invocation). Identical across duplicate invocations
   * of the same cron firing, which is what BL-032.77's dedup lock keys on.
   * Carried on `cron.scheduled.deduplicated` so operators can correlate the
   * dropped invocation with the winner's logs by matching scheduledTime.
   */
  scheduledTime?: number;
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
