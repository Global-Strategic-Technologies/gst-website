/**
 * BL-039 — Worker-triggered Inoreader OAuth refresh endpoint.
 *
 * Lets the MCP Worker explicitly trigger a token refresh when it sees
 * Inoreader return 401 (`reason: 'token-stale'`), instead of waiting for
 * a human to visit `/hub/radar`. Preserves the Q4 single-writer invariant:
 * the website is still the only thing that writes `inoreader:access_token`
 * to Upstash — the Worker just asks us to do it via this auth-gated route.
 *
 * Auth: `Authorization: Bearer <INOREADER_REFRESH_SECRET>` matching the
 * same secret bound on the Worker. Wrong/missing secret → 401.
 *
 * When INOREADER_REFRESH_SECRET is not bound on the website env, the
 * endpoint returns 503 (refusing to operate unauthenticated). The Worker
 * is expected to handle 503 by falling back to the legacy token-stale
 * envelope (the pre-BL-039 behavior).
 *
 * Failure modes (all distinguishable in the response body's `reason`):
 *   - 401 auth-missing / auth-mismatch
 *   - 503 endpoint-disabled (no shared secret on this env)
 *   - 502 inoreader-rejected (refresh-token exchange failed at Inoreader)
 *   - 500 internal-error (anything else thrown by the refresh helper)
 *
 * Caller contract (Worker side, BL-039 Phase 4): on 200, retry the
 * originally-failed Inoreader request ONCE with the (freshly-written)
 * access token. On any non-200, surface the original `token-stale`
 * envelope to the MCP client.
 */

import type { APIRoute } from 'astro';
import { INOREADER_REFRESH_SECRET } from 'astro:env/server';
import { triggerInoreaderRefresh } from '../../../lib/inoreader/client';
import * as Sentry from '@sentry/node';

export const prerender = false;

/**
 * Constant-time string comparison — defends against timing side-channels
 * when checking the shared secret. Returns false on length mismatch
 * without scanning further; otherwise XOR every byte before returning.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  // Endpoint refuses to operate without a configured shared secret.
  // The Worker should treat 503 as "BL-039 not deployed here, fall back
  // to the legacy token-stale envelope."
  if (!INOREADER_REFRESH_SECRET) {
    return jsonResponse(503, {
      ok: false,
      reason: 'endpoint-disabled',
      message:
        'INOREADER_REFRESH_SECRET is not bound on this env. Set it on the website (Vercel) and re-deploy.',
    });
  }

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return jsonResponse(401, {
      ok: false,
      reason: 'auth-missing',
      message: 'Authorization: Bearer <shared-secret> header required.',
    });
  }

  const presented = auth.slice('Bearer '.length).trim();
  if (!timingSafeEqual(presented, INOREADER_REFRESH_SECRET)) {
    // Log + Sentry-tag for visibility — repeated 401s here suggest a
    // misconfigured Worker (mismatched secret) or a probe.
    Sentry.captureMessage('BL-039 refresh endpoint auth mismatch', {
      level: 'warning',
      tags: { area: 'bl-039', endpoint: '/api/inoreader/refresh' },
    });
    return jsonResponse(401, {
      ok: false,
      reason: 'auth-mismatch',
      message: 'Shared secret did not match.',
    });
  }

  try {
    const outcome = await triggerInoreaderRefresh();

    if (outcome.ok) {
      Sentry.captureMessage('BL-039 refresh succeeded (Worker-initiated)', {
        level: 'info',
        tags: { area: 'bl-039', endpoint: '/api/inoreader/refresh', source: 'worker' },
      });
      return jsonResponse(200, { ok: true });
    }

    // Distinguish "we tried, Inoreader said no" (502) from "config/code
    // problem on this side" (500) so the Worker doesn't retry the same
    // failure in a tight loop.
    const status = outcome.reason === 'inoreader-rejected' ? 502 : 500;
    Sentry.captureMessage(`BL-039 refresh failed: ${outcome.reason ?? 'unknown'}`, {
      level: 'error',
      tags: {
        area: 'bl-039',
        endpoint: '/api/inoreader/refresh',
        reason: outcome.reason ?? 'unknown',
      },
    });
    return jsonResponse(status, {
      ok: false,
      reason: outcome.reason,
      message: outcome.message,
    });
  } catch (e) {
    const err = e as Error;
    Sentry.captureException(err, {
      tags: { area: 'bl-039', endpoint: '/api/inoreader/refresh' },
    });
    return jsonResponse(500, {
      ok: false,
      reason: 'internal-error',
      message: err.message,
    });
  }
};

// Reject non-POST methods — refresh is an action, not a GET. Returning
// the same shape as our error responses keeps the contract consistent.
export const GET: APIRoute = () =>
  jsonResponse(405, {
    ok: false,
    reason: 'method-not-allowed',
    message: 'POST required.',
  });
