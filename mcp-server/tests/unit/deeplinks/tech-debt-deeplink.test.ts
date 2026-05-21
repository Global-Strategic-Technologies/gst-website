/**
 * Tech Debt deep-link round-trip parity test.
 *
 * Proves the encoder is shared (not duplicated) between the website page
 * and the MCP wrapper: build the deep-link from raw MCP inputs, then
 * simulate the website's `decodeState` on the URL's `?s=` param. The
 * decoded CalcState must equal the state we constructed from the raw
 * inputs via the website's inverse helpers.
 */

import { describe, it, expect } from 'vitest';
import { buildTechDebtDeeplink, rawToState } from '../../../src/tools/tech-debt';
import { decodeState, type RawTechDebtInputs } from '../../../../src/utils/tech-debt-engine';

const SAMPLE_INPUT: RawTechDebtInputs = {
  teamSize: 25,
  salary: 150000,
  maintenanceBurdenPct: 25,
  deployFrequency: 'Weekly',
  incidents: 4,
  mttrHours: 8,
  remediationBudget: 500000,
  arr: 10_000_000,
  remediationPct: 50,
  contextSwitchOn: true,
};

describe('Tech Debt deep-link', () => {
  it('produces a URL on the configured HUB_BASE with a populated ?s= param', () => {
    const url = buildTechDebtDeeplink(SAMPLE_INPUT);
    expect(url).toMatch(/^https?:\/\/[^/]+\/hub\/tools\/tech-debt-calculator\/\?s=.+$/);
  });

  it('round-trips through the website decoder byte-identically (state level)', () => {
    const url = buildTechDebtDeeplink(SAMPLE_INPUT);
    const encoded = new URL(url).searchParams.get('s');
    expect(encoded).toBeTruthy();

    const decoded = decodeState(encoded!);
    const expected = rawToState(SAMPLE_INPUT);

    // decodeState returns Partial<CalcState>; every field we populated should round-trip
    expect(decoded).not.toBeNull();
    expect(decoded!.teamSize).toBe(expected.teamSize);
    expect(decoded!.salary).toBe(expected.salary);
    expect(decoded!.maintPct).toBe(expected.maintPct);
    expect(decoded!.deployIdx).toBe(expected.deployIdx);
    expect(decoded!.incidents).toBe(expected.incidents);
    expect(decoded!.mttr).toBe(expected.mttr);
    expect(decoded!.remediationBudget).toBe(expected.remediationBudget);
    expect(decoded!.arr).toBe(expected.arr);
    expect(decoded!.remediationPct).toBe(expected.remediationPct);
    expect(decoded!.contextSwitchOn).toBe(expected.contextSwitchOn);
  });

  it('preserves granular ARR precision in the deeplink (no slider-quantization loss)', () => {
    // Pre-2026-05 deeplinks routed raw values through slider positions and lost
    // precision at the high end (one slider step ≈ $25M near $1B ARR).
    // After state inversion, deeplinks encode raw dollars and must round-trip exactly.
    const granular: RawTechDebtInputs = {
      ...SAMPLE_INPUT,
      arr: 237_500_000, // not a typical slider-bucket value
      remediationBudget: 1_750_000,
      salary: 187_500,
    };
    const url = buildTechDebtDeeplink(granular);
    const encoded = new URL(url).searchParams.get('s')!;
    const decoded = decodeState(encoded)!;
    expect(decoded.arr).toBe(237_500_000);
    expect(decoded.remediationBudget).toBe(1_750_000);
    expect(decoded.salary).toBe(187_500);
  });

  it('throws on unknown deployFrequency rather than emitting a malformed URL', () => {
    const bad = { ...SAMPLE_INPUT, deployFrequency: 'Hourly' as never };
    expect(() => buildTechDebtDeeplink(bad)).toThrow(/Unknown deployFrequency/);
  });
});
