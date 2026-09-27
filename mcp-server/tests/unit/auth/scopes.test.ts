/**
 * Unit tests for the BL-032.5 Phase 2 scope catalog: `hasScope`,
 * `assertScope`, `MissingScopeError`, and the `DEFAULT_SCOPES` shape.
 */

import {
  SCOPES,
  DEFAULT_SCOPES,
  SCOPES_SUPPORTED,
  SCOPE_MODEL,
  TRIAL_SCOPES,
  effectiveScopes,
  hasScope,
  assertScope,
  MissingScopeError,
} from '../../../src/auth/scopes';

describe('TRIAL_SCOPES (BL-155)', () => {
  it('is DEFAULT_SCOPES with every radar scope removed, and nothing else', () => {
    expect(TRIAL_SCOPES.some((s) => s.includes('radar'))).toBe(false);
    expect(TRIAL_SCOPES.every((s) => DEFAULT_SCOPES.includes(s))).toBe(true);
    // BL-166: both radar scopes — the Resource and the tools' own wildcard.
    expect(TRIAL_SCOPES).toEqual(
      DEFAULT_SCOPES.filter((s) => s !== SCOPES.RESOURCE_RADAR_READ && s !== SCOPES.TOOL_RADAR_ALL)
    );
    expect(TRIAL_SCOPES).toContain(SCOPES.PROMPT_ALL);
  });

  it('keeps its pre-BL-166 contents (the radar exclusion changed mechanism, not membership)', () => {
    expect([...TRIAL_SCOPES]).toEqual([
      'tool:*',
      'resource:library:read',
      'resource:regulations:read',
      'prompt:*',
    ]);
  });

  it('really withholds the radar tools now that tool:* stops at the radar namespace', () => {
    expect(hasScope(TRIAL_SCOPES, 'tool:radar:search_radar')).toBe(false);
    expect(hasScope(TRIAL_SCOPES, 'tool:search_portfolio')).toBe(true);
  });
});

describe('SCOPES catalog', () => {
  it('exposes stable scope strings — none change without an explicit refactor', () => {
    expect(SCOPES.RESOURCE_LIBRARY_READ).toBe('resource:library:read');
    expect(SCOPES.RESOURCE_REGULATIONS_READ).toBe('resource:regulations:read');
    expect(SCOPES.RESOURCE_RADAR_READ).toBe('resource:radar:read');
    expect(SCOPES.TOOL_ALL).toBe('tool:*');
    expect(SCOPES.PROMPT_ALL).toBe('prompt:*');
    expect(SCOPES.TOOL_RADAR_ALL).toBe('tool:radar:*');
  });
});

describe('SCOPES_SUPPORTED (BL-166)', () => {
  it('has the same members in the same order as before — radar just moved into DEFAULT_SCOPES', () => {
    expect([...SCOPES_SUPPORTED]).toEqual([...DEFAULT_SCOPES]);
    expect([...SCOPES_SUPPORTED]).toEqual([
      'tool:*',
      'resource:library:read',
      'resource:regulations:read',
      'resource:radar:read',
      'prompt:*',
      'tool:radar:*',
    ]);
  });
});

describe('DEFAULT_SCOPES', () => {
  it('grants every Tool, every Prompt, and all three Resource families', () => {
    expect(DEFAULT_SCOPES).toContain(SCOPES.TOOL_ALL);
    expect(DEFAULT_SCOPES).toContain(SCOPES.PROMPT_ALL);
    expect(DEFAULT_SCOPES).toContain(SCOPES.RESOURCE_LIBRARY_READ);
    expect(DEFAULT_SCOPES).toContain(SCOPES.RESOURCE_REGULATIONS_READ);
    expect(DEFAULT_SCOPES).toContain(SCOPES.RESOURCE_RADAR_READ);
  });

  it('carries the radar tools explicitly, so roster keys and the probe keep radar (BL-166)', () => {
    expect(DEFAULT_SCOPES).toContain(SCOPES.TOOL_RADAR_ALL);
  });

  it('is frozen so callers cannot accidentally mutate the global default', () => {
    expect(Object.isFrozen(DEFAULT_SCOPES)).toBe(true);
  });
});

describe('hasScope — exact match', () => {
  it('returns true when the required scope is literally present', () => {
    expect(hasScope(['resource:library:read'], 'resource:library:read')).toBe(true);
  });

  it('returns false when the required scope is not present', () => {
    expect(hasScope(['resource:library:read'], 'resource:radar:read')).toBe(false);
  });

  it('returns false on an empty owned set', () => {
    expect(hasScope([], 'tool:foo')).toBe(false);
  });
});

describe('hasScope — single-level wildcard', () => {
  it('grants `tool:*` for any `tool:<name>` request', () => {
    expect(hasScope(['tool:*'], 'tool:search_portfolio')).toBe(true);
    expect(hasScope(['tool:*'], 'tool:generate_diligence_agenda')).toBe(true);
  });

  it('does not grant `tool:*` for a non-tool scope', () => {
    expect(hasScope(['tool:*'], 'resource:radar:read')).toBe(false);
  });

  it('grants `prompt:*` for any prompt scope', () => {
    expect(hasScope(['prompt:*'], 'prompt:gst_target_quick_look')).toBe(true);
  });
});

describe('hasScope — multi-level wildcard', () => {
  it('grants `tool:radar:*` for any `tool:radar:<name>` request', () => {
    expect(hasScope(['tool:radar:*'], 'tool:radar:search_radar')).toBe(true);
    expect(hasScope(['tool:radar:*'], 'tool:radar:get_latest_insights')).toBe(true);
  });

  it('does NOT grant `tool:radar:*` for a non-radar tool', () => {
    expect(hasScope(['tool:radar:*'], 'tool:search_portfolio')).toBe(false);
  });

  it('does NOT let `tool:*` reach into the explicit radar namespace (BL-166)', () => {
    // Pre-BL-166 this was `true`: `tool:*` covered `tool:radar:foo` by prefix,
    // which is how every pilot grant reached radar by accident.
    expect(hasScope(['tool:*'], 'tool:radar:search_radar')).toBe(false);
    expect(hasScope(['tool:*'], 'tool:radar:get_latest_insights')).toBe(false);
  });

  it('still lets `tool:*` cover non-radar multi-segment tool scopes', () => {
    expect(hasScope(['tool:*'], 'tool:portfolio:search')).toBe(true);
  });
});

describe('hasScope — explicit radar namespace (BL-166)', () => {
  it('refuses `tool:radar:*` itself to a `tool:*` holder (closes grant-time escalation)', () => {
    // consent's `grantedScopesFor` and `/token` both filter requests through
    // hasScope, so this is what stops a `tool:*` ceiling granting radar.
    expect(hasScope(['tool:*'], 'tool:radar:*')).toBe(false);
  });

  it('matches the exact radar scope strings', () => {
    expect(hasScope(['tool:radar:*'], 'tool:radar:*')).toBe(true);
    expect(hasScope(['tool:radar:search_radar'], 'tool:radar:search_radar')).toBe(true);
    expect(hasScope(['tool:radar:search_radar'], 'tool:radar:get_latest_insights')).toBe(false);
  });

  it('keeps segment boundaries: `tool:*` still does not cover `toolbar`', () => {
    expect(hasScope(['tool:*'], 'toolbar')).toBe(false);
  });

  it('does not affect non-tool radar scopes', () => {
    expect(hasScope(['resource:*'], 'resource:radar:read')).toBe(true);
  });
});

describe('effectiveScopes (BL-166 grant marker)', () => {
  it('uses a marked grant exactly as stored', () => {
    const scopes = ['tool:*', 'prompt:*'];
    expect(effectiveScopes(scopes, { scopeModel: SCOPE_MODEL })).toBe(scopes);
    expect(effectiveScopes(scopes, { scopeModel: SCOPE_MODEL + 1 })).toBe(scopes);
  });

  it('adds tool:radar:* to an unmarked (legacy) tool:* grant — it had radar by prefix', () => {
    expect(effectiveScopes(['tool:*', 'prompt:*'], {})).toEqual([
      'tool:*',
      'prompt:*',
      'tool:radar:*',
    ]);
    // A malformed marker is treated as absent.
    expect(effectiveScopes(['tool:*'], { scopeModel: '2' })).toEqual(['tool:*', 'tool:radar:*']);
    expect(effectiveScopes(['tool:*'], { scopeModel: 1 })).toEqual(['tool:*', 'tool:radar:*']);
  });

  it('never adds radar to a legacy trial grant — trials never had it', () => {
    const scopes = ['tool:*', 'prompt:*'];
    expect(effectiveScopes(scopes, { tier: 'trial' })).toBe(scopes);
  });

  it('adds radar to a legacy converted (non-trial tier) grant', () => {
    expect(effectiveScopes(['tool:*'], { tier: 'paid' })).toEqual(['tool:*', 'tool:radar:*']);
  });

  it('leaves legacy grants without tool:*, or already holding radar, unchanged', () => {
    const narrow = ['tool:search_portfolio'];
    expect(effectiveScopes(narrow, {})).toBe(narrow);
    const withRadar = ['tool:*', 'tool:radar:*'];
    expect(effectiveScopes(withRadar, {})).toBe(withRadar);
  });
});

describe('hasScope — DEFAULT_SCOPES covers expected requests', () => {
  it.each([
    ['tool:search_portfolio'],
    ['tool:radar:search_radar'],
    ['tool:radar:*'],
    ['resource:library:read'],
    ['resource:regulations:read'],
    ['resource:radar:read'],
    ['prompt:gst_target_quick_look'],
  ])('grants %s', (required) => {
    expect(hasScope(DEFAULT_SCOPES, required)).toBe(true);
  });
});

describe('assertScope', () => {
  it('passes silently when the required scope is covered', () => {
    expect(() => assertScope(DEFAULT_SCOPES, 'tool:search_portfolio')).not.toThrow();
  });

  it('throws MissingScopeError when the scope is missing', () => {
    expect(() => assertScope(['tool:*'], 'resource:radar:read')).toThrow(MissingScopeError);
  });
});

describe('MissingScopeError', () => {
  it('carries missingScope and ownedScopes on the instance', () => {
    const err = new MissingScopeError('resource:radar:read', ['tool:*']);
    expect(err.missingScope).toBe('resource:radar:read');
    expect(err.ownedScopes).toEqual(['tool:*']);
    expect(err.message).toMatch(/resource:radar:read/);
    expect(err.name).toBe('MissingScopeError');
  });

  it('reserves JSON-RPC error code -32002', () => {
    expect(MissingScopeError.CODE).toBe(-32002);
  });

  it('toJsonRpcError() returns the BL-033-stable error envelope shape', () => {
    const err = new MissingScopeError('resource:radar:read', ['tool:*', 'prompt:*']);
    expect(err.toJsonRpcError()).toEqual({
      code: -32002,
      message: 'Missing required scope: resource:radar:read',
      data: {
        missingScope: 'resource:radar:read',
        ownedScopes: ['tool:*', 'prompt:*'],
      },
    });
  });
});
