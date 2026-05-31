/**
 * BL-047 — Inoreader OAuth refresh-token grace-window cache.
 *
 * **Empirical justification** (verified 2026-05-31 via
 * `mcp-server/scripts/Test-InoreaderRefreshGrace.ps1`):
 *
 *   - Inoreader is in **dense rotation** mode — every successful
 *     `POST /oauth2/token` returns a NEW `refresh_token`, invalidating
 *     the previous one in the AS's index.
 *   - Inoreader honors a **grace window of ≥60 seconds** during which
 *     the previously-issued refresh_token remains valid. This is NOT
 *     the strict RFC 6749 § 10.4 / BCP 240 reuse-detection semantic
 *     some modern providers (e.g. Microsoft Entra ID) implement —
 *     Inoreader's chain is forgiving for a bounded window.
 *
 * This module caches the previous refresh_token in-isolate (NOT
 * Upstash — the cache must NOT survive isolate restarts; a token
 * fetched from cold storage is more likely to be outside the grace
 * window than within it). When a refresh attempt fails with
 * `invalid_grant`, the caller in `inoreader-oauth.ts` consults the
 * cache and may retry once with the previously-cached token.
 *
 * **What this closes** (failure modes that previously surfaced as
 * `invalid-refresh-token` to the operator):
 *
 *   - **Worker isolate stranded after external invalidation** — a
 *     rotation succeeded in this isolate, then Inoreader-side state
 *     evicted the new token before our next call. The cached previous
 *     token still works within the 60s window.
 *   - **Cron-vs-live race where Upstash state is wrong** — both isolates
 *     POSTed in parallel; one's response token was overwritten in
 *     Upstash; the loser's read produces a stale token. The grace
 *     window self-heals via the natural retry path even WITHOUT this
 *     hedge, but the hedge catches the case where the stale token is
 *     ALSO outside grace.
 *
 * **What this does NOT close**:
 *
 *   - **True refresh-token chain death** — operator revocation, password
 *     change, fraud-detection trip. Both the cached and the stored
 *     tokens die together; only BL-047 T2 (in-browser re-auth)
 *     recovers.
 *   - **Cross-isolate hedge** — the cache is in-isolate; a brand-new
 *     isolate started after invalidation has no cached token to fall
 *     back to. This is intentional: Workers isolates may be reused
 *     across requests for minutes (typical) but are not durable. A
 *     persisted cache could outlive the grace window and present a
 *     definitely-dead token.
 *
 * **TTL choice**: 60s. Empirically verified safe by
 * `Test-InoreaderRefreshGrace.ps1 -GraceWindowSeconds 60`. We do NOT
 * extrapolate beyond the tested upper bound. If Inoreader narrows the
 * window in the future, the worst case is an extra `invalid_grant`
 * surfaced — no regression beyond current behavior.
 */

const GRACE_TTL_MS = 60_000;

interface CacheEntry {
  readonly token: string;
  readonly capturedAt: number;
}

let cache: CacheEntry | null = null;

/**
 * Cache the refresh_token that we just successfully used (and have
 * since seen rotated by Inoreader). Called from the rotation-detected
 * branch in `inoreader-oauth.ts` BEFORE attempting the Upstash write so
 * the cache is populated even if the persist step subsequently fails.
 *
 * Overwrites any previous entry — only ONE previous token is held at a
 * time, per Inoreader's chain semantics (the grace window is rolling;
 * older-than-previous tokens are dead).
 */
export function cachePreviousToken(token: string): void {
  cache = { token, capturedAt: Date.now() };
}

/**
 * Read the cached previous token, if still within the grace window.
 * Returns `null` when the cache is empty OR when the entry has aged
 * past `GRACE_TTL_MS` (the entry is also evicted in that case, to keep
 * the surface honest).
 */
export function getPreviousToken(): string | null {
  if (!cache) return null;
  if (Date.now() - cache.capturedAt > GRACE_TTL_MS) {
    cache = null;
    return null;
  }
  return cache.token;
}

/**
 * Explicit eviction. Used after a successful hedge recovery to avoid
 * re-using the now-known-dead token, and exported for tests so each
 * case starts with a clean cache.
 */
export function clearPreviousToken(): void {
  cache = null;
}

/**
 * Test-only: expose the TTL so tests can pin the contract without
 * importing the literal.
 */
export const __TEST_GRACE_TTL_MS__ = GRACE_TTL_MS;
