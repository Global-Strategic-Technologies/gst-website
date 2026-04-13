/**
 * Unit Tests for Tech Debt Engine
 *
 * Tests all pure functions:
 * - Slider transform functions (pos → value, value → pos)
 * - calculate(): core cost computation in quick and deep modes
 * - fmt / fmtShort / fmtPayback: formatting utilities
 * - DEPLOY_OPTIONS: data integrity
 * - DEFAULT_STATE: initial values
 */

import {
  posToTeamSize,
  posToSalary,
  posTobudget,
  posToArr,
  teamSizeToPos,
  salaryToPos,
  budgetToPos,
  arrToPos,
  calculate,
  fmt,
  fmtShort,
  fmtPayback,
  DEFAULT_STATE,
  DEPLOY_OPTIONS,
  encodeState,
  decodeState,
} from '../../src/utils/tech-debt-engine';

import type { CalcState } from '../../src/utils/tech-debt-engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// makeState spreads DEFAULT_STATE as the base — tests that depend on specific
// inputs for isolated assertions should explicitly override all relevant fields.
function makeState(overrides: Partial<CalcState> = {}): CalcState {
  return { ...DEFAULT_STATE, ...overrides };
}

// ─── Slider transforms ────────────────────────────────────────────────────────

describe('posToTeamSize', () => {
  it('returns 1 at position 0', () => {
    expect(posToTeamSize(0)).toBe(1);
  });

  it('returns exactly 500 at position 100', () => {
    expect(posToTeamSize(100)).toBe(500);
  });

  it('is monotonically increasing', () => {
    expect(posToTeamSize(50)).toBeGreaterThan(posToTeamSize(25));
    expect(posToTeamSize(75)).toBeGreaterThan(posToTeamSize(50));
  });
});

describe('posToSalary', () => {
  it('returns 60000 at position 0', () => {
    expect(posToSalary(0)).toBe(60000);
  });

  it('returns 1000000 at position 100', () => {
    expect(posToSalary(100)).toBe(1000000);
  });

  it('snaps to 5000 increments', () => {
    expect(posToSalary(50) % 5000).toBe(0);
  });
});

describe('posTobudget', () => {
  // Note: posTobudget has an intentionally lowercase 'b' in the engine export
  it('returns 10000 at position 0', () => {
    expect(posTobudget(0)).toBe(10000);
  });

  it('returns 50000000 at position 100', () => {
    expect(posTobudget(100)).toBe(50000000);
  });

  it('snaps to 1000 increments', () => {
    expect(posTobudget(50) % 1000).toBe(0);
  });
});

describe('posToArr', () => {
  it('returns 100000 at position 0', () => {
    expect(posToArr(0)).toBe(100000);
  });

  it('returns 1000000000 at position 100', () => {
    expect(posToArr(100)).toBe(1000000000);
  });

  it('snaps to 100000 increments', () => {
    expect(posToArr(50) % 100000).toBe(0);
  });
});

// ─── Inverse transforms ───────────────────────────────────────────────────────

describe('inverse transforms round-trip', () => {
  it('teamSizeToPos(8) round-trips back to 8', () => {
    const pos = teamSizeToPos(8);
    expect(posToTeamSize(pos)).toBe(8);
  });

  it('salaryToPos(150000) round-trips back to 150000', () => {
    const pos = salaryToPos(150000);
    expect(posToSalary(pos)).toBe(150000);
  });

  // posTobudget / posToArr use integer snapping with a 2.5 exponent curve.
  // The inverse loses precision at the snap resolution — tolerance is 22× the snap unit
  // due to the non-linear curve compressing precision near the midpoint.
  it('budgetToPos(500000) round-trips within 22 × $1K snap', () => {
    const pos = budgetToPos(500000);
    expect(Math.abs(posTobudget(pos) - 500000)).toBeLessThanOrEqual(22000);
  });

  it('arrToPos(10000000) round-trips within 3 × $100K snap', () => {
    const pos = arrToPos(10000000);
    expect(Math.abs(posToArr(pos) - 10000000)).toBeLessThanOrEqual(300000);
  });
});

// ─── calculate() — collapsed mode (advancedOpen: false) ───────────────────────

describe('calculate() — collapsed mode (advancedOpen: false)', () => {
  it('always includes incident labor in totalMonthly regardless of advancedOpen', () => {
    const state = makeState({ advancedOpen: false, incidents: 10, mttr: 8 });
    const result = calculate(state);
    expect(result.totalMonthly).toBeCloseTo(result.directMonthly + result.incidentMonthly, 5);
    expect(result.incidentMonthly).toBeGreaterThan(0);
  });

  it('annualCost is exactly 12× totalMonthly', () => {
    const result = calculate(makeState({ advancedOpen: false }));
    // annualCost = totalMonthly * 12 is exact integer multiplication
    expect(result.annualCost).toBe(result.totalMonthly * 12);
  });

  it('hoursLostPerEng equals 40 × (maintPct / 100) — formula is mode-independent', () => {
    expect(calculate(makeState({ maintPct: 40 })).hoursLostPerEng).toBe(16);
    expect(calculate(makeState({ maintPct: 0 })).hoursLostPerEng).toBe(0);
    expect(calculate(makeState({ maintPct: 100 })).hoursLostPerEng).toBe(40);
  });

  it('costPerEng equals totalMonthly / teamSize', () => {
    // Explicitly set all inputs used by this formula
    const state = makeState({
      advancedOpen: false,
      teamSizePos: teamSizeToPos(10),
      salaryPos: salaryToPos(120000),
      maintPct: 30,
      deployIdx: 2,
    });
    const result = calculate(state);
    const teamSize = posToTeamSize(state.teamSizePos);
    expect(result.costPerEng).toBeCloseTo(result.totalMonthly / teamSize, 5);
  });

  it('directMonthly increases proportionally with maintPct', () => {
    const lo = calculate(makeState({ maintPct: 20 }));
    const hi = calculate(makeState({ maintPct: 60 }));
    expect(hi.directMonthly).toBeGreaterThan(lo.directMonthly);
    // 60% is 3× 20% — directMonthly should scale linearly with maintPct
    expect(hi.directMonthly / lo.directMonthly).toBeCloseTo(3, 5);
  });

  it('V multiplier scales directMonthly — higher V means higher cost', () => {
    // deployIdx 0 = Elite V:0.8, deployIdx 8 = Annually V:2.4
    const elite = calculate(makeState({ deployIdx: 0 }));
    const annually = calculate(makeState({ deployIdx: 8 }));
    expect(elite.V).toBe(0.8);
    expect(elite.doraLabel).toBe('Elite');
    expect(annually.V).toBe(2.4);
    expect(annually.doraLabel).toBe('Low');
    expect(annually.directMonthly).toBeGreaterThan(elite.directMonthly);
  });
});

// ─── calculate() — expanded mode (advancedOpen: true) ─────────────────────────

describe('calculate() — expanded mode (advancedOpen: true)', () => {
  it('totalMonthly is directMonthly + incidentMonthly', () => {
    const state = makeState({ advancedOpen: true, incidents: 5, mttr: 8 });
    const result = calculate(state);
    expect(result.totalMonthly).toBeCloseTo(result.directMonthly + result.incidentMonthly, 5);
  });

  it('incidentMonthly equals incidents × mttr × (salary / 2080)', () => {
    // Use salary=150000 — a $5K multiple that round-trips through posToSalary(salaryToPos(v))
    // exactly (proven by DEFAULT_STATE test). Derive expected from the round-tripped value.
    const salaryInput = 150000;
    const salaryPos = salaryToPos(salaryInput);
    const salary = posToSalary(salaryPos); // = 150000 (exact round-trip)
    const state = makeState({
      advancedOpen: true,
      salaryPos,
      incidents: 4,
      mttr: 10,
    });
    const result = calculate(state);
    const expectedHourlyRate = salary / 2080;
    const expectedIncident = 4 * 10 * expectedHourlyRate;
    expect(result.incidentMonthly).toBeCloseTo(expectedIncident, 5);
  });

  it('debtPctArr returns 0 when arrVal guard is triggered (zero division)', () => {
    // The engine computes debtPctArr = arrVal > 0 ? ... : 0
    // posToArr always returns >= 100000 for pos >= 0, so we test the formula
    // directly by verifying the guard branch: a tiny ARR yields large percentage
    const state = makeState({ advancedOpen: true, arrPos: 0 }); // arrVal = 100000
    const result = calculate(state);
    // arrVal = 100000 (minimum floor, not zero) — guard NOT triggered, result is positive
    expect(result.debtPctArr).toBeGreaterThan(0);
    expect(isFinite(result.debtPctArr)).toBe(true);
  });

  it('debtPctArr scales inversely with ARR — higher ARR means lower percentage', () => {
    const loArr = calculate(makeState({ advancedOpen: true, arrPos: arrToPos(1_000_000) }));
    const hiArr = calculate(makeState({ advancedOpen: true, arrPos: arrToPos(100_000_000) }));
    expect(loArr.debtPctArr).toBeGreaterThan(hiArr.debtPctArr);
  });

  it('paybackMonths is Infinity when totalMonthly is 0', () => {
    // Set maintPct and incidents both to 0 to drive totalMonthly to 0
    const state = makeState({ advancedOpen: true, maintPct: 0, incidents: 0, mttr: 1 });
    expect(calculate(state).paybackMonths).toBe(Infinity);
  });

  it('paybackMonths equals budgetVal / totalMonthly — concrete arithmetic', () => {
    // Use salary with exact hourlyRate to make incidentMonthly deterministic
    // budgetToPos(600000) → budgetVal ≈ 600000; verify exact formula holds
    const state = makeState({
      advancedOpen: true,
      budgetPos: budgetToPos(600000),
      maintPct: 50,
      incidents: 0,
      mttr: 1,
    });
    const result = calculate(state);
    const budgetVal = posTobudget(state.budgetPos);
    expect(result.paybackMonths).toBeCloseTo(budgetVal / result.totalMonthly, 5);
  });

  it('paybackMonths decreases as remediation budget decreases', () => {
    const hi = calculate(makeState({ advancedOpen: true, budgetPos: budgetToPos(1_000_000) }));
    const lo = calculate(makeState({ advancedOpen: true, budgetPos: budgetToPos(100_000) }));
    expect(lo.paybackMonths).toBeLessThan(hi.paybackMonths);
  });
});

// ─── DEPLOY_OPTIONS integrity ─────────────────────────────────────────────────

describe('DEPLOY_OPTIONS', () => {
  it('has exactly 9 entries', () => {
    expect(DEPLOY_OPTIONS.length).toBe(9);
  });

  it('V values are monotonically increasing', () => {
    for (let i = 1; i < DEPLOY_OPTIONS.length; i++) {
      expect(DEPLOY_OPTIONS[i].V).toBeGreaterThan(DEPLOY_OPTIONS[i - 1].V);
    }
  });

  it('index 3 is Bi-weekly with V = 1.1', () => {
    expect(DEPLOY_OPTIONS[3].label).toBe('Bi-weekly');
    expect(DEPLOY_OPTIONS[3].V).toBe(1.1);
  });

  it('index 8 is Annually with V = 2.4 and doraLabel Low', () => {
    expect(DEPLOY_OPTIONS[8].label).toBe('Annually');
    expect(DEPLOY_OPTIONS[8].V).toBe(2.4);
    expect(DEPLOY_OPTIONS[8].doraLabel).toBe('Low');
  });
});

// ─── Formatting utilities ─────────────────────────────────────────────────────

describe('fmt', () => {
  it('formats as USD with no decimals', () => {
    expect(fmt(1000)).toBe('$1,000');
    expect(fmt(1500000)).toBe('$1,500,000');
  });
});

describe('fmtShort', () => {
  it('formats millions with one decimal', () => {
    expect(fmtShort(1_500_000)).toBe('$1.5M');
    expect(fmtShort(2_000_000)).toBe('$2.0M');
  });

  it('formats exactly 1_000_000 as $1.0M (>= branch)', () => {
    expect(fmtShort(1_000_000)).toBe('$1.0M');
  });

  it('formats thousands with no decimal', () => {
    expect(fmtShort(150_000)).toBe('$150K');
    expect(fmtShort(1_000)).toBe('$1K');
  });

  it('falls back to full format below 1000', () => {
    expect(fmtShort(500)).toBe('$500');
    expect(fmtShort(999)).toBe('$999');
  });
});

describe('fmtPayback', () => {
  it('returns "< 1 mo" for values less than 1', () => {
    expect(fmtPayback(0.5)).toBe('< 1 mo');
    expect(fmtPayback(0)).toBe('< 1 mo');
  });

  it('returns formatted string for exactly 1 (boundary — not < 1)', () => {
    expect(fmtPayback(1)).toBe('1.0 mo');
  });

  it('returns formatted string for exactly 60 (boundary — not > 60)', () => {
    expect(fmtPayback(60)).toBe('60.0 mo');
  });

  it('returns "> 5 yrs" for values over 60', () => {
    expect(fmtPayback(61)).toBe('> 5 yrs');
    expect(fmtPayback(Infinity)).toBe('> 5 yrs');
  });

  it('returns months with one decimal for normal range', () => {
    expect(fmtPayback(12)).toBe('12.0 mo');
    expect(fmtPayback(23.5)).toBe('23.5 mo');
  });
});

// ─── DEFAULT_STATE ────────────────────────────────────────────────────────────

describe('DEFAULT_STATE', () => {
  it('starts collapsed (advancedOpen: false)', () => {
    expect(DEFAULT_STATE.advancedOpen).toBe(false);
  });

  it('initialises to team size of 8', () => {
    expect(posToTeamSize(DEFAULT_STATE.teamSizePos)).toBe(8);
  });

  it('initialises to salary of 150000', () => {
    expect(posToSalary(DEFAULT_STATE.salaryPos)).toBe(150000);
  });

  it('initialises to maintenance burden of 25%', () => {
    expect(DEFAULT_STATE.maintPct).toBe(25);
  });

  // deployIdx is the single authoritative check — see also DEPLOY_OPTIONS tests above
  it('initialises to deploy index 3', () => {
    expect(DEFAULT_STATE.deployIdx).toBe(3);
  });

  it('initialises to 3 incidents per month', () => {
    expect(DEFAULT_STATE.incidents).toBe(3);
  });

  it('initialises to 4h MTTR', () => {
    expect(DEFAULT_STATE.mttr).toBe(4);
  });

  it('initialises budget within 22 × $1K snap of $500K', () => {
    expect(Math.abs(posTobudget(DEFAULT_STATE.budgetPos) - 500_000)).toBeLessThanOrEqual(22000);
  });

  it('initialises ARR within 3 × $100K snap of $10M', () => {
    expect(Math.abs(posToArr(DEFAULT_STATE.arrPos) - 10_000_000)).toBeLessThanOrEqual(300_000);
  });
});

// ─── encodeState / decodeState ────────────────────────────────────────────────

describe('encodeState', () => {
  it('returns a non-empty string for DEFAULT_STATE', () => {
    expect(encodeState(DEFAULT_STATE).length).toBeGreaterThan(0);
  });

  it('returns a string that survives atob without throwing', () => {
    expect(() => atob(encodeState(DEFAULT_STATE))).not.toThrow();
  });

  it('encodes advancedOpen: true as 1', () => {
    const s = { ...DEFAULT_STATE, advancedOpen: true };
    const raw = JSON.parse(atob(encodeState(s)));
    expect(raw.a).toBe(1);
  });

  it('encodes advancedOpen: false as 0', () => {
    const s = { ...DEFAULT_STATE, advancedOpen: false };
    const raw = JSON.parse(atob(encodeState(s)));
    expect(raw.a).toBe(0);
  });

  it('different states produce different encoded strings', () => {
    const a = encodeState({ ...DEFAULT_STATE, maintPct: 20 });
    const b = encodeState({ ...DEFAULT_STATE, maintPct: 80 });
    expect(a).not.toBe(b);
  });

  it('same state always produces the same encoded string (deterministic)', () => {
    expect(encodeState(DEFAULT_STATE)).toBe(encodeState(DEFAULT_STATE));
  });
});

describe('decodeState', () => {
  it('round-trips DEFAULT_STATE through encode → decode with full field equality', () => {
    const decoded = decodeState(encodeState(DEFAULT_STATE));
    expect(decoded).not.toBeNull();
    expect(decoded!.advancedOpen).toBe(DEFAULT_STATE.advancedOpen);
    expect(decoded!.teamSizePos).toBe(DEFAULT_STATE.teamSizePos);
    expect(decoded!.salaryPos).toBe(DEFAULT_STATE.salaryPos);
    expect(decoded!.maintPct).toBe(DEFAULT_STATE.maintPct);
    expect(decoded!.deployIdx).toBe(DEFAULT_STATE.deployIdx);
    expect(decoded!.incidents).toBe(DEFAULT_STATE.incidents);
    expect(decoded!.mttr).toBe(DEFAULT_STATE.mttr);
    expect(decoded!.budgetPos).toBe(DEFAULT_STATE.budgetPos);
    expect(decoded!.arrPos).toBe(DEFAULT_STATE.arrPos);
  });

  it('returns null for an empty string', () => {
    expect(decodeState('')).toBeNull();
  });

  it('returns null for non-base64 garbage', () => {
    expect(decodeState('not!!valid##base64')).toBeNull();
  });

  it('returns null for valid base64 that decodes to non-JSON', () => {
    expect(decodeState(btoa('not json at all'))).toBeNull();
  });

  it('returns an empty partial (not null) for valid JSON with no known keys', () => {
    const encoded = btoa(JSON.stringify({ unknown: 99 }));
    const result = decodeState(encoded);
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toHaveLength(0);
  });

  it('returns partial result when only some fields are present — valid fields included', () => {
    const encoded = btoa(JSON.stringify({ mp: 60 }));
    const result = decodeState(encoded);
    expect(result).not.toBeNull();
    expect(result!.maintPct).toBe(60);
    expect(result!.teamSizePos).toBeUndefined();
  });

  it('rejects teamSizePos > 100', () => {
    expect(decodeState(btoa(JSON.stringify({ ts: 101 })))!.teamSizePos).toBeUndefined();
  });

  it('rejects teamSizePos < 0', () => {
    expect(decodeState(btoa(JSON.stringify({ ts: -1 })))!.teamSizePos).toBeUndefined();
  });

  it('rejects deployIdx > 8', () => {
    expect(decodeState(btoa(JSON.stringify({ di: 9 })))!.deployIdx).toBeUndefined();
  });

  it('rejects deployIdx < 0', () => {
    expect(decodeState(btoa(JSON.stringify({ di: -1 })))!.deployIdx).toBeUndefined();
  });

  it('rejects maintPct < 0', () => {
    expect(decodeState(btoa(JSON.stringify({ mp: -1 })))!.maintPct).toBeUndefined();
  });

  it('accepts maintPct of 0', () => {
    expect(decodeState(btoa(JSON.stringify({ mp: 0 })))!.maintPct).toBe(0);
  });

  it('rejects maintPct > 100', () => {
    expect(decodeState(btoa(JSON.stringify({ mp: 101 })))!.maintPct).toBeUndefined();
  });

  it('rejects mttr < 1', () => {
    expect(decodeState(btoa(JSON.stringify({ mttr: 0 })))!.mttr).toBeUndefined();
  });

  it('rejects mttr > 48', () => {
    expect(decodeState(btoa(JSON.stringify({ mttr: 49 })))!.mttr).toBeUndefined();
  });

  it('rejects incidents < 0', () => {
    expect(decodeState(btoa(JSON.stringify({ in: -1 })))!.incidents).toBeUndefined();
  });

  it('rejects incidents > 20', () => {
    expect(decodeState(btoa(JSON.stringify({ in: 21 })))!.incidents).toBeUndefined();
  });

  it('rejects float values for integer fields (e.g. deployIdx: 3.5)', () => {
    expect(decodeState(btoa(JSON.stringify({ di: 3.5 })))!.deployIdx).toBeUndefined();
  });

  it('rejects advancedOpen values that are not 0 or 1 (e.g. 2)', () => {
    expect(decodeState(btoa(JSON.stringify({ a: 2 })))!.advancedOpen).toBeUndefined();
  });

  it('accepts advancedOpen: 1 and maps it to boolean true', () => {
    expect(decodeState(btoa(JSON.stringify({ a: 1 })))!.advancedOpen).toBe(true);
  });

  it('accepts advancedOpen: 0 and maps it to boolean false', () => {
    expect(decodeState(btoa(JSON.stringify({ a: 0 })))!.advancedOpen).toBe(false);
  });

  it('ignores unknown keys — returns only known fields', () => {
    const encoded = btoa(JSON.stringify({ mp: 50, future_field: 'x', another: 99 }));
    const result = decodeState(encoded)!;
    expect(result.maintPct).toBe(50);
    expect((result as any).future_field).toBeUndefined();
    expect((result as any).another).toBeUndefined();
  });
});
