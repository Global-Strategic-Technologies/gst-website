/**
 * Tests for the discovery-defense logic in `src/middleware.ts`.
 *
 * Behavior under test: when a request hits an internal-only endpoint
 * (e.g. `/api/inoreader/refresh`) without a `Authorization: Bearer …`
 * header, the middleware returns a silent 404 before the route handler
 * runs. Real callers (the MCP Worker, which sends the bearer) reach
 * the route handler unchanged.
 *
 * This matches the website-side analogue of the MCP Worker's
 * `isRoutedPath()` allowlist (PR #141): probe-class auth failures
 * appear indistinguishable from "endpoint doesn't exist" to the caller,
 * which keeps the visible-error surface (Vercel function logs, Sentry)
 * clean of bot-probe noise.
 *
 * The real `onRequest` middleware is exercised by calling it with a
 * synthetic Astro `APIContext` and a `next()` spy. The spy lets us
 * assert whether the middleware short-circuited (no next() call) or
 * passed through to the route handler (next() called once).
 */

import { describe, it, expect, vi } from 'vitest';
import { onRequest } from '@/middleware';
import type { APIContext, MiddlewareNext } from 'astro';

function makeContext(opts: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}): APIContext {
  const url = new URL(opts.url);
  const headers = new Headers(opts.headers ?? {});
  const request = new Request(url, { method: opts.method ?? 'GET', headers });
  return { url, request } as APIContext;
}

function makeNext(returns?: Response): MiddlewareNext {
  return vi.fn(
    async () => returns ?? new Response('ok', { status: 200 })
  ) as unknown as MiddlewareNext;
}

/**
 * `defineMiddleware` types the return as `Response | void`, but our
 * `onRequest` always returns a Response in practice. This wrapper
 * narrows the type at the call site so each test doesn't have to.
 */
async function callMiddleware(ctx: APIContext, next: MiddlewareNext): Promise<Response> {
  const result = await onRequest(ctx, next);
  if (!(result instanceof Response)) {
    throw new Error('expected middleware to return a Response');
  }
  return result;
}

describe('middleware — discovery defense for /api/inoreader/refresh', () => {
  it('returns 404 for an anonymous GET (no Authorization header)', async () => {
    const ctx = makeContext({
      url: 'https://globalstrategic.tech/api/inoreader/refresh',
      method: 'GET',
    });
    const next = makeNext();
    const res = await callMiddleware(ctx, next);

    expect(res.status).toBe(404);
    // Route handler MUST NOT have run — the whole point is to short-circuit
    // before the function does any work.
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 for an anonymous POST (no Authorization header)', async () => {
    const ctx = makeContext({
      url: 'https://globalstrategic.tech/api/inoreader/refresh',
      method: 'POST',
    });
    const res = await callMiddleware(ctx, makeNext());
    expect(res.status).toBe(404);
  });

  it('returns 404 for a request with a non-Bearer Authorization scheme', async () => {
    const ctx = makeContext({
      url: 'https://globalstrategic.tech/api/inoreader/refresh',
      method: 'POST',
      headers: { Authorization: 'Basic c29tZTpjcmVk' },
    });
    const res = await callMiddleware(ctx, makeNext());
    expect(res.status).toBe(404);
  });

  it('returns 404 for a Bearer header with an empty token', async () => {
    const ctx = makeContext({
      url: 'https://globalstrategic.tech/api/inoreader/refresh',
      method: 'POST',
      headers: { Authorization: 'Bearer    ' },
    });
    const res = await callMiddleware(ctx, makeNext());
    expect(res.status).toBe(404);
  });

  it('lets a request with a Bearer token through to the route handler', async () => {
    // The middleware doesn't validate the bearer value — that's the route
    // handler's job. Middleware only filters anonymous probes. A bearer
    // present (even if wrong) reaches the route handler, which compares
    // against the configured secret and returns 401 + Sentry on mismatch.
    const ctx = makeContext({
      url: 'https://globalstrategic.tech/api/inoreader/refresh',
      method: 'POST',
      headers: { Authorization: 'Bearer some-token-value' },
    });
    const expectedResponse = new Response('handler ran', { status: 200 });
    const next = makeNext(expectedResponse);

    const res = await callMiddleware(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    // Middleware mutates the response by adding security headers but doesn't
    // change status. 200 from the (mocked) route handler should pass through.
    expect(res.status).toBe(200);
  });

  it('does not gate non-internal endpoints', async () => {
    // The discovery defense applies ONLY to paths in INTERNAL_ENDPOINTS.
    // Public paths like `/hub/radar` must reach the route handler with no
    // Authorization header — gating them would break the website.
    const ctx = makeContext({ url: 'https://globalstrategic.tech/hub/radar', method: 'GET' });
    const next = makeNext();
    await onRequest(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not gate similar-but-different paths (no over-matching)', async () => {
    // The INTERNAL_ENDPOINTS check uses exact pathname match, not prefix.
    // A theoretical `/api/inoreader/refresh/something` or
    // `/api/inoreader/refresh-v2` would NOT inherit the gate.
    const ctx = makeContext({
      url: 'https://globalstrategic.tech/api/inoreader/refresh-different',
      method: 'GET',
    });
    const next = makeNext();
    await onRequest(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
