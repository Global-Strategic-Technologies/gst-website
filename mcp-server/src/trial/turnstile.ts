/**
 * Cloudflare Turnstile server-side verification (BL-155 Slice 2).
 *
 * Contract (developers.cloudflare.com/turnstile/get-started/server-side-validation,
 * read 2026-09-06): POST `siteverify` with `secret` + `response` (+ optional
 * `remoteip`), JSON back `{ success, challenge_ts, hostname, action, cdata,
 * "error-codes": [] }`. Tokens are single-use and valid for 300s; a replay
 * surfaces as `timeout-or-duplicate`.
 *
 * Hardened, not just called. A siteverify that only checks `success` would
 * accept a token minted for a DIFFERENT site (the secret is per-widget, but
 * a widget may be allowed on several hostnames) or under a different
 * `action`. So `hostname` must be one of the configured expected names and
 * `action` must be the page's constant.
 *
 * Failure vocabulary the handler maps to HTTP:
 *   - `rejected`, retryable   — the visitor can re-run the widget
 *                               (`timeout-or-duplicate`, `invalid-input-response`)
 *   - `rejected`, !retryable  — hostname/action mismatch or a config-class
 *                               error code; re-running will not help
 *   - `unavailable`           — Cloudflare unreachable / timed out / 5xx /
 *                               non-JSON / `internal-error`. Fail CLOSED.
 *
 * The fetch carries an explicit timeout. Without it a stalled upstream would
 * hold the request open and the 503 path would be unreachable.
 */

export const TURNSTILE_ACTION = 'trial-signup';
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_TIMEOUT_MS = 5000;

/** Error codes where a fresh widget run can succeed. */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'timeout-or-duplicate',
  'invalid-input-response',
  'missing-input-response',
]);

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; kind: 'rejected'; retryable: boolean; reason: string }
  | { ok: false; kind: 'unavailable'; reason: string };

export interface VerifyInput {
  secret: string;
  token: string;
  remoteIp: string;
  /** From `parseHostnames(env.TURNSTILE_EXPECTED_HOSTNAMES)`. */
  expectedHostnames: readonly string[];
  timeoutMs?: number;
}

interface SiteverifyBody {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  'error-codes'?: unknown;
}

/** Comma-separated env var → trimmed, lower-cased, empties dropped. */
export function parseHostnames(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Exact match, or suffix match when the configured entry starts with `.`. */
export function hostnameAllowed(hostname: string, expected: readonly string[]): boolean {
  const h = hostname.toLowerCase();
  return expected.some((e) => (e.startsWith('.') ? h.endsWith(e) && h !== e.slice(1) : h === e));
}

export async function verifyTurnstile(input: VerifyInput): Promise<VerifyOutcome> {
  const body = new URLSearchParams({
    secret: input.secret,
    response: input.token,
    remoteip: input.remoteIp,
  });
  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, kind: 'unavailable', reason: `siteverify-fetch: ${(e as Error).name}` };
  }
  if (!res.ok) {
    return { ok: false, kind: 'unavailable', reason: `siteverify-status-${res.status}` };
  }
  let parsed: SiteverifyBody;
  try {
    parsed = (await res.json()) as SiteverifyBody;
  } catch {
    return { ok: false, kind: 'unavailable', reason: 'siteverify-non-json' };
  }
  const codes = Array.isArray(parsed['error-codes'])
    ? (parsed['error-codes'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  if (parsed.success !== true) {
    if (codes.includes('internal-error')) {
      return { ok: false, kind: 'unavailable', reason: 'siteverify-internal-error' };
    }
    const retryable = codes.length > 0 && codes.every((c) => RETRYABLE_CODES.has(c));
    return { ok: false, kind: 'rejected', retryable, reason: codes.join(',') || 'unsuccessful' };
  }
  if (
    typeof parsed.hostname !== 'string' ||
    !hostnameAllowed(parsed.hostname, input.expectedHostnames)
  ) {
    return { ok: false, kind: 'rejected', retryable: false, reason: 'hostname-mismatch' };
  }
  if (parsed.action !== TURNSTILE_ACTION) {
    return { ok: false, kind: 'rejected', retryable: false, reason: 'action-mismatch' };
  }
  return { ok: true };
}
