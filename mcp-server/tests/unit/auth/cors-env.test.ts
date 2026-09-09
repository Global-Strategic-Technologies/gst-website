/**
 * BL-155 Slice 2 — staging-only extra CORS origins for the trial endpoint.
 *
 * There is no other unit CORS file (`tests/integration/cors.test.ts` is
 * `unstable_dev`), so the production allowlist's byte-identical behaviour
 * is pinned here too.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/auth/safe-logger', () => ({ safeLog: vi.fn() }));

import {
  corsHeadersFor,
  corsHeadersForEnv,
  parseExtraOrigins,
  preflightResponse,
  withTrialCors,
} from '../../../src/auth/cors';
import { safeLog } from '../../../src/auth/safe-logger';

const staging = {
  ENV_NAME: 'staging',
  TRIAL_EXTRA_ORIGINS: 'http://localhost:4321, https://*-gst-team.vercel.app',
};

describe('parseExtraOrigins', () => {
  it('honours the list on staging only', () => {
    expect(parseExtraOrigins(staging)).toEqual({
      exact: new Set(['http://localhost:4321']),
      suffixes: ['-gst-team.vercel.app'],
    });
    expect(parseExtraOrigins({ ...staging, ENV_NAME: 'production' })).toEqual({
      exact: new Set(),
      suffixes: [],
    });
    expect(parseExtraOrigins({ TRIAL_EXTRA_ORIGINS: staging.TRIAL_EXTRA_ORIGINS })).toEqual({
      exact: new Set(),
      suffixes: [],
    });
  });

  it('rejects a bare *.vercel.app, a plain *, and non-origin junk — logged, never honoured', () => {
    vi.mocked(safeLog).mockClear();
    const parsed = parseExtraOrigins({
      ENV_NAME: 'staging',
      TRIAL_EXTRA_ORIGINS: 'https://*.vercel.app, *, https://ok.example, not-an-origin',
    });
    expect(parsed).toEqual({ exact: new Set(['https://ok.example']), suffixes: [] });
    expect(vi.mocked(safeLog)).toHaveBeenCalledTimes(3);
  });
});

describe('corsHeadersForEnv', () => {
  it('is byte-identical to corsHeadersFor for every production origin, in every env', () => {
    for (const origin of [
      'https://claude.ai',
      'https://chatgpt.com',
      'https://cursor.sh',
      'https://globalstrategic.tech',
      'https://www.globalstrategic.tech',
    ]) {
      expect(corsHeadersForEnv(origin, staging)).toEqual(corsHeadersFor(origin));
      expect(corsHeadersForEnv(origin, {})).toEqual(corsHeadersFor(origin));
    }
    expect(corsHeadersForEnv(null, staging)).toEqual({});
  });

  it('allows an exact extra origin and a one-label preview-suffix match on staging', () => {
    expect(corsHeadersForEnv('http://localhost:4321', staging)['Access-Control-Allow-Origin']).toBe(
      'http://localhost:4321'
    );
    const preview = 'https://gst-website-git-feat-x-gst-team.vercel.app';
    const headers = corsHeadersForEnv(preview, staging);
    expect(headers['Access-Control-Allow-Origin']).toBe(preview);
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('refuses look-alikes and everything on production', () => {
    for (const origin of [
      'https://evil-gst-team.vercel.app.attacker.example',
      'https://other-team.vercel.app',
      'http://gst-website-gst-team.vercel.app', // wrong scheme
      'https://-gst-team.vercel.app', // suffix alone
    ]) {
      expect(corsHeadersForEnv(origin, staging)).toEqual({ Vary: 'Origin' });
    }
    expect(
      corsHeadersForEnv('http://localhost:4321', { ...staging, ENV_NAME: 'production' })
    ).toEqual({
      Vary: 'Origin',
    });
  });

  it('never emits a wildcard', () => {
    const all = [
      corsHeadersForEnv('http://localhost:4321', staging),
      corsHeadersForEnv('https://x-gst-team.vercel.app', staging),
      corsHeadersForEnv('https://claude.ai', staging),
    ];
    for (const h of all) expect(h['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

describe('preflightResponse / withTrialCors', () => {
  it('preflight from an extra origin is a 204 with the allow headers on staging only', () => {
    const request = new Request('https://mcp.test/trial/signup', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:4321', 'Access-Control-Request-Method': 'POST' },
    });
    expect(preflightResponse(request, staging).headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:4321'
    );
    expect(preflightResponse(request).headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(preflightResponse(request).status).toBe(204);
  });

  it('withTrialCors wraps a response for an extra origin and leaves a disallowed one bare', () => {
    const wrapped = withTrialCors(
      new Response('x', { status: 503 }),
      'http://localhost:4321',
      staging
    );
    expect(wrapped.status).toBe(503);
    expect(wrapped.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4321');
    const bare = withTrialCors(new Response('x'), 'https://attacker.example', staging);
    expect(bare.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
