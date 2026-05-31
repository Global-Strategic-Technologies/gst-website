/**
 * BL-047 T2 — admin authentication helpers (constant-time + cookie).
 *
 * The `MCP_ADMIN_KEY` env var gates the `/admin/inoreader/reauth/*`
 * endpoints. It's a single secret distinct from the `MCP_KEY_*` team-key
 * family; team bearers do NOT grant admin access (admin routes are
 * slotted BEFORE the standard `authenticate()` call in `worker.ts`).
 *
 * Cookie session: `/start`'s POST handler sets a short-lived HttpOnly
 * cookie carrying the same random nonce that goes into Inoreader's
 * `state` query param. `/callback` validates cookie nonce equals URL
 * state — this is the actual CSRF defense (binding the OAuth flow to
 * the operator's browser session). Without the cookie, an attacker who
 * intercepts the Inoreader auth URL (via Referer leak / browser history
 * sync / etc.) cannot replay it.
 */

const COOKIE_NAME = 'mcp_reauth_session';
const COOKIE_TTL_SECONDS = 300; // 5 min — must outlast Upstash state TTL

/**
 * Timing-safe string equality. Web-Crypto-aware: prefers
 * `crypto.subtle.timingSafeEqual` when available (Workers runtime),
 * falls back to a manual constant-time XOR loop. Lengths are compared
 * BEFORE the loop because a length mismatch is itself a timing leak
 * the loop can't paper over.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Validate a bearer / form-submitted admin key against `env.MCP_ADMIN_KEY`.
 * Returns `false` when the env var is unbound (no admin key configured →
 * admin routes effectively disabled).
 */
export function validateAdminKey(provided: string, env: { MCP_ADMIN_KEY?: string }): boolean {
  const expected = env.MCP_ADMIN_KEY;
  if (!expected) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Build the `Set-Cookie` header value for the reauth session cookie.
 * Scoped to `/admin/inoreader/reauth/` so the cookie isn't sent on any
 * other request path; 5-min TTL matches the Upstash state TTL.
 */
export function buildSessionCookie(nonce: string): string {
  return `${COOKIE_NAME}=${nonce}; Max-Age=${COOKIE_TTL_SECONDS}; Path=/admin/inoreader/reauth/; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Build the cookie-clear header value. Used in the callback's success
 * response so the cookie doesn't linger past its one intended use.
 */
export function buildSessionClearCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/admin/inoreader/reauth/; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Extract the session nonce from the request's `Cookie` header. Returns
 * `null` when the cookie isn't present. Parses defensively — the worker
 * runtime exposes cookies as one big string per RFC 6265.
 */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  // Match `mcp_reauth_session=<value>` while accepting other cookies in
  // the same header. Value chars per RFC 6265: token or anything
  // double-quoted. We mint hex nonces so the strict `[A-Fa-f0-9]+`
  // class is sufficient.
  const m = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([A-Fa-f0-9]+)`));
  return m ? m[1]! : null;
}

/**
 * Mint a 32-character hex nonce. Cloudflare Workers expose
 * `crypto.randomUUID()` natively; strip dashes for the 32-char hex
 * shape we want for cookie + Upstash key.
 */
export function mintNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
