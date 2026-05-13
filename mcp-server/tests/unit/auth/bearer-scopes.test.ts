/**
 * Unit test for the BL-032.5 Phase 2 extension to `AuthSuccess`: a
 * successfully-authenticated request must carry the `DEFAULT_SCOPES`
 * set on its result. This is the integration boundary between
 * `bearer.ts` and `scopes.ts` — every other scope-gated handler trusts
 * that `auth.scopes` is populated on success.
 *
 * The full bearer-auth behavior (401 shapes, header-scheme parsing,
 * empty-token routing) is covered by the integration tests at
 * `tests/integration/auth.test.ts`. This file only asserts the new
 * scopes field is on the success envelope.
 */

import { describe, it, expect } from 'vitest';
import { authenticate } from '../../../src/auth/bearer';
import { DEFAULT_SCOPES } from '../../../src/auth/scopes';

function makeRequest(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader !== null) headers.set('Authorization', authHeader);
  return new Request('https://example.test/mcp', { method: 'POST', headers });
}

describe('authenticate — AuthSuccess.scopes', () => {
  it('carries DEFAULT_SCOPES on a valid bearer token', () => {
    const env = { MCP_KEY_RP: 'good-token' };
    const result = authenticate(makeRequest('Bearer good-token'), env);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyOwner).toBe('RP');
      expect(result.scopes).toBe(DEFAULT_SCOPES);
      expect(result.scopes).toEqual(DEFAULT_SCOPES);
    }
  });

  it('every wrangler-issued key gets the same default scope set', () => {
    const env = {
      MCP_KEY_RP: 'token-rp',
      MCP_KEY_AB: 'token-ab',
    };
    const a = authenticate(makeRequest('Bearer token-rp'), env);
    const b = authenticate(makeRequest('Bearer token-ab'), env);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.scopes).toBe(b.scopes);
      expect(a.scopes).toBe(DEFAULT_SCOPES);
    }
  });

  it('failed auth does not produce a scopes field at all', () => {
    const env = { MCP_KEY_RP: 'good-token' };
    const result = authenticate(makeRequest('Bearer wrong-token'), env);
    expect(result.ok).toBe(false);
    // AuthFailure has no `scopes` field — the type system guarantees this.
    // The runtime check below is the regression net.
    expect((result as unknown as { scopes?: unknown }).scopes).toBeUndefined();
  });
});
