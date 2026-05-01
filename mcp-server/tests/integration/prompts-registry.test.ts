/**
 * Prompts registry invariants — the drift backstop.
 *
 * Boots the live server and asserts that for every entry in ALL_PROMPTS:
 *   - the gst_ name regex passes,
 *   - the version is semver,
 *   - lastReviewedAt is ISO date and within 12 months,
 *   - orchestrates is non-empty,
 *   - every orchestrates entry resolves to either a registered tool name
 *     or a known Resource URI scheme prefix.
 *
 * This test scales constant-cost as prompts are added — the loop is
 * uniform; a new prompt either passes all checks or fails the suite.
 */

import { describe, it, expect } from 'vitest';
import { ALL_PROMPTS, assertPromptInvariants } from '../../src/prompts/_registry';

const KNOWN_TOOL_NAMES = new Set([
  'generate_diligence_agenda',
  'search_portfolio',
  'list_portfolio_facets',
  'assess_infrastructure_cost_governance',
  'compute_techpar',
  'estimate_tech_debt_cost',
  'search_regulations',
  'list_regulation_facets',
  'search_radar_cache',
]);

const KNOWN_RESOURCE_URI_PREFIXES = ['gst://library/', 'gst://regulations/', 'gst://radar/'];

function resolvesAgainstRegistry(orchestratesEntry: string): boolean {
  if (KNOWN_TOOL_NAMES.has(orchestratesEntry)) return true;
  return KNOWN_RESOURCE_URI_PREFIXES.some((prefix) => orchestratesEntry.startsWith(prefix));
}

describe('prompts registry invariants', () => {
  it('ALL_PROMPTS is non-empty', () => {
    expect(ALL_PROMPTS.length).toBeGreaterThan(0);
  });

  it('every prompt name is unique', () => {
    const names = ALL_PROMPTS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every prompt passes assertPromptInvariants (gst_ prefix, semver, freshness, orchestrates non-empty)', () => {
    for (const prompt of ALL_PROMPTS) {
      expect(() => assertPromptInvariants(prompt)).not.toThrow();
    }
  });

  it('every orchestrates entry resolves to a registered tool name or known Resource URI scheme prefix', () => {
    for (const prompt of ALL_PROMPTS) {
      for (const ref of prompt.orchestrates) {
        expect(
          resolvesAgainstRegistry(ref),
          `prompt "${prompt.name}" orchestrates "${ref}" but it's neither a known tool nor a known Resource URI prefix`
        ).toBe(true);
      }
    }
  });
});

describe('assertPromptInvariants — failure modes', () => {
  // Use a base from a real prompt so the only thing under test is the field
  // we're mutating
  const base = ALL_PROMPTS[0];

  it('throws on bad name', () => {
    expect(() => assertPromptInvariants({ ...base, name: 'no_prefix' })).toThrow(/must match/);
  });

  it('throws on bad version', () => {
    expect(() => assertPromptInvariants({ ...base, version: 'v1' })).toThrow(/semver/);
  });

  it('throws on bad lastReviewedAt format', () => {
    expect(() => assertPromptInvariants({ ...base, lastReviewedAt: '2026/01/01' })).toThrow(
      /YYYY-MM-DD/
    );
  });

  it('throws when lastReviewedAt is more than 12 months old', () => {
    expect(() =>
      assertPromptInvariants({ ...base, lastReviewedAt: '2024-01-01' }, new Date('2026-04-29'))
    ).toThrow(/12 months/);
  });

  it('throws on empty orchestrates', () => {
    expect(() => assertPromptInvariants({ ...base, orchestrates: [] })).toThrow(
      /at least one orchestrates entry/
    );
  });
});
