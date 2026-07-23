/**
 * BL-047 T2 — admin auth helper unit tests.
 *
 * Pins: timing-safe equality contract, env-bound key validation,
 * cookie minting + parsing, nonce shape.
 */
import { describe, expect, it } from 'vitest';

import {
  buildSessionClearCookie,
  buildSessionCookie,
  mintNonce,
  readSessionCookie,
  validateAdminKey,
} from '../../../src/admin/admin-auth';
import { timingSafeEqual } from '../../../src/auth/timing-safe-equal';

describe('timingSafeEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqual('hello', 'hello')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(timingSafeEqual('hello', 'world')).toBe(false);
    expect(timingSafeEqual('aaaa', 'aaab')).toBe(false);
  });

  it('returns false for different lengths (no timing leak via early exit)', () => {
    expect(timingSafeEqual('a', 'ab')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('validateAdminKey', () => {
  it('returns false when MCP_ADMIN_KEY env var is unbound', () => {
    expect(validateAdminKey('whatever', {})).toBe(false);
  });

  it('returns true when provided key matches env exactly', () => {
    expect(validateAdminKey('secret123', { MCP_ADMIN_KEY: 'secret123' })).toBe(true);
  });

  it('returns false on mismatch even when env is set', () => {
    expect(validateAdminKey('wrong', { MCP_ADMIN_KEY: 'right' })).toBe(false);
  });

  it('returns false for empty submitted key against any env (defensive)', () => {
    expect(validateAdminKey('', { MCP_ADMIN_KEY: 'secret' })).toBe(false);
  });
});

describe('buildSessionCookie', () => {
  it('includes the nonce + HttpOnly + Secure + SameSite=Lax + Path scope + Max-Age=300', () => {
    const cookie = buildSessionCookie('abc123');
    expect(cookie).toContain('mcp_reauth_session=abc123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/admin/inoreader/reauth/');
    expect(cookie).toContain('Max-Age=300');
  });
});

describe('buildSessionClearCookie', () => {
  it('emits Max-Age=0 with the same scope so the browser drops the cookie', () => {
    const clear = buildSessionClearCookie();
    expect(clear).toContain('mcp_reauth_session=');
    expect(clear).toContain('Max-Age=0');
    expect(clear).toContain('Path=/admin/inoreader/reauth/');
  });
});

describe('readSessionCookie', () => {
  function reqWithCookie(cookieHeader: string): Request {
    return new Request('https://x.example/admin/inoreader/reauth/callback', {
      headers: { Cookie: cookieHeader },
    });
  }

  it('returns null when Cookie header is missing', () => {
    const req = new Request('https://x.example/admin/inoreader/reauth/callback');
    expect(readSessionCookie(req)).toBeNull();
  });

  it('reads the nonce when the cookie is the only one', () => {
    expect(readSessionCookie(reqWithCookie('mcp_reauth_session=abc123def456'))).toBe(
      'abc123def456'
    );
  });

  it('reads the nonce among other cookies', () => {
    expect(
      readSessionCookie(reqWithCookie('other=value; mcp_reauth_session=cafebabe; foo=bar'))
    ).toBe('cafebabe');
  });

  it('returns null when the cookie value is non-hex (defends against tampered values)', () => {
    expect(readSessionCookie(reqWithCookie('mcp_reauth_session=not-hex!'))).toBeNull();
  });

  it('returns null when the named cookie is absent', () => {
    expect(readSessionCookie(reqWithCookie('other=value'))).toBeNull();
  });
});

describe('mintNonce', () => {
  it('returns a 32-char lowercase hex string (UUID without dashes)', () => {
    const nonce = mintNonce();
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces different nonces across calls (entropy sanity)', () => {
    const samples = new Set<string>();
    for (let i = 0; i < 50; i++) samples.add(mintNonce());
    expect(samples.size).toBe(50);
  });
});
