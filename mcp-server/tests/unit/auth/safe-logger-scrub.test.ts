/**
 * BL-047 T2 — URL query-param scrubber unit tests.
 *
 * The `/admin/inoreader/reauth/callback` URL carries `code` + `state`.
 * Logging it verbatim would leak both to Sentry breadcrumbs, Cloudflare
 * logs, and any future log sink. `scrubUrlForLog` masks the values
 * without removing the keys (so post-incident reading still sees the
 * params were present).
 */
import { describe, expect, it } from 'vitest';

import { scrubUrlForLog } from '../../../src/auth/safe-logger';

describe('scrubUrlForLog', () => {
  it('redacts code + state query params (the T2 callback URL shape)', () => {
    const input =
      'https://mcp.globalstrategic.tech/admin/inoreader/reauth/callback?code=abc123&state=xyz789';
    const out = scrubUrlForLog(input);
    expect(out).toContain('code=%5BREDACTED%5D'); // URL-encoded [REDACTED]
    expect(out).toContain('state=%5BREDACTED%5D');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('xyz789');
  });

  it('redacts access_token + refresh_token if present', () => {
    const input = 'https://x.example/anywhere?access_token=at123&refresh_token=rt456';
    const out = scrubUrlForLog(input);
    expect(out).not.toContain('at123');
    expect(out).not.toContain('rt456');
  });

  it('preserves the path + non-sensitive params', () => {
    const input = 'https://x.example/path?foo=bar&code=secret&baz=qux';
    const out = scrubUrlForLog(input);
    const parsed = new URL(out);
    expect(parsed.pathname).toBe('/path');
    expect(parsed.searchParams.get('foo')).toBe('bar');
    expect(parsed.searchParams.get('baz')).toBe('qux');
    expect(parsed.searchParams.get('code')).toBe('[REDACTED]');
  });

  it('returns the input unchanged when no sensitive params are present', () => {
    const input = 'https://x.example/health?foo=bar';
    expect(scrubUrlForLog(input)).toBe(input);
  });

  it('returns the input unchanged when not a valid URL (defensive)', () => {
    expect(scrubUrlForLog('not-a-url')).toBe('not-a-url');
    expect(scrubUrlForLog('')).toBe('');
  });
});
