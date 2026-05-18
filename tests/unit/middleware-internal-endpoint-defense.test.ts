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
 *
 * Test setup conventions (per repo rubric):
 *   - `vi` is the only Vitest symbol explicitly imported; `describe` /
 *     `it` / `expect` come from globals (`vitest.config.ts` sets
 *     `globals: true`). Importing them explicitly silently shadows
 *     the globals in Vitest 4.x — see TEST_BEST_PRACTICES § anti-pattern #9.
 *   - The synthetic context covers only `url` + `request` (the two
 *     fields the current middleware touches). If `onRequest` grows to
 *     read `context.cookies` / `context.locals` / `context.params` /
 *     `context.redirect`, extend `makeContext()` accordingly — a hot
 *     `undefined` access from a test stub silently crashes in real
 *     Astro and surfaces as a hard-to-debug E2E failure.
 */

import { vi } from 'vitest';
import { onRequest } from '@/middleware';
import type { APIContext, MiddlewareNext } from 'astro';

/** Test-only origin — used to make "this is a fixture" intent explicit. */
const TEST_ORIGIN = 'http://localhost';

function makeContext(opts: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
}): APIContext {
  const url = new URL(opts.path, TEST_ORIGIN);
  const headers = new Headers(opts.headers ?? {});
  const request = new Request(url, { method: opts.method ?? 'GET', headers });
  // Cast scoped to (url, request) — the only fields onRequest reads today.
  // See module-top JSDoc for the extension contract.
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
  // ---------------------------------------------------------------------
  // Probe-class requests (no usable bearer) MUST short-circuit to 404
  // BEFORE the route handler runs. Every test in this block asserts both:
  //   - status === 404 (response shape)
  //   - next not called (the load-bearing "route handler didn't run"
  //     invariant — a regression that 404s but still invokes next would
  //     defeat the discovery defense)
  // ---------------------------------------------------------------------

  it('rejects anonymous GET as 404 without invoking the route handler', async () => {
    const next = makeNext();
    const res = await callMiddleware(
      makeContext({ path: '/api/inoreader/refresh', method: 'GET' }),
      next
    );

    expect(res.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects anonymous POST as 404 without invoking the route handler', async () => {
    const next = makeNext();
    const res = await callMiddleware(
      makeContext({ path: '/api/inoreader/refresh', method: 'POST' }),
      next
    );

    expect(res.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects non-Bearer schemes (e.g. Basic) as 404 without invoking the route handler', async () => {
    const next = makeNext();
    const res = await callMiddleware(
      makeContext({
        path: '/api/inoreader/refresh',
        method: 'POST',
        headers: { Authorization: 'Basic c29tZTpjcmVk' },
      }),
      next
    );

    expect(res.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects empty/whitespace-only Bearer tokens as 404 without invoking the route handler', async () => {
    const next = makeNext();
    const res = await callMiddleware(
      makeContext({
        path: '/api/inoreader/refresh',
        method: 'POST',
        headers: { Authorization: 'Bearer    ' },
      }),
      next
    );

    expect(res.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Authenticated requests pass through to the route handler. The
  // middleware doesn't validate the bearer VALUE (that's the route
  // handler's job — bearer-present-but-wrong → 401 + Sentry); it only
  // filters fully anonymous probes.
  // ---------------------------------------------------------------------

  it('passes Bearer-present requests through, applies security headers', async () => {
    const handlerResponse = new Response('handler ran', { status: 200 });
    const next = makeNext(handlerResponse);

    const res = await callMiddleware(
      makeContext({
        path: '/api/inoreader/refresh',
        method: 'POST',
        headers: { Authorization: 'Bearer some-token-value' },
      }),
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    // The security-header layer applies to passthrough responses too —
    // any future refactor that bypasses that layer for the
    // discovery-defense-allowed branch should fail here.
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
  });

  // ---------------------------------------------------------------------
  // Boundary cases — the defense applies to EXACT pathname matches,
  // nothing more. These tests pin the boundary so a future refactor
  // (e.g. switching to `startsWith()` for a path family) fails loud.
  // ---------------------------------------------------------------------

  it('does not gate public paths (e.g. /hub/radar)', async () => {
    const next = makeNext();
    await callMiddleware(makeContext({ path: '/hub/radar', method: 'GET' }), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not over-match adjacent suffixes (refresh-different)', async () => {
    // A theoretical `/api/inoreader/refresh-v2` or `/api/inoreader/refresh-different`
    // is NOT in INTERNAL_ENDPOINTS, and the exact-match check must NOT inherit.
    const next = makeNext();
    await callMiddleware(
      makeContext({ path: '/api/inoreader/refresh-different', method: 'GET' }),
      next
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not over-match prefix children (refresh/sub)', async () => {
    // A theoretical `/api/inoreader/refresh/sub` is a true prefix collision.
    // If someone refactors `INTERNAL_ENDPOINTS.has(p)` into a prefix check,
    // this test would start failing — that's the regression net.
    const next = makeNext();
    await callMiddleware(makeContext({ path: '/api/inoreader/refresh/sub', method: 'GET' }), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
