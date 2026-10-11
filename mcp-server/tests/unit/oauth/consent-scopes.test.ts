/**
 * BL-033 Slice 2 — unit tests for the consent flow's pure pieces:
 * scope intersection (delegation ceiling), keyOwner conventions, and
 * the RFC 9728-aware 401 challenge builder.
 */

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

  it('a tool:* ceiling asking for tool:radar:* is not granted it (BL-166)', () => {
    // Pre-BL-166 prefix matching let exactly this escalate — including trials.
    expect(grantedScopesFor(['tool:radar:*'], ['tool:*', 'prompt:*'])).toEqual([]);
    expect(grantedScopesFor(['tool:*', 'tool:radar:*'], ['tool:*'])).toEqual(['tool:*']);
  });

  it('a key holding tool:radar:* can delegate it', () => {
    expect(grantedScopesFor(['tool:radar:*'], DEFAULT_SCOPES)).toEqual(['tool:radar:*']);
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

  const PRM = 'https://mcp.test/.well-known/oauth-protected-resource/mcp';

  it('token-present failure advertises resource_metadata + invalid_token', () => {
    const resp = authFailureResponse(failureFor('Bearer wrong-token'), PRM);
    expect(resp.headers.get('WWW-Authenticate')).toBe(
      `Bearer realm="gst-mcp", error="invalid_token", resource_metadata="${PRM}"`
    );
    expect(resp.status).toBe(401);
  });

  it('a missing bearer gets the pointer without an error code (ADR-0044)', () => {
    // First contact carries no bearer; nothing is "invalid", but the client
    // still needs to be told where the metadata document is.
    const resp = authFailureResponse(failureFor(null), PRM);
    expect(resp.headers.get('WWW-Authenticate')).toBe(
      `Bearer realm="gst-mcp", resource_metadata="${PRM}"`
    );
  });

  it('without a metadata URL the challenge is bare (non-OAuth routes and origins)', () => {
    for (const header of ['Bearer wrong-token', null]) {
      const resp = authFailureResponse(failureFor(header));
      expect(resp.headers.get('WWW-Authenticate')).toBe('Bearer realm="gst-mcp"');
    }
  });

  it('the JSON body contract is unchanged in all shapes', async () => {
    const resp = authFailureResponse(failureFor('Bearer wrong-token'), PRM);
    expect(await resp.json()).toEqual({
      error: 'unauthorized',
      message: 'Invalid Bearer token',
    });
  });
});

describe('SCOPE_DESCRIPTIONS consent copy', () => {
  it('covers every catalog scope, the radar tool wildcard included', () => {
    for (const scope of Object.values(SCOPES)) {
      expect(SCOPE_DESCRIPTIONS[scope]).toBeTruthy();
    }
    expect(SCOPE_DESCRIPTIONS['tool:radar:*']).toBeTruthy();
  });

  it('tells the consenting user that tool:* excludes Radar (BL-166)', () => {
    expect(SCOPE_DESCRIPTIONS['tool:*']).toMatch(/excluding Radar/);
  });
});
