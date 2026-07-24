/**
 * BL-033 Slice 2 — unit tests for the consent flow's pure pieces:
 * scope intersection (delegation ceiling), keyOwner conventions, and
 * the RFC 9728-aware 401 challenge builder.
 */

import { describe, it, expect } from 'vitest';
import { grantedScopesFor } from '../../../src/oauth/consent';
import { m2mKeyOwner, oauthKeyOwner } from '../../../src/oauth/key-owner';
import { authenticate, authFailureResponse } from '../../../src/auth/bearer';
import { DEFAULT_SCOPES, SCOPE_DESCRIPTIONS, SCOPES } from '../../../src/auth/scopes';

describe('grantedScopesFor (delegation ceiling)', () => {
  const keyScopes = DEFAULT_SCOPES;

  it('empty request grants the full key scope set', () => {
    expect(grantedScopesFor([], keyScopes)).toEqual([...keyScopes]);
  });

  it('specific tool request passes through a tool:* key (wildcard-aware)', () => {
    expect(grantedScopesFor(['tool:search_portfolio'], keyScopes)).toEqual([
      'tool:search_portfolio',
    ]);
  });

  it('scopes outside the key ceiling are dropped, not granted', () => {
    const narrowKey = ['resource:radar:read'];
    expect(grantedScopesFor(['resource:radar:read', 'tool:search_portfolio'], narrowKey)).toEqual([
      'resource:radar:read',
    ]);
  });

  it('returns empty when nothing requested is covered (caller renders 403)', () => {
    expect(grantedScopesFor(['tool:search_portfolio'], ['resource:radar:read'])).toEqual([]);
  });

  it('never mutates inputs', () => {
    const requested = ['tool:*'];
    const owned = [...DEFAULT_SCOPES];
    grantedScopesFor(requested, owned);
    expect(requested).toEqual(['tool:*']);
    expect(owned).toEqual([...DEFAULT_SCOPES]);
  });
});

describe('keyOwner conventions (bounded AE cardinality)', () => {
  it('auth-code grants map to OAUTH:<userId>', () => {
    expect(oauthKeyOwner('RP')).toBe('OAUTH:RP');
  });

  it('M2M clients map to normalized M2M:<NAME>', () => {
    expect(m2mKeyOwner('acme-pipeline')).toBe('M2M:ACME-PIPELINE');
    expect(m2mKeyOwner('Acme Pipeline (prod)')).toBe('M2M:ACME_PIPELINE_PROD_');
  });
});

describe('authFailureResponse — RFC 9728 challenge', () => {
  const env = { MCP_KEY_RP: 'good-token' };

  function failureFor(header: string | null) {
    const headers = new Headers();
    if (header !== null) headers.set('Authorization', header);
    const result = authenticate(
      new Request('https://mcp.test/mcp', { method: 'POST', headers }),
      env
    );
    if (result.ok) throw new Error('expected failure');
    return result;
  }

  it('token-present failure with origin advertises resource_metadata + invalid_token', () => {
    const resp = authFailureResponse(failureFor('Bearer wrong-token'), 'https://mcp.test');
    const challenge = resp.headers.get('WWW-Authenticate') ?? '';
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain(
      'resource_metadata="https://mcp.test/.well-known/oauth-protected-resource"'
    );
    expect(resp.status).toBe(401);
  });

  it('probe-class failures keep the bare challenge (no discovery bytes for scanners)', () => {
    const resp = authFailureResponse(failureFor(null), 'https://mcp.test');
    const challenge = resp.headers.get('WWW-Authenticate') ?? '';
    expect(challenge).toBe('Bearer realm="gst-mcp"');
  });

  it('without an origin the legacy header shape is unchanged (existing callers)', () => {
    const resp = authFailureResponse(failureFor('Bearer wrong-token'));
    expect(resp.headers.get('WWW-Authenticate')).toBe('Bearer realm="gst-mcp"');
  });

  it('the JSON body contract is unchanged in all shapes', async () => {
    const resp = authFailureResponse(failureFor('Bearer wrong-token'), 'https://mcp.test');
    expect(await resp.json()).toEqual({
      error: 'unauthorized',
      message: 'Invalid Bearer token',
    });
  });
});

describe('SCOPE_DESCRIPTIONS consent copy', () => {
  it('covers every catalog scope plus the radar narrowing wildcard', () => {
    for (const scope of Object.values(SCOPES)) {
      expect(SCOPE_DESCRIPTIONS[scope]).toBeTruthy();
    }
    expect(SCOPE_DESCRIPTIONS['tool:radar:*']).toBeTruthy();
  });
});
