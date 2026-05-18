/**
 * Unit tests for the BL-032.8 Phase 2 bearer-scope-subset extension.
 *
 * Convention: an optional companion env var `MCP_KEY_<OWNER>_SCOPES`
 * (JSON-encoded string array) narrows the scope set carried by
 * `MCP_KEY_<OWNER>`. Absent → DEFAULT_SCOPES. Malformed → auth fails
 * loud with a clear message.
 *
 * This is the auth foundation for the BL-032.8 Phase 3 narrow-scope
 * `MCP_KEY_WEBSITE_RADAR` bearer (carries only `resource:radar:read`).
 *
 * See [`bearer-scopes.test.ts`](./bearer-scopes.test.ts) for the
 * BL-032.5 Phase 2 DEFAULT_SCOPES baseline. These tests don't duplicate
 * that coverage — they only add the Phase 2 narrowing behavior.
 */

import { describe, it, expect } from 'vitest';
import { authenticate } from '../../../src/auth/bearer';
import { DEFAULT_SCOPES } from '../../../src/auth/scopes';

function makeRequest(token: string): Request {
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  return new Request('https://example.test/mcp', { method: 'POST', headers });
}

describe('authenticate — per-key scope subset (BL-032.8 Phase 2)', () => {
  it('narrows scopes to the JSON-encoded array when MCP_KEY_<OWNER>_SCOPES is bound', () => {
    const env = {
      MCP_KEY_WEBSITE_RADAR: 'website-token',
      MCP_KEY_WEBSITE_RADAR_SCOPES: '["resource:radar:read"]',
    };

    const result = authenticate(makeRequest('website-token'), env);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keyOwner).toBe('WEBSITE_RADAR');
    expect(result.scopes).toEqual(['resource:radar:read']);
    // Should NOT include any DEFAULT_SCOPES values that aren't in the subset.
    expect(result.scopes).not.toContain('tool:*');
    expect(result.scopes).not.toContain('prompt:*');
  });

  it('falls back to DEFAULT_SCOPES when no _SCOPES companion var is set', () => {
    const env = { MCP_KEY_RP: 'rp-token' }; // no MCP_KEY_RP_SCOPES

    const result = authenticate(makeRequest('rp-token'), env);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scopes).toBe(DEFAULT_SCOPES);
  });

  it('supports multi-element scope arrays', () => {
    const env = {
      MCP_KEY_PILOT: 'pilot-token',
      MCP_KEY_PILOT_SCOPES: '["tool:search_portfolio", "resource:radar:read"]',
    };

    const result = authenticate(makeRequest('pilot-token'), env);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scopes).toEqual(['tool:search_portfolio', 'resource:radar:read']);
  });

  it('rejects auth (loud failure) when _SCOPES is malformed JSON', () => {
    const env = {
      MCP_KEY_BROKEN: 'broken-token',
      MCP_KEY_BROKEN_SCOPES: 'not-valid-json',
    };

    const result = authenticate(makeRequest('broken-token'), env);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The operator-visible message should name the key (owner suffix
    // stripped of the MCP_KEY_ prefix) so operators can find and fix the
    // broken secret quickly.
    expect(result.bodyText).toMatch(/key BROKEN.*malformed.*_SCOPES/i);
  });

  it('rejects auth when _SCOPES is JSON but not an array', () => {
    const env = {
      MCP_KEY_BROKEN: 'broken-token',
      // Single string — needs to be an array
      MCP_KEY_BROKEN_SCOPES: '"resource:radar:read"',
    };

    const result = authenticate(makeRequest('broken-token'), env);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.bodyText).toMatch(/array/i);
  });

  it('rejects auth when _SCOPES array contains non-string elements', () => {
    const env = {
      MCP_KEY_BROKEN: 'broken-token',
      MCP_KEY_BROKEN_SCOPES: '["resource:radar:read", 42]',
    };

    const result = authenticate(makeRequest('broken-token'), env);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.bodyText).toMatch(/non-empty strings/i);
  });

  it('rejects auth when _SCOPES array contains empty-string elements', () => {
    const env = {
      MCP_KEY_BROKEN: 'broken-token',
      MCP_KEY_BROKEN_SCOPES: '["resource:radar:read", ""]',
    };

    const result = authenticate(makeRequest('broken-token'), env);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.bodyText).toMatch(/non-empty strings/i);
  });

  it('treats _SCOPES env vars as NON-bearer-tokens (cannot authenticate by sending the JSON)', () => {
    // Security boundary: a caller who somehow learns the JSON value of
    // MCP_KEY_RP_SCOPES (e.g. from a stack trace or log leak) must NOT be
    // able to authenticate by sending that JSON as a bearer token. Only
    // the actual MCP_KEY_RP value should match.
    const env = {
      MCP_KEY_RP: 'real-bearer-token',
      MCP_KEY_RP_SCOPES: '["tool:search_portfolio"]',
    };

    const result = authenticate(makeRequest('["tool:search_portfolio"]'), env);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Pin the rejection reason — without this, a future refactor that ever
    // produces `ok: false` for an unrelated reason (e.g. a parse error on the
    // _SCOPES value somehow matching the bearer scan) could silently mask the
    // security invariant. The expected failure is "Invalid Bearer token"
    // (token didn't match any MCP_KEY_*), NOT a malformed-JSON message.
    expect(result.bodyText).toMatch(/Invalid Bearer token/i);
    expect(result.bodyText).not.toMatch(/malformed/i);
  });

  it('supports the empty-array scope set (key authenticates but has zero capabilities)', () => {
    // Degenerate case: an audit-only key that can connect but call nothing.
    // Useful for "this key is alive" probes that shouldn't get capability
    // exposure. Auth must succeed; downstream `assertScope` calls all 403.
    const env = {
      MCP_KEY_AUDIT: 'audit-token',
      MCP_KEY_AUDIT_SCOPES: '[]',
    };

    const result = authenticate(makeRequest('audit-token'), env);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scopes).toEqual([]);
  });
});
