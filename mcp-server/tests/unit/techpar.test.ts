/**
 * Tests for the compute_techpar tool wrapper.
 *
 * Validates the input contract and asserts that the engine produces stable
 * benchmark output for a representative payload.
 */

import { compute } from '../../../src/utils/techpar-engine';
import { TechParInputsSchema, type TechParInputs } from '../../src/schemas';

const validInputs: TechParInputs = {
  arr: 25_000_000,
  stage: 'series_bc',
  mode: 'quick',
  capexView: 'cash',
  growthRate: 30,
  exitMultiple: 12,
  infraHostingAnnual: 960_000,
  infraPersonnel: 600_000,
  rdOpEx: 4_000_000,
  rdCapEx: 500_000,
  engFTE: 25,
  engCost: 0,
  prodCost: 0,
  toolingCost: 0,
};

describe('TechParInputsSchema (tool input contract)', () => {
  it('parses a valid 14-field payload', () => {
    const result = TechParInputsSchema.safeParse(validInputs);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown stage enum value', () => {
    const bad = { ...validInputs, stage: 'mega_cap' };
    const result = TechParInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a negative ARR value', () => {
    const bad = { ...validInputs, arr: -1 };
    const result = TechParInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown capexView enum value', () => {
    const bad = { ...validInputs, capexView: 'accrual' };
    const result = TechParInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('compute_techpar (engine parity)', () => {
  it('returns a result for the canonical sample', () => {
    const result = compute(validInputs);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.totalTechPct).toBeGreaterThan(0);
    expect(result.categories.length).toBeGreaterThan(0);
    expect(['underinvest', 'ahead', 'healthy', 'above', 'elevated', 'critical']).toContain(
      result.zone
    );
  });

  it('returns null when arr is zero', () => {
    expect(compute({ ...validInputs, arr: 0 })).toBeNull();
  });

  it('returns null when infraHostingAnnual is zero', () => {
    expect(compute({ ...validInputs, infraHostingAnnual: 0 })).toBeNull();
  });

  it('serializes cleanly to JSON (no circular refs)', () => {
    const result = compute(validInputs);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
