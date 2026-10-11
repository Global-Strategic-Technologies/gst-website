/**
 * ADR-0044 — the public origin is configuration, matched exactly.
 */

import { isCanonicalOrigin, publicOrigin } from '../../../src/oauth/public-origin';

const env = { PUBLIC_ORIGIN: 'https://mcp.test' };

describe('publicOrigin', () => {
  it('returns the configured origin', () => {
    expect(publicOrigin(env)).toBe('https://mcp.test');
  });

  it('is null when unbound or empty', () => {
    expect(publicOrigin({})).toBeNull();
    expect(publicOrigin({ PUBLIC_ORIGIN: '' })).toBeNull();
  });
});

describe('isCanonicalOrigin', () => {
  it('accepts a request on the configured origin, any path', () => {
    expect(isCanonicalOrigin(new URL('https://mcp.test/mcp'), env)).toBe(true);
    expect(isCanonicalOrigin(new URL('https://mcp.test/token?x=1'), env)).toBe(true);
  });

  it.each([
    ['alias hostname', 'https://status.mcp.test/mcp'],
    ['parent domain', 'https://test/mcp'],
    ['cleartext scheme', 'http://mcp.test/mcp'],
    ['other port', 'https://mcp.test:8443/mcp'],
  ])('refuses %s', (_label, url) => {
    expect(isCanonicalOrigin(new URL(url), env)).toBe(false);
  });

  it('refuses everything when the origin is unbound (fail closed)', () => {
    expect(isCanonicalOrigin(new URL('https://mcp.test/mcp'), {})).toBe(false);
    expect(isCanonicalOrigin(new URL('http://localhost:8787/mcp'), {})).toBe(false);
  });

  it('matches a loopback origin exactly, port included (wrangler dev)', () => {
    const local = { PUBLIC_ORIGIN: 'http://localhost:8787' };
    expect(isCanonicalOrigin(new URL('http://localhost:8787/mcp'), local)).toBe(true);
    expect(isCanonicalOrigin(new URL('http://127.0.0.1:8787/mcp'), local)).toBe(false);
  });
});
