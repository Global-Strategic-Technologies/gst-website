/**
 * BL-039 — Worker → website refresh-trigger (Phase A fallback only).
 *
 * **Lifetime**: this module exists for the duration of BL-032.8 Phase A.
 * Phase B deletes the entire file in a single removal commit + import
 * cleanup. The Phase 1 refactor split this code out of `inoreader-client.ts`
 * specifically so Phase B's deletion is structurally clean — no diff into
 * the new Phase 2 OAuth modules, no risk of accidentally regressing the
 * Worker-direct refresh path while removing the fallback.
 *
 * **Behavior** (unchanged from the pre-BL-032.8 implementation in
 * `inoreader-worker.ts`):
 *   1. If `INOREADER_REFRESH_SECRET` is not bound on the env, return `false`
 *      immediately (BL-039 disabled for this deployment).
 *   2. POST to `INOREADER_REFRESH_URL` (default: production website endpoint)
 *      with `Authorization: Bearer <INOREADER_REFRESH_SECRET>`.
 *   3. Return `true` only on 2xx response. Any non-2xx / network error /
 *      timeout returns `false` — caller falls back to the legacy
 *      token-stale envelope.
 *   4. Never throws.
 *
 * **Why this is a separate module** (not inlined in `inoreader-client.ts`):
 *   - Phase B deletion is one `rm` + ~5 LOC of import / branch removal in
 *     `inoreader-client.ts` — much smaller blast radius than a multi-section
 *     delete inside the main client.
 *   - Tests that mock this module's surface (e.g. `mockTriggerRefresh.mockResolvedValue(true)`)
 *     don't need to know how the fallback works; the abstraction boundary
 *     is the module surface.
 *   - The "Phase A only" lifetime is documented in the file itself, not
 *     buried in a comment block inside a 600-line file.
 */

import type { Env } from '../worker';

/**
 * Default refresh endpoint URL. Production website (Vercel) hosts this. The
 * Inoreader account is shared across staging + production Workers per Q13's
 * two-DB architecture; both Worker envs point at the same refresh-writer in
 * steady state.
 *
 * Override via `INOREADER_REFRESH_URL` on the Worker env when soaking BL-039
 * against a Vercel preview deployment — set it to the preview URL during
 * verification, then unset (or set to production) afterwards.
 */
const DEFAULT_REFRESH_ENDPOINT_URL = 'https://globalstrategic.tech/api/inoreader/refresh';

/** Wall-clock timeout for the website refresh round-trip. */
const REFRESH_TIMEOUT_MS = 8_000;

/**
 * Call the website's `/api/inoreader/refresh` endpoint to trigger an OAuth
 * refresh. Returns `true` if the refresh succeeded (the website has persisted
 * a new access token to Upstash; the caller should re-resolve config + retry
 * the original Inoreader request).
 *
 * Returns `false` when:
 *   - `INOREADER_REFRESH_SECRET` is not bound on the Worker env (BL-039 not
 *     configured here) → caller falls back to legacy token-stale envelope
 *   - Endpoint returns non-2xx → fail-fast; the failure is sticky until creds
 *     rotate or the operator intervenes
 *   - Network error / timeout → same fallback semantics
 *
 * Never throws — callers treat any failure as "refresh unavailable" and
 * surface the original token-stale error.
 */
export async function triggerWebsiteRefresh(env: Env): Promise<boolean> {
  if (!env.INOREADER_REFRESH_SECRET) {
    // BL-039 not configured on this env — fall back to legacy behavior.
    // No Sentry breadcrumb: this is a known-and-handled deployment state
    // until the secret rolls out to all envs.
    return false;
  }

  const url = env.INOREADER_REFRESH_URL ?? DEFAULT_REFRESH_ENDPOINT_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.INOREADER_REFRESH_SECRET}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    if (res.ok) return true;

    // Non-2xx: refresh endpoint is reachable but rejected/errored. Don't
    // retry; just fall back to token-stale envelope. The endpoint has its
    // own Sentry tagging on the website side so we don't double-capture.
    return false;
  } catch {
    // Network error / timeout / abort — refresh endpoint unreachable.
    // Same fallback semantics as 503.
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
