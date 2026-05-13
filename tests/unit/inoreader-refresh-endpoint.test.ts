/**
 * Unit tests for the BL-039 `/api/inoreader/refresh` endpoint.
 *
 * Verifies the auth gate and outcome→HTTP-status mapping. The actual
 * Inoreader OAuth refresh is mocked via `triggerInoreaderRefresh` — we
 * don't need to exercise the real OAuth flow here (that's covered by
 * `radar-client.test.ts`'s 401 retry tests on the client.ts side).
 *
 * The endpoint contract verified:
 *   - 503 endpoint-disabled when INOREADER_REFRESH_SECRET is not bound
 *   - 401 auth-missing when no Authorization header
 *   - 401 auth-mismatch when secret doesn't match (constant-time compare)
 *   - 200 ok:true on successful refresh
 *   - 502 inoreader-rejected on Inoreader refresh failure
 *   - 500 on config-missing / other refresh-helper failures
 *   - 500 internal-error if triggerInoreaderRefresh throws
 *   - 405 method-not-allowed on GET
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted state — these get lifted alongside the vi.mock factories so
// they're in scope when the factories run during module init. The mock
// modules expose getters that read from these refs, so we can mutate
// them per-test even though ESM exports are frozen.
const { secretRef, triggerSpy } = vi.hoisted(() => ({
  secretRef: { value: undefined as string | undefined },
  triggerSpy: vi.fn(),
}));

vi.mock('astro:env/server', () => ({
  get INOREADER_REFRESH_SECRET() {
    return secretRef.value;
  },
  // The endpoint only reads INOREADER_REFRESH_SECRET from astro:env/server.
  // Other env vars used inside triggerInoreaderRefresh are mocked away
  // by the client module mock below — the real ones never get read.
}));

vi.mock('@/lib/inoreader/client', () => ({
  triggerInoreaderRefresh: triggerSpy,
}));

vi.mock('@sentry/node', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

beforeEach(() => {
  triggerSpy.mockReset();
  // Default: secret IS bound. Tests that need it unset reassign to undefined.
  secretRef.value = 'test-shared-secret';
});

// Helpers --------------------------------------------------------------

/** Construct the Astro API-route context shape the endpoint expects. */
function makeContext(init: { headers?: Record<string, string>; method?: string } = {}) {
  return {
    request: new Request('https://globalstrategic.tech/api/inoreader/refresh', {
      method: init.method ?? 'POST',
      headers: init.headers ?? {},
    }),
    // The Astro APIContext has more fields; we only use `request`.
  } as unknown as Parameters<typeof import('@/pages/api/inoreader/refresh').POST>[0];
}

async function readJson(
  res: Response
): Promise<{ ok: boolean; reason?: string; message?: string }> {
  return res.json();
}

// Tests ----------------------------------------------------------------

describe('/api/inoreader/refresh — POST handler', () => {
  it('returns 503 endpoint-disabled when INOREADER_REFRESH_SECRET is unset', async () => {
    secretRef.value = undefined;

    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(makeContext({ headers: { Authorization: 'Bearer anything' } }));

    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('endpoint-disabled');
    // Refresh helper should not have been called.
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('returns 401 auth-missing when Authorization header is absent', async () => {
    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(makeContext({ headers: {} }));

    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.reason).toBe('auth-missing');
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('returns 401 auth-missing when Authorization is not Bearer-shaped', async () => {
    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(makeContext({ headers: { Authorization: 'Basic abc:def' } }));

    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.reason).toBe('auth-missing');
  });

  it('returns 401 auth-mismatch when Bearer token is wrong', async () => {
    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(makeContext({ headers: { Authorization: 'Bearer wrong-secret' } }));

    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.reason).toBe('auth-mismatch');
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('returns 401 auth-mismatch when Bearer token has the right prefix but wrong tail', async () => {
    // Confirms the constant-time compare doesn't short-circuit on prefix
    // match — the full string must match.
    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(
      makeContext({ headers: { Authorization: 'Bearer test-shared-secre' } }) // missing last char
    );

    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.reason).toBe('auth-mismatch');
  });

  it('returns 200 ok:true on successful refresh', async () => {
    triggerSpy.mockResolvedValue({ ok: true });

    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(
      makeContext({ headers: { Authorization: 'Bearer test-shared-secret' } })
    );

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 502 inoreader-rejected when Inoreader rejects the refresh exchange', async () => {
    triggerSpy.mockResolvedValue({
      ok: false,
      reason: 'inoreader-rejected',
      message: 'Inoreader rejected the refresh-token exchange.',
    });

    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(
      makeContext({ headers: { Authorization: 'Bearer test-shared-secret' } })
    );

    expect(res.status).toBe(502);
    const body = await readJson(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('inoreader-rejected');
  });

  it('returns 500 on config-missing failures (creds not configured on website)', async () => {
    triggerSpy.mockResolvedValue({
      ok: false,
      reason: 'config-missing',
      message: 'INOREADER_APP_ID not bound',
    });

    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(
      makeContext({ headers: { Authorization: 'Bearer test-shared-secret' } })
    );

    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.reason).toBe('config-missing');
  });

  it('returns 500 internal-error when triggerInoreaderRefresh throws', async () => {
    triggerSpy.mockRejectedValue(new Error('unexpected failure in refresh helper'));

    const { POST } = await import('@/pages/api/inoreader/refresh');
    const res = await POST(
      makeContext({ headers: { Authorization: 'Bearer test-shared-secret' } })
    );

    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.reason).toBe('internal-error');
    expect(body.message).toContain('unexpected failure');
  });
});

describe('/api/inoreader/refresh — GET handler (method gate)', () => {
  it('returns 405 method-not-allowed', async () => {
    const { GET } = await import('@/pages/api/inoreader/refresh');
    const res = await GET(makeContext({ method: 'GET' }));

    expect(res.status).toBe(405);
    const body = await readJson(res);
    expect(body.reason).toBe('method-not-allowed');
  });
});
