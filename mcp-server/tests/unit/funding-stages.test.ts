/**
 * Tests for the canonical funding-stage taxonomy and per-tool Adapter
 * modules introduced under BL-031.87.
 *
 * Three classes of assertion:
 *
 * 1. **Total coverage** — every canonical stage has a defined native
 *    target in each adapter; every native value has a defined canonical
 *    array. Catches future schema additions where someone adds a new
 *    enum value without updating the adapter.
 *
 * 2. **Safe-direction round-trip** — taking any canonical value to its
 *    native target, then back through `toCanonical`, must include the
 *    original canonical in the resulting array. This proves the
 *    adapter's two tables are mutually consistent.
 *
 * 3. **Lossy collapses (hand-tabulated)** — explicit per-collapse
 *    assertions documenting the intentional information-shedding.
 *    A blind round-trip test in the lossy direction would mask the
 *    information loss; we list each collapse by hand so future readers
 *    see exactly which values get conflated and why.
 */

import { describe, expect, it } from 'vitest';

import { CANONICAL_STAGES } from '../../../src/data/common/funding-stages';
import {
  ICG_STAGE_ADAPTER,
  TECHPAR_STAGE_ADAPTER,
  icgFromCanonical,
  icgToCanonical,
  techparFromCanonical,
  techparToCanonical,
} from '../../../src/data/common/stage-adapters';
import { COMPANY_STAGE_VALUES } from '../../../src/schemas/icg';
import { STAGE_KEYS } from '../../../src/schemas/techpar';

describe('funding-stages — canonical layer', () => {
  it('CANONICAL_STAGES enumerates seed → enterprise in funding-stage order', () => {
    expect(CANONICAL_STAGES).toEqual([
      'seed',
      'series-a',
      'series-b',
      'series-c',
      'pe',
      'enterprise',
    ]);
  });
});

describe('ICG_STAGE_ADAPTER', () => {
  describe('total coverage', () => {
    it('fromCanonical defines every canonical stage', () => {
      for (const canonical of CANONICAL_STAGES) {
        const native = ICG_STAGE_ADAPTER.fromCanonical[canonical];
        expect(native).toBeDefined();
        expect(COMPANY_STAGE_VALUES).toContain(native);
      }
    });

    it('toCanonical defines every ICG native value', () => {
      for (const native of COMPANY_STAGE_VALUES) {
        const canonicals = ICG_STAGE_ADAPTER.toCanonical[native];
        expect(canonicals).toBeDefined();
        expect(canonicals.length).toBeGreaterThan(0);
        for (const c of canonicals) {
          expect(CANONICAL_STAGES).toContain(c);
        }
      }
    });
  });

  describe('safe-direction round-trip', () => {
    it('every canonical → native → canonical[] contains the original canonical', () => {
      for (const canonical of CANONICAL_STAGES) {
        const native = ICG_STAGE_ADAPTER.fromCanonical[canonical];
        const recovered = ICG_STAGE_ADAPTER.toCanonical[native];
        expect(recovered).toContain(canonical);
      }
    });

    it('every native → canonical[N] → native is idempotent (mutual consistency)', () => {
      for (const native of COMPANY_STAGE_VALUES) {
        const canonicals = ICG_STAGE_ADAPTER.toCanonical[native];
        for (const canonical of canonicals) {
          expect(ICG_STAGE_ADAPTER.fromCanonical[canonical]).toBe(native);
        }
      }
    });
  });

  describe('lossy collapses (hand-tabulated, intentional)', () => {
    // ICG has no `seed` cohort — its benchmark dataset doesn't separate
    // seed from Series A. Both canonical values map to `pre-series-b`.
    it('pre-series-b collapses canonical seed and series-a', () => {
      expect(ICG_STAGE_ADAPTER.toCanonical['pre-series-b']).toEqual(['seed', 'series-a']);
    });

    // ICG collapses Series B and C — benchmark dataset doesn't separate.
    it('series-bc collapses canonical series-b and series-c', () => {
      expect(ICG_STAGE_ADAPTER.toCanonical['series-bc']).toEqual(['series-b', 'series-c']);
    });

    it('pe-backed maps to canonical pe only (no collapse)', () => {
      expect(ICG_STAGE_ADAPTER.toCanonical['pe-backed']).toEqual(['pe']);
    });

    it('enterprise maps to canonical enterprise only (no collapse)', () => {
      expect(ICG_STAGE_ADAPTER.toCanonical['enterprise']).toEqual(['enterprise']);
    });
  });

  describe('helper functions', () => {
    it('icgFromCanonical and icgToCanonical mirror the records', () => {
      for (const canonical of CANONICAL_STAGES) {
        expect(icgFromCanonical(canonical)).toBe(ICG_STAGE_ADAPTER.fromCanonical[canonical]);
      }
      for (const native of COMPANY_STAGE_VALUES) {
        expect(icgToCanonical(native)).toBe(ICG_STAGE_ADAPTER.toCanonical[native]);
      }
    });
  });
});

describe('TECHPAR_STAGE_ADAPTER', () => {
  describe('total coverage', () => {
    it('fromCanonical defines every canonical stage', () => {
      for (const canonical of CANONICAL_STAGES) {
        const native = TECHPAR_STAGE_ADAPTER.fromCanonical[canonical];
        expect(native).toBeDefined();
        expect(STAGE_KEYS).toContain(native);
      }
    });

    it('toCanonical defines every TechPar native value', () => {
      for (const native of STAGE_KEYS) {
        const canonicals = TECHPAR_STAGE_ADAPTER.toCanonical[native];
        expect(canonicals).toBeDefined();
        expect(canonicals.length).toBeGreaterThan(0);
        for (const c of canonicals) {
          expect(CANONICAL_STAGES).toContain(c);
        }
      }
    });
  });

  describe('safe-direction round-trip', () => {
    it('every canonical → native → canonical[] contains the original canonical', () => {
      for (const canonical of CANONICAL_STAGES) {
        const native = TECHPAR_STAGE_ADAPTER.fromCanonical[canonical];
        const recovered = TECHPAR_STAGE_ADAPTER.toCanonical[native];
        expect(recovered).toContain(canonical);
      }
    });

    it('every native → canonical[N] → native is idempotent (mutual consistency)', () => {
      for (const native of STAGE_KEYS) {
        const canonicals = TECHPAR_STAGE_ADAPTER.toCanonical[native];
        for (const canonical of canonicals) {
          expect(TECHPAR_STAGE_ADAPTER.fromCanonical[canonical]).toBe(native);
        }
      }
    });
  });

  describe('lossy collapses (hand-tabulated, intentional)', () => {
    // TechPar collapses Series B and C — benchmark dataset doesn't separate.
    it('series_bc collapses canonical series-b and series-c', () => {
      expect(TECHPAR_STAGE_ADAPTER.toCanonical['series_bc']).toEqual(['series-b', 'series-c']);
    });

    // Negative assertion: TechPar has a separate seed cohort (unlike
    // ICG); the canonical seed value should NOT also include series-a.
    it('seed maps to canonical seed only (separate cohort, no collapse)', () => {
      expect(TECHPAR_STAGE_ADAPTER.toCanonical['seed']).toEqual(['seed']);
    });

    it('series_a maps to canonical series-a only (no collapse)', () => {
      expect(TECHPAR_STAGE_ADAPTER.toCanonical['series_a']).toEqual(['series-a']);
    });

    it('pe maps to canonical pe only (no collapse)', () => {
      expect(TECHPAR_STAGE_ADAPTER.toCanonical['pe']).toEqual(['pe']);
    });

    it('enterprise maps to canonical enterprise only (no collapse)', () => {
      expect(TECHPAR_STAGE_ADAPTER.toCanonical['enterprise']).toEqual(['enterprise']);
    });
  });

  describe('helper functions', () => {
    it('techparFromCanonical and techparToCanonical mirror the records', () => {
      for (const canonical of CANONICAL_STAGES) {
        expect(techparFromCanonical(canonical)).toBe(
          TECHPAR_STAGE_ADAPTER.fromCanonical[canonical]
        );
      }
      for (const native of STAGE_KEYS) {
        expect(techparToCanonical(native)).toBe(TECHPAR_STAGE_ADAPTER.toCanonical[native]);
      }
    });
  });
});

describe('Cross-adapter invariants', () => {
  // Both ICG and TechPar collapse Series B + C (their benchmark datasets
  // don't separate them). The canonical layer reflects this consistently.
  it('series-b and series-c map to the same native value in both ICG and TechPar', () => {
    expect(ICG_STAGE_ADAPTER.fromCanonical['series-b']).toBe(
      ICG_STAGE_ADAPTER.fromCanonical['series-c']
    );
    expect(TECHPAR_STAGE_ADAPTER.fromCanonical['series-b']).toBe(
      TECHPAR_STAGE_ADAPTER.fromCanonical['series-c']
    );
  });

  // ICG's pre-series-b cohort is a unique aspect (covers seed + series-a).
  // TechPar treats them separately. This test documents that asymmetry.
  it('ICG collapses seed and series-a; TechPar does not', () => {
    expect(ICG_STAGE_ADAPTER.fromCanonical['seed']).toBe(
      ICG_STAGE_ADAPTER.fromCanonical['series-a']
    );
    expect(TECHPAR_STAGE_ADAPTER.fromCanonical['seed']).not.toBe(
      TECHPAR_STAGE_ADAPTER.fromCanonical['series-a']
    );
  });
});
