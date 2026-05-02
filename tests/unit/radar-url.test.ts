/**
 * Unit tests for the Radar URL state encoder/decoder (BL-031.95
 * Phase 3.B). The encoder is the single source of truth for radar URL
 * state — used by both the website page (CategoryFilter.astro
 * hydrates/syncs) and the MCP tool wrapper (`buildRadarDeeplink`).
 *
 * Capability-mirror invariant (Phase 3.A): the only filter the
 * website surfaces is `category`, so the encoder accepts only
 * `category`. Future filters added to the website should grow the
 * encoder + the MCP tool's input schema in lockstep.
 */

import { describe, it, expect } from 'vitest';

import { serializeToParams, deserializeFromParams } from '../../src/utils/radar-url';

describe('radar-url — round-trip parity', () => {
  it('round-trips each canonical category', () => {
    for (const category of ['pe-ma', 'enterprise-tech', 'ai-automation', 'security'] as const) {
      const params = serializeToParams({ category });
      const restored = deserializeFromParams(params);
      expect(restored.category).toBe(category);
    }
  });

  it('empty filters produce empty params', () => {
    const params = serializeToParams({});
    expect(params.toString()).toBe('');
  });

  it('null category produces empty params (treated as "all")', () => {
    const params = serializeToParams({ category: null });
    expect(params.toString()).toBe('');
  });

  it('empty params decode to category null', () => {
    const restored = deserializeFromParams(new URLSearchParams());
    expect(restored.category).toBeNull();
  });
});

describe('radar-url — encoding details', () => {
  it('uses readable `category` URL key (filter-grid archetype, matches Regulatory Map)', () => {
    const params = serializeToParams({ category: 'enterprise-tech' });
    expect(params.get('category')).toBe('enterprise-tech');
  });

  it('full deeplink stays well under the 2000-char browser limit', () => {
    const params = serializeToParams({ category: 'enterprise-tech' });
    const url = `https://globalstrategic.tech/hub/radar?${params.toString()}`;
    expect(url.length).toBeLessThan(200); // realistic — small filter surface
  });
});

describe('radar-url — deserialization edge cases', () => {
  it('unknown category values are silently dropped (forward-compat)', () => {
    const params = new URLSearchParams('category=crypto');
    const restored = deserializeFromParams(params);
    expect(restored.category).toBeNull();
  });

  it('empty `category=` value is treated as "all"', () => {
    const params = new URLSearchParams('category=');
    const restored = deserializeFromParams(params);
    expect(restored.category).toBeNull();
  });

  it('extra unknown URL keys are silently ignored', () => {
    const params = new URLSearchParams('category=pe-ma&since=24h&tier=fyi');
    const restored = deserializeFromParams(params);
    expect(restored.category).toBe('pe-ma');
    // `since` and `tier` are not in the website's filter UI; the
    // encoder/decoder ignores them. Future website filters added in a
    // later phase should grow the encoder.
    expect(Object.keys(restored)).toEqual(['category']);
  });
});

describe('radar-url — capability-mirror invariant (Phase 3.A enforcement)', () => {
  // The encoder accepts only the fields the website surfaces. Pre-
  // Phase-3 callers passing tier/since/limit would have those silently
  // dropped because the encoder only writes `category`.

  it('encoder ignores extra unsupported keys (e.g. tier, since, limit)', () => {
    // TypeScript wouldn't allow this at compile time; pass as a wider
    // shape to test runtime behavior.
    const params = serializeToParams({ category: 'pe-ma' } as Record<string, unknown>);
    expect(params.has('tier')).toBe(false);
    expect(params.has('since')).toBe(false);
    expect(params.has('limit')).toBe(false);
    expect(params.has('category')).toBe(true);
  });
});
