/**
 * BL-033 hardening AC — bearer token matching via constant-time comparison.
 *
 * Behavior under test: `authenticate()` matches tokens through the shared
 * `timingSafeEqual` XOR comparator (extracted to `auth/timing-safe-equal.ts`)
 * instead of plain `===`, closing the timing-oracle finding from the BL-032
 * soak (T.I.5). These specs pin the BEHAVIORAL contract around the swap —
 * match/mismatch outcomes, scope resolution, `_SCOPES` skip — for the token
 * shapes a timing attack exercises (near-miss prefixes, length mismatches).
 *
 * Deliberately NO wall-clock timing assertion: CI runner jitter dwarfs
 * nanosecond XOR differences, making such a test the flaky-test family this
 * repo bans. The constant-time property is structural (single XOR loop, no
 * data-dependent branch — covered by `tests/unit/admin/admin-auth.test.ts`'s
 * comparator specs); the BACKLOG.md BL-033 resolution line records this
 * substitution for the AC's literal "timing assertion" wording.
 */

import { describe, it, expect } from 'vitest';
import { authenticate } from '../../../src/auth/bearer';
import { DEFAULT_SCOPES } from '../../../src/auth/scopes';

function makeRequest(authHeader: string): Request {
  const headers = new Headers({ Authorization: authHeader });
  return new Request('https://example.test/mcp', { method: 'POST', headers });
}

describe('authenticate — constant-time token matching', () => {
  const env = { MCP_KEY_RP: 'aB3xK9-real-token-value' };

  it('authenticates the exact token with owner + default scopes intact', () => {
    const result = authenticate(makeRequest('Bearer aB3xK9-real-token-value'), env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keyOwner).toBe('RP');
    expect(result.scopes).toEqual(DEFAULT_SCOPES);
  });

  it('rejects a fully wrong token of the same length', () => {
    const result = authenticate(makeRequest('Bearer XXXXXX-fake-token-value'), env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-token');
  });

  it('rejects a near-miss token sharing a long prefix (the timing-attack shape)', () => {
    // Same length, differs only in the final character — the guess a
    // char-by-char oracle attack would converge on.
    const result = authenticate(makeRequest('Bearer aB3xK9-real-token-valuX'), env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-token');
  });

  it('rejects a token that is a strict prefix of the real one (length mismatch)', () => {
    const result = authenticate(makeRequest('Bearer aB3xK9-real-token'), env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-token');
  });

  it('rejects a token with the real one as a strict prefix (length mismatch)', () => {
    const result = authenticate(makeRequest('Bearer aB3xK9-real-token-value-extra'), env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-token');
  });

  it('still skips _SCOPES companion vars as candidate keys', () => {
    // Sending the JSON-encoded scope array as the bearer must NOT match
    // the `MCP_KEY_RP_SCOPES` binding (pre-existing guard, re-pinned here
    // because the comparator swap touches the same loop).
    const scopesJson = '["tool:portfolio:read"]';
    const envWithScopes = { ...env, MCP_KEY_RP_SCOPES: scopesJson };
    const result = authenticate(makeRequest(`Bearer ${scopesJson}`), envWithScopes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-token');
  });

  it('resolves a narrowed scope subset for a matched key (companion var honored)', () => {
    const envWithScopes = { ...env, MCP_KEY_RP_SCOPES: '["tool:portfolio:read"]' };
    const result = authenticate(makeRequest('Bearer aB3xK9-real-token-value'), envWithScopes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scopes).toEqual(['tool:portfolio:read']);
  });
});
