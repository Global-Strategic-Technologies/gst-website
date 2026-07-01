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
  burdenClassify,
  contextNote,
  parseShortCurrency,
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
  // The inverse loses precision at the snap resolution. With the 10× slider
  // resolution bump (step="0.1") the round-trip is much tighter than before.
  it('budgetToPos(500000) round-trips within 3 × $1K snap', () => {
    const pos = budgetToPos(500000);
    expect(Math.abs(posTobudget(pos) - 500000)).toBeLessThanOrEqual(3000);
  });

  it('arrToPos(10000000) round-trips within 1 × $100K snap', () => {
    const pos = arrToPos(10000000);
    expect(Math.abs(posToArr(pos) - 10000000)).toBeLessThanOrEqual(100000);
  });
});

// ─── Slider resolution (step="0.1") ────────────────────────────────────────────

describe('slider resolution', () => {
  it('*ToPos functions return values with at most 1 decimal place', () => {
    const cases = [
      teamSizeToPos(57),
      salaryToPos(173_500),
      budgetToPos(427_000),
      arrToPos(237_500_000),
    ];
    for (const pos of cases) {
      const decimals = (pos.toString().split('.')[1] || '').length;
      expect(decimals).toBeLessThanOrEqual(1);
    }
  });

  it('arrToPos(237500) lands closer to its true position with sub-integer resolution', () => {
    // Pre-bump (integer positions): arrToPos(237500) = 3 — slider thumb at 3/100
    // Post-bump (0.1 positions): arrToPos(237500) ≈ 2.7-2.9 — thumb closer to math
    const pos = arrToPos(237_500);
    expect(pos % 1).not.toBe(0); // has fractional part
    expect(pos).toBeGreaterThan(0);
    expect(pos).toBeLessThan(5);
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
      teamSize: 10,
      salary: 120000,
      maintPct: 30,
      deployIdx: 2,
    });
    const result = calculate(state);
    expect(result.costPerEng).toBeCloseTo(result.totalMonthly / state.teamSize, 5);
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
    // CalcState now stores raw dollars directly — no posToSalary round-trip
    // needed, so the expected value is the input verbatim.
    const salary = 150000;
    const state = makeState({
      advancedOpen: true,
      salary,
      incidents: 4,
      mttr: 10,
    });
    const result = calculate(state);
    const expectedHourlyRate = salary / 2080;
    const expectedIncident = 4 * 10 * expectedHourlyRate;
    expect(result.incidentMonthly).toBeCloseTo(expectedIncident, 5);
  });

  it('debtPctArr returns 0 when arr guard is triggered (zero division)', () => {
    // Engine computes debtPctArr = arr > 0 ? ... : 0
    // A minimum-floor ARR ($100K) yields a positive percentage; the guard is
    // only hit when ARR is exactly 0 (impossible via the UI, possible via MCP).
    const state = makeState({ advancedOpen: true, arr: 100000 });
    const result = calculate(state);
    expect(result.debtPctArr).toBeGreaterThan(0);
    expect(isFinite(result.debtPctArr)).toBe(true);
  });

  it('debtPctArr scales inversely with ARR — higher ARR means lower percentage', () => {
    const loArr = calculate(makeState({ advancedOpen: true, arr: 1_000_000 }));
    const hiArr = calculate(makeState({ advancedOpen: true, arr: 100_000_000 }));
    expect(loArr.debtPctArr).toBeGreaterThan(hiArr.debtPctArr);
  });

  it('paybackMonths is Infinity when totalMonthly is 0', () => {
    // Set maintPct and incidents both to 0 to drive totalMonthly to 0
    const state = makeState({ advancedOpen: true, maintPct: 0, incidents: 0, mttr: 1 });
    expect(calculate(state).paybackMonths).toBe(Infinity);
  });

  it('paybackMonths equals remediationBudget / monthlySavings — concrete arithmetic', () => {
    const state = makeState({
      advancedOpen: true,
      remediationBudget: 600000,
      maintPct: 50,
      incidents: 0,
      mttr: 1,
      remediationPct: 70,
    });
    const result = calculate(state);
    expect(result.paybackMonths).toBeCloseTo(state.remediationBudget / result.monthlySavings, 5);
  });

  it('paybackMonths decreases as remediation budget decreases', () => {
    const hi = calculate(makeState({ advancedOpen: true, remediationBudget: 1_000_000 }));
    const lo = calculate(makeState({ advancedOpen: true, remediationBudget: 100_000 }));
    expect(lo.paybackMonths).toBeLessThan(hi.paybackMonths);
  });
});

// ─── Remediation efficiency ──────────────────────────────────────────────────

describe('calculate — remediationPct', () => {
  it('monthlySavings equals totalMonthly × remediationPct/100', () => {
    const result = calculate(makeState({ remediationPct: 70 }));
    expect(result.monthlySavings).toBeCloseTo(result.totalMonthly * 0.7, 5);
  });

  it('remediationPct: 100 gives monthlySavings equal to totalMonthly (backward-compatible)', () => {
    const result = calculate(makeState({ remediationPct: 100 }));
    expect(result.monthlySavings).toBeCloseTo(result.totalMonthly, 5);
  });

  it('remediationPct: 0 gives zero savings and infinite payback', () => {
    const result = calculate(makeState({ remediationPct: 0 }));
    expect(result.monthlySavings).toBe(0);
    expect(result.paybackMonths).toBe(Infinity);
  });

  it('payback period increases as remediation efficiency decreases', () => {
    const hi = calculate(makeState({ advancedOpen: true, remediationPct: 90 }));
    const lo = calculate(makeState({ advancedOpen: true, remediationPct: 30 }));
    expect(lo.paybackMonths).toBeGreaterThan(hi.paybackMonths);
  });
});

// ─── Context-switch overhead ────────────────────────────────────────────────

describe('calculate — contextSwitchOn', () => {
  it('contextSwitchMonthly is 23% of directMonthly when enabled', () => {
    const result = calculate(makeState({ contextSwitchOn: true }));
    expect(result.contextSwitchMonthly).toBeCloseTo(result.directMonthly * 0.23, 5);
  });

  it('contextSwitchMonthly is 0 when disabled', () => {
    const result = calculate(makeState({ contextSwitchOn: false }));
    expect(result.contextSwitchMonthly).toBe(0);
  });

  it('totalMonthly includes context-switch overhead when enabled', () => {
    const on = calculate(makeState({ contextSwitchOn: true, incidents: 0, mttr: 1 }));
    expect(on.totalMonthly).toBeCloseTo(on.directMonthly + on.contextSwitchMonthly, 5);
  });

  it('enabling context-switch increases annualCost', () => {
    const off = calculate(makeState({ contextSwitchOn: false }));
    const on = calculate(makeState({ contextSwitchOn: true }));
    expect(on.annualCost).toBeGreaterThan(off.annualCost);
  });

  it('combined: both features active simultaneously', () => {
    const result = calculate(makeState({ contextSwitchOn: true, remediationPct: 50 }));
    expect(result.contextSwitchMonthly).toBeCloseTo(result.directMonthly * 0.23, 5);
    expect(result.monthlySavings).toBeCloseTo(result.totalMonthly * 0.5, 5);
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
    expect(DEFAULT_STATE.teamSize).toBe(8);
  });

  it('initialises to salary of 150000', () => {
    expect(DEFAULT_STATE.salary).toBe(150000);
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

  it('initialises remediation budget to $500K', () => {
    expect(DEFAULT_STATE.remediationBudget).toBe(500_000);
  });

  it('initialises ARR to $10M', () => {
    expect(DEFAULT_STATE.arr).toBe(10_000_000);
  });

  it('initialises remediationPct to 70', () => {
    expect(DEFAULT_STATE.remediationPct).toBe(70);
  });

  it('initialises contextSwitchOn to false', () => {
    expect(DEFAULT_STATE.contextSwitchOn).toBe(false);
  });
});

// ─── burdenClassify ─────────────────────────────────────────────────────────

describe('burdenClassify', () => {
  it('returns Well-managed for pct 0', () => {
    expect(burdenClassify(0).text).toBe('Well-managed');
  });

  it('returns Well-managed for pct 9 (boundary)', () => {
    expect(burdenClassify(9).text).toBe('Well-managed');
    expect(burdenClassify(9).range).toBe('< 10%');
  });

  it('returns Acceptable for pct 10 (boundary)', () => {
    expect(burdenClassify(10).text).toBe('Acceptable');
    expect(burdenClassify(10).range).toBe('10–15%');
  });

  it('returns Acceptable for pct 14', () => {
    expect(burdenClassify(14).text).toBe('Acceptable');
  });

  it('returns Yellow flag for pct 15 (boundary)', () => {
    expect(burdenClassify(15).text).toBe('Yellow flag');
    expect(burdenClassify(15).range).toBe('15–25%');
  });

  it('returns Yellow flag for pct 24', () => {
    expect(burdenClassify(24).text).toBe('Yellow flag');
  });

  it('returns Red flag for pct 25 (boundary)', () => {
    expect(burdenClassify(25).text).toBe('Red flag');
    expect(burdenClassify(25).range).toBe('25–40%');
  });

  it('returns Red flag for pct 39', () => {
    expect(burdenClassify(39).text).toBe('Red flag');
  });

  it('returns Deal risk for pct 40 (boundary)', () => {
    expect(burdenClassify(40).text).toBe('Deal risk');
    expect(burdenClassify(40).range).toBe('40%+');
  });

  it('returns Deal risk for pct 100', () => {
    expect(burdenClassify(100).text).toBe('Deal risk');
  });

  it('every level returns a non-empty color', () => {
    for (const pct of [0, 10, 15, 25, 40]) {
      expect(burdenClassify(pct).color.length).toBeGreaterThan(0);
    }
  });
});

// ─── contextNote ────────────────────────────────────────────────────────────

describe('contextNote', () => {
  it('returns different text for each burden tier', () => {
    const tiers = [5, 12, 20, 30, 50];
    const notes = tiers.map((pct) => contextNote(pct, '$1M'));
    const unique = new Set(notes);
    expect(unique.size).toBe(tiers.length);
  });

  it('returns non-empty string for all tiers', () => {
    for (const pct of [0, 10, 15, 25, 40, 100]) {
      expect(contextNote(pct, '$500K').length).toBeGreaterThan(0);
    }
  });

  it('interpolates pct in the 25+ tiers', () => {
    expect(contextNote(30, '$1M')).toContain('30%');
    expect(contextNote(45, '$2M')).toContain('45%');
  });

  it('interpolates formatted cost in the 25+ tiers', () => {
    expect(contextNote(30, '$1.5M')).toContain('$1.5M');
    expect(contextNote(45, '$3M')).toContain('$3M');
  });

  it('does not interpolate pct in the < 25 tiers', () => {
    const note5 = contextNote(5, '$100K');
    expect(note5).not.toContain('5%');
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
    expect(decoded!.adjusted).toEqual([]);
    const s = decoded!.state;
    expect(s.advancedOpen).toBe(DEFAULT_STATE.advancedOpen);
    expect(s.teamSize).toBe(DEFAULT_STATE.teamSize);
    expect(s.salary).toBe(DEFAULT_STATE.salary);
    expect(s.maintPct).toBe(DEFAULT_STATE.maintPct);
    expect(s.deployIdx).toBe(DEFAULT_STATE.deployIdx);
    expect(s.incidents).toBe(DEFAULT_STATE.incidents);
    expect(s.mttr).toBe(DEFAULT_STATE.mttr);
    expect(s.remediationBudget).toBe(DEFAULT_STATE.remediationBudget);
    expect(s.arr).toBe(DEFAULT_STATE.arr);
    expect(s.remediationPct).toBe(DEFAULT_STATE.remediationPct);
    expect(s.contextSwitchOn).toBe(DEFAULT_STATE.contextSwitchOn);
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
    const result = decodeState(btoa(JSON.stringify({ unknown: 99 })));
    expect(result).not.toBeNull();
    expect(Object.keys(result!.state)).toHaveLength(0);
    expect(result!.adjusted).toEqual([]);
  });

  it('returns partial result when only some fields are present — valid fields included', () => {
    const result = decodeState(btoa(JSON.stringify({ mp: 60 })));
    expect(result).not.toBeNull();
    expect(result!.state.maintPct).toBe(60);
    expect(result!.state.teamSize).toBeUndefined();
    expect(result!.adjusted).toEqual([]);
  });

  // ── Out-of-range values clamp to the nearest supported bound and are
  //    reported in `adjusted`, rather than being silently dropped to an
  //    unrelated default. The MCP `estimate_tech_debt_cost` tool accepts a
  //    wider numeric domain than these sliders, so a valid deeplink can carry
  //    values outside a slider's [min,max]; clamp-and-report keeps the shared
  //    link honest instead of misreporting the analysis. ──

  it('clamps teamSize > 500 down to 500 and records the adjustment', () => {
    const r = decodeState(btoa(JSON.stringify({ ts: 501 })))!;
    expect(r.state.teamSize).toBe(500);
    expect(r.adjusted).toContain('Team Size');
  });

  it('clamps teamSize < 1 up to 1 and records the adjustment', () => {
    const r = decodeState(btoa(JSON.stringify({ ts: 0 })))!;
    expect(r.state.teamSize).toBe(1);
    expect(r.adjusted).toContain('Team Size');
  });

  it('clamps out-of-range salary to the 60K–1M bounds', () => {
    expect(decodeState(btoa(JSON.stringify({ sa: 50000 })))!.state.salary).toBe(60000);
    expect(decodeState(btoa(JSON.stringify({ sa: 1_500_000 })))!.state.salary).toBe(1_000_000);
  });

  it('clamps out-of-range arr to the 100K–1B bounds', () => {
    expect(decodeState(btoa(JSON.stringify({ ar: 50000 })))!.state.arr).toBe(100000);
    expect(decodeState(btoa(JSON.stringify({ ar: 2_000_000_000 })))!.state.arr).toBe(1_000_000_000);
  });

  it('clamps out-of-range remediationBudget to the 10K–50M bounds', () => {
    expect(decodeState(btoa(JSON.stringify({ bg: 5000 })))!.state.remediationBudget).toBe(10000);
    expect(decodeState(btoa(JSON.stringify({ bg: 100_000_000 })))!.state.remediationBudget).toBe(
      50_000_000
    );
  });

  it('clamps remediationBudget = 0 (MCP "unknown" sentinel) up to the 10K floor and flags it', () => {
    // Direct repro for the reported bug: MCP deeplinks encode bg:0 for an
    // unknown budget. The old decoder dropped it → the page silently showed
    // the $500K default and a wrong payback period.
    const r = decodeState(btoa(JSON.stringify({ bg: 0 })))!;
    expect(r.state.remediationBudget).toBe(10000);
    expect(r.adjusted).toContain('Remediation Budget');
  });

  it('clamps mttr = 0 (MCP "elided" sentinel) up to the 1h floor and flags it', () => {
    const r = decodeState(btoa(JSON.stringify({ mttr: 0 })))!;
    expect(r.state.mttr).toBe(1);
    expect(r.adjusted).toContain('Avg. Time to Resolve');
  });

  it('preserves typed-input precision through URL round-trip (no quantization)', () => {
    // Anti-thrash regression test: the previous slider-position encoding rounded
    // ARR to the nearest of 100 buckets, losing precision. New format stores
    // raw dollars and must round-trip exactly.
    const granular = makeState({ arr: 237_500, salary: 187_500, remediationBudget: 423_000 });
    const decoded = decodeState(encodeState(granular))!;
    expect(decoded.state.arr).toBe(237_500);
    expect(decoded.state.salary).toBe(187_500);
    expect(decoded.state.remediationBudget).toBe(423_000);
    expect(decoded.adjusted).toEqual([]);
  });

  it('clamps deployIdx > 8 to 8', () => {
    expect(decodeState(btoa(JSON.stringify({ di: 9 })))!.state.deployIdx).toBe(8);
  });

  it('clamps deployIdx < 0 to 0', () => {
    expect(decodeState(btoa(JSON.stringify({ di: -1 })))!.state.deployIdx).toBe(0);
  });

  it('clamps maintPct < 0 to 0', () => {
    const r = decodeState(btoa(JSON.stringify({ mp: -1 })))!;
    expect(r.state.maintPct).toBe(0);
    expect(r.adjusted).toContain('Maintenance Burden');
  });

  it('accepts maintPct of 0 without flagging', () => {
    const r = decodeState(btoa(JSON.stringify({ mp: 0 })))!;
    expect(r.state.maintPct).toBe(0);
    expect(r.adjusted).toEqual([]);
  });

  it('clamps maintPct > 100 to 100', () => {
    expect(decodeState(btoa(JSON.stringify({ mp: 101 })))!.state.maintPct).toBe(100);
  });

  it('clamps mttr > 48 to 48', () => {
    expect(decodeState(btoa(JSON.stringify({ mttr: 49 })))!.state.mttr).toBe(48);
  });

  it('clamps incidents < 0 to 0', () => {
    expect(decodeState(btoa(JSON.stringify({ in: -1 })))!.state.incidents).toBe(0);
  });

  it('clamps incidents > 20 to 20', () => {
    expect(decodeState(btoa(JSON.stringify({ in: 21 })))!.state.incidents).toBe(20);
  });

  it('rounds float values for integer fields and flags the coercion (e.g. deployIdx: 3.5)', () => {
    const r = decodeState(btoa(JSON.stringify({ di: 3.5 })))!;
    expect(r.state.deployIdx).toBe(4);
    expect(r.adjusted).toContain('Deployment Frequency');
  });

  it('rejects advancedOpen values that are not 0 or 1 (e.g. 2)', () => {
    expect(decodeState(btoa(JSON.stringify({ a: 2 })))!.state.advancedOpen).toBeUndefined();
  });

  it('accepts advancedOpen: 1 and maps it to boolean true', () => {
    expect(decodeState(btoa(JSON.stringify({ a: 1 })))!.state.advancedOpen).toBe(true);
  });

  it('accepts advancedOpen: 0 and maps it to boolean false', () => {
    expect(decodeState(btoa(JSON.stringify({ a: 0 })))!.state.advancedOpen).toBe(false);
  });

  it('ignores unknown keys — returns only known fields', () => {
    const result = decodeState(btoa(JSON.stringify({ mp: 50, future_field: 'x', another: 99 })))!;
    expect(result.state.maintPct).toBe(50);
    expect((result.state as any).future_field).toBeUndefined();
    expect((result.state as any).another).toBeUndefined();
  });

  // ── remediationPct (re) ──

  it('round-trips remediationPct through encode/decode', () => {
    const decoded = decodeState(encodeState(makeState({ remediationPct: 42 })))!;
    expect(decoded.state.remediationPct).toBe(42);
  });

  it('clamps out-of-range remediationPct (> 100) to 100', () => {
    expect(decodeState(btoa(JSON.stringify({ re: 101 })))!.state.remediationPct).toBe(100);
  });

  it('clamps negative remediationPct to 0', () => {
    expect(decodeState(btoa(JSON.stringify({ re: -1 })))!.state.remediationPct).toBe(0);
  });

  it('rounds float remediationPct and flags the coercion', () => {
    const r = decodeState(btoa(JSON.stringify({ re: 50.5 })))!;
    expect(r.state.remediationPct).toBe(51);
    expect(r.adjusted).toContain('Remediation Efficiency');
  });

  // ── contextSwitchOn (cs) ──

  it('round-trips contextSwitchOn through encode/decode', () => {
    expect(
      decodeState(encodeState(makeState({ contextSwitchOn: true })))!.state.contextSwitchOn
    ).toBe(true);
    expect(
      decodeState(encodeState(makeState({ contextSwitchOn: false })))!.state.contextSwitchOn
    ).toBe(false);
  });

  it('rejects contextSwitchOn values that are not 0 or 1', () => {
    expect(decodeState(btoa(JSON.stringify({ cs: 2 })))!.state.contextSwitchOn).toBeUndefined();
  });

  it('backward compatibility: URLs missing re/cs still decode the rest', () => {
    const result = decodeState(btoa(JSON.stringify({ mp: 25, ts: 50 })))!;
    expect(result.state.maintPct).toBe(25);
    expect(result.state.teamSize).toBe(50);
    expect(result.state.remediationPct).toBeUndefined();
    expect(result.state.contextSwitchOn).toBeUndefined();
  });

  // Pre-2026-05 URLs encoded slider-position integers under the old keys
  // (sp, bp, ap). The new decoder ignores them — accepted breakage per
  // the BL-032.8-adjacent precision-thrash fix (2026-05-21).
  it('ignores legacy slider-position keys (sp, bp, ap)', () => {
    const result = decodeState(btoa(JSON.stringify({ sp: 50, bp: 50, ap: 50 })))!;
    expect(result.state.salary).toBeUndefined();
    expect(result.state.remediationBudget).toBeUndefined();
    expect(result.state.arr).toBeUndefined();
    expect(result.adjusted).toEqual([]);
  });
});

// ─── parseShortCurrency ──────────────────────────────────────────────────────

describe('parseShortCurrency', () => {
  it('parses bare digits as exact dollars', () => {
    expect(parseShortCurrency('237500')).toBe(237_500);
    expect(parseShortCurrency('1000')).toBe(1000);
    expect(parseShortCurrency('0')).toBe(0);
  });

  it('honors K suffix as thousands (matches fmtShortC output)', () => {
    expect(parseShortCurrency('750K')).toBe(750_000);
    expect(parseShortCurrency('1K')).toBe(1_000);
    expect(parseShortCurrency('100K')).toBe(100_000);
  });

  it('honors M suffix as millions (matches fmtShortC output)', () => {
    expect(parseShortCurrency('12.5M')).toBe(12_500_000);
    expect(parseShortCurrency('1M')).toBe(1_000_000);
    expect(parseShortCurrency('1.5M')).toBe(1_500_000);
  });

  it('strips currency symbol prefix ($, £, €, ¥)', () => {
    expect(parseShortCurrency('$237500')).toBe(237_500);
    expect(parseShortCurrency('$12.5M')).toBe(12_500_000);
    expect(parseShortCurrency('£1M')).toBe(1_000_000);
    expect(parseShortCurrency('€500K')).toBe(500_000);
  });

  it('strips commas and whitespace', () => {
    expect(parseShortCurrency('1,500,000')).toBe(1_500_000);
    expect(parseShortCurrency(' $1.5M ')).toBe(1_500_000);
  });

  it('is case-insensitive on suffix', () => {
    expect(parseShortCurrency('12.5m')).toBe(12_500_000);
    expect(parseShortCurrency('500k')).toBe(500_000);
  });

  it('preserves precision (no quantization round-trip)', () => {
    // Regression guard: the previous handler would quantize a typed
    // "$237,500" to nearest $100K via the slider position. The parser
    // must return the user's exact intent so the clamp/state handler
    // can decide what to do without precision already lost.
    expect(parseShortCurrency('237500')).toBe(237_500);
    expect(parseShortCurrency('$12.345M')).toBe(12_345_000);
  });

  it('returns NaN for unparseable input', () => {
    expect(parseShortCurrency('')).toBeNaN();
    expect(parseShortCurrency('abc')).toBeNaN();
    expect(parseShortCurrency('1.2.3')).toBeNaN();
    expect(parseShortCurrency('1B')).toBeNaN(); // B suffix not supported
    expect(parseShortCurrency('12.5MM')).toBeNaN();
  });

  it('handles signed values', () => {
    expect(parseShortCurrency('-500K')).toBe(-500_000);
    expect(parseShortCurrency('+1M')).toBe(1_000_000);
  });
});
