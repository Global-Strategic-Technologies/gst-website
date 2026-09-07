/**
 * BL-155 Slice 2 — Turnstile siteverify, hardened.
 *
 * A verifier that only checks `success` accepts tokens minted for another
 * site or another action, and a verifier without a timeout blocks forever
 * on a stalled upstream. Each of those is a named case below.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hostnameAllowed,
  parseHostnames,
  verifyTurnstile,
  SITEVERIFY_URL,
  TURNSTILE_ACTION,
} from '../../../src/trial/turnstile';

const fetchSpy = vi.fn();
const base = {
  secret: 'sk',
  token: 'tok',
  remoteIp: '203.0.113.7',
  expectedHostnames: ['globalstrategic.tech', '.vercel.app'],
};
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('verifyTurnstile', () => {
  it('posts secret, response and remoteip to siteverify and accepts a matching success', async () => {
    fetchSpy.mockResolvedValue(
      ok({
        success: true,
        hostname: 'globalstrategic.tech',
        action: TURNSTILE_ACTION,
        'error-codes': [],
      })
    );
    expect(await verifyTurnstile(base)).toEqual({ ok: true });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(SITEVERIFY_URL);
    const sent = new URLSearchParams(init.body as string);
    expect(sent.get('secret')).toBe('sk');
    expect(sent.get('response')).toBe('tok');
    expect(sent.get('remoteip')).toBe('203.0.113.7');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(['timeout-or-duplicate', 'invalid-input-response'])(
    '%s is a rejection the visitor can retry',
    async (code) => {
      fetchSpy.mockResolvedValue(ok({ success: false, 'error-codes': [code] }));
      expect(await verifyTurnstile(base)).toMatchObject({
        ok: false,
        kind: 'rejected',
        retryable: true,
      });
    }
  );

  it('a config-class error code is a non-retryable rejection', async () => {
    fetchSpy.mockResolvedValue(ok({ success: false, 'error-codes': ['invalid-input-secret'] }));
    expect(await verifyTurnstile(base)).toMatchObject({
      ok: false,
      kind: 'rejected',
      retryable: false,
    });
  });

  it('refuses a successful token minted on another hostname', async () => {
    fetchSpy.mockResolvedValue(
      ok({
        success: true,
        hostname: 'attacker.example',
        action: TURNSTILE_ACTION,
        'error-codes': [],
      })
    );
    expect(await verifyTurnstile(base)).toMatchObject({
      ok: false,
      kind: 'rejected',
      retryable: false,
      reason: 'hostname-mismatch',
    });
  });

  it('refuses a successful token minted under another action', async () => {
    fetchSpy.mockResolvedValue(
      ok({ success: true, hostname: 'globalstrategic.tech', action: 'login', 'error-codes': [] })
    );
    expect(await verifyTurnstile(base)).toMatchObject({ ok: false, reason: 'action-mismatch' });
  });

  it.each([
    ['internal-error', () => ok({ success: false, 'error-codes': ['internal-error'] })],
    ['a 5xx', () => ok({}, 502)],
    ['non-JSON', () => new Response('<html>', { status: 200 })],
  ])('%s is unavailable, never a rejection', async (_label, make) => {
    fetchSpy.mockResolvedValue(make());
    expect(await verifyTurnstile(base)).toMatchObject({ ok: false, kind: 'unavailable' });
  });

  it('a fetch that throws is unavailable', async () => {
    fetchSpy.mockRejectedValue(new TypeError('network down'));
    expect(await verifyTurnstile(base)).toMatchObject({ ok: false, kind: 'unavailable' });
  });

  it('a fetch that never resolves is unavailable once the timeout fires (the hang case)', async () => {
    vi.useFakeTimers();
    // Honour the abort signal the way a real fetch would.
    fetchSpy.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        })
    );
    const pending = verifyTurnstile({ ...base, timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toMatchObject({ ok: false, kind: 'unavailable' });
  });
});

describe('hostname helpers', () => {
  it('parseHostnames trims, lower-cases and drops empties', () => {
    expect(parseHostnames(' A.com, ,b.com,')).toEqual(['a.com', 'b.com']);
    expect(parseHostnames(undefined)).toEqual([]);
  });

  it('hostnameAllowed: exact match, or suffix when the entry starts with a dot', () => {
    const expected = ['globalstrategic.tech', '.vercel.app'];
    expect(hostnameAllowed('globalstrategic.tech', expected)).toBe(true);
    expect(hostnameAllowed('GLOBALSTRATEGIC.TECH', expected)).toBe(true);
    expect(hostnameAllowed('gst-abc-team.vercel.app', expected)).toBe(true);
    expect(hostnameAllowed('vercel.app', expected)).toBe(false);
    expect(hostnameAllowed('evilglobalstrategic.tech', expected)).toBe(false);
    expect(hostnameAllowed('globalstrategic.tech.attacker.example', expected)).toBe(false);
  });
});
