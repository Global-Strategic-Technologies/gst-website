/**
 * Unit tests for the BL-032.5 Phase 2 scope catalog: `hasScope`,
 * `assertScope`, `MissingScopeError`, and the `DEFAULT_SCOPES` shape.
 */

import { describe, it, expect } from 'vitest';
import {
  SCOPES,
  DEFAULT_SCOPES,
  hasScope,
  assertScope,
  MissingScopeError,
} from '../../../src/auth/scopes';

describe('SCOPES catalog', () => {
  it('exposes stable scope strings — none change without an explicit refactor', () => {
    expect(SCOPES.RESOURCE_LIBRARY_READ).toBe('resource:library:read');
    expect(SCOPES.RESOURCE_REGULATIONS_READ).toBe('resource:regulations:read');
    expect(SCOPES.RESOURCE_RADAR_READ).toBe('resource:radar:read');
    expect(SCOPES.TOOL_ALL).toBe('tool:*');
    expect(SCOPES.PROMPT_ALL).toBe('prompt:*');
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

  it('respects segment boundaries — `tool:*` covers `tool:radar:foo`', () => {
    // `tool:*` is a single-segment wildcard at the `tool:` boundary. Multi-
    // segment requests still match because they share the `tool:` prefix.
    expect(hasScope(['tool:*'], 'tool:radar:search_radar')).toBe(true);
  });
});

describe('hasScope — DEFAULT_SCOPES covers expected requests', () => {
  it.each([
    ['tool:search_portfolio'],
    ['tool:radar:search_radar'],
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
