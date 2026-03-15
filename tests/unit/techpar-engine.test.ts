/**
 * Unit Tests for TechPar Engine
 *
 * Tests all pure functions:
 * - compute(): null guards, cash/GAAP basis, KPI formulas
 * - getZone(): boundary tests for all five stages
 * - buildTrajectory(): data point count and frame-specific behavior
 * - formatDollars() / formatPercent(): formatting correctness
 * - Data integrity: signal copy coverage, benchmark ranges, zone ordering
 */

import { describe, it, expect } from 'vitest';
import {
  compute,
  getZone,
  buildTrajectory,
  formatDollars,
  formatPercent,
  DEFAULT_INPUTS,
  zoneLabel,
  kpiClass,
} from '../../src/utils/techpar-engine';
import type { TechParInputs, StageConfig, Zone } from '../../src/utils/techpar-engine';
import { STAGES, STAGE_KEYS } from '../../src/data/techpar/stages';
import { SIGNAL_COPY } from '../../src/data/techpar/signal-copy';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInputs(overrides: Partial<TechParInputs> = {}): TechParInputs {
  return { ...DEFAULT_INPUTS, ...overrides };
}

/** Standard inputs for testing: $10M ARR, $50K/mo infra, $3M R&D */
const STANDARD_INPUTS: TechParInputs = {
  ...DEFAULT_INPUTS,
  arr: 10_000_000,
  infraHosting: 50_000,
  rdOpEx: 3_000_000,
  infraPersonnel: 500_000,
  rdCapEx: 500_000,
};

// ─── compute() null guards ───────────────────────────────────────────────────

describe('compute() null guards', () => {
  it('returns null when arr is 0', () => {
    expect(compute(makeInputs({ arr: 0, infraHosting: 5000 }))).toBeNull();
  });

  it('returns null when infraHosting is 0', () => {
    expect(compute(makeInputs({ arr: 10_000_000, infraHosting: 0 }))).toBeNull();
  });
});

// ─── compute() cash vs GAAP basis ────────────────────────────────────────────

describe('compute() basis calculations', () => {
  it('cash basis includes rdCapEx in total', () => {
    const result = compute(makeInputs({
      arr: 10_000_000,
      infraHosting: 50_000,
      rdOpEx: 2_000_000,
      rdCapEx: 500_000,
      capexView: 'cash',
    }));
    expect(result).not.toBeNull();
    // total = (50000*12) + 0 + 2000000 + 500000 = 3100000
    expect(result!.totalCash).toBe(3_100_000);
    expect(result!.total).toBe(3_100_000);
  });

  it('GAAP basis excludes rdCapEx from total', () => {
    const result = compute(makeInputs({
      arr: 10_000_000,
      infraHosting: 50_000,
      rdOpEx: 2_000_000,
      rdCapEx: 500_000,
      capexView: 'gaap',
    }));
    expect(result).not.toBeNull();
    // totalGAAP = (50000*12) + 0 + 2000000 = 2600000
    expect(result!.totalGAAP).toBe(2_600_000);
    expect(result!.total).toBe(2_600_000);
  });
});

// ─── compute() KPI formulas ──────────────────────────────────────────────────

describe('compute() KPI formulas', () => {
  it('totalTechPct is correct at known input values', () => {
    const result = compute(makeInputs({
      arr: 10_000_000,
      infraHosting: 50_000,
      rdOpEx: 3_000_000,
    }));
    // total = 600000 + 3000000 = 3600000; pct = 36%
    expect(result!.totalTechPct).toBeCloseTo(36, 1);
  });

  it('infraHostingPct annualizes monthly correctly', () => {
    const result = compute(makeInputs({
      arr: 10_000_000,
      infraHosting: 50_000,
    }));
    // (50000 * 12) / 10M * 100 = 6%
    expect(result!.kpis.infraHostingPct).toBeCloseTo(6, 1);
  });

  it('blendedInfra includes both hosting and personnel', () => {
    const result = compute(makeInputs({
      arr: 10_000_000,
      infraHosting: 50_000,
      infraPersonnel: 400_000,
    }));
    // (600000 + 400000) / 10M * 100 = 10%
    expect(result!.kpis.blendedInfra).toBeCloseTo(10, 1);
  });

  it('revenuePerEngineer is null when engFTE is 0', () => {
    const result = compute(makeInputs({
      arr: 10_000_000,
      infraHosting: 50_000,
      engFTE: 0,
    }));
    expect(result!.kpis.revenuePerEngineer).toBeNull();
  });

  it('rdCapExOfRD is null when both rdOpEx and rdCapEx are 0', () => {
    const result = compute(makeInputs({
      arr: 10_000_000,
      infraHosting: 50_000,
      rdOpEx: 0,
      rdCapEx: 0,
    }));
    expect(result!.kpis.rdCapExOfRD).toBeNull();
  });

  it('Deep Dive rdOpEx sums engCost + prodCost + toolingCost', () => {
    const result = compute(makeInputs({
      arr: 10_000_000,
      infraHosting: 50_000,
      mode: 'deepdive',
      engCost: 1_500_000,
      prodCost: 500_000,
      toolingCost: 200_000,
      rdOpEx: 999_999, // should be ignored in deep dive
    }));
    // rdOpEx = 1500000 + 500000 + 200000 = 2200000
    // total = 600000 + 2200000 = 2800000; pct = 28%
    expect(result!.totalTechPct).toBeCloseTo(28, 1);
  });
});

// ─── getZone() boundary tests ────────────────────────────────────────────────

describe('getZone() boundary tests', () => {
  const stages = STAGE_KEYS;
  const zones: Zone[] = ['underinvest', 'ahead', 'healthy', 'above', 'elevated', 'critical'];

  for (const stageKey of stages) {
    const config = STAGES[stageKey] as StageConfig;

    describe(`${config.label}`, () => {
      it('returns underinvest below the underinvest threshold', () => {
        expect(getZone(config.zones.underinvest - 1, config)).toBe('underinvest');
      });

      it('returns ahead at the underinvest threshold', () => {
        expect(getZone(config.zones.underinvest, config)).toBe('ahead');
      });

      it('returns ahead just below the healthy floor', () => {
        expect(getZone(config.zones.lo - 0.1, config)).toBe('ahead');
      });

      it('returns healthy at the healthy floor', () => {
        expect(getZone(config.zones.lo, config)).toBe('healthy');
      });

      it('returns healthy at the healthy ceiling', () => {
        expect(getZone(config.zones.hi, config)).toBe('healthy');
      });

      it('returns above just above the healthy ceiling', () => {
        expect(getZone(config.zones.hi + 0.1, config)).toBe('above');
      });

      it('returns elevated at the above threshold', () => {
        expect(getZone(config.zones.above, config)).toBe('elevated');
      });

      it('returns critical at the critical threshold', () => {
        expect(getZone(config.zones.critical, config)).toBe('critical');
      });
    });
  }
});

// ─── buildTrajectory() ───────────────────────────────────────────────────────

describe('buildTrajectory()', () => {
  it('returns 37 data points', () => {
    const config = STAGES['series_bc'] as StageConfig;
    const traj = buildTrajectory(STANDARD_INPUTS, config);
    expect(traj.spend).toHaveLength(37);
    expect(traj.bandLo).toHaveLength(37);
    expect(traj.bandHi).toHaveLength(37);
    expect(traj.revenue).toHaveLength(37);
    expect(traj.labels).toHaveLength(37);
  });

  it('convergence frame includes revenue dataset', () => {
    const config = STAGES['series_bc'] as StageConfig;
    const traj = buildTrajectory(STANDARD_INPUTS, config);
    expect(traj.frame).toBe('convergence');
    expect(traj.revenue.length).toBe(37);
    expect(traj.revenue[0]).toBeGreaterThan(0);
  });

  it('dollars frame flag is set for PE stage', () => {
    const config = STAGES['pe'] as StageConfig;
    const traj = buildTrajectory({ ...STANDARD_INPUTS, stage: 'pe' }, config);
    expect(traj.frame).toBe('dollars');
  });
});

// ─── Formatters ──────────────────────────────────────────────────────────────

describe('formatDollars()', () => {
  it('formats thousands correctly', () => {
    expect(formatDollars(5000)).toBe('$5K');
    expect(formatDollars(50_000)).toBe('$50K');
    expect(formatDollars(999_999)).toBe('$1000K');
  });

  it('formats millions correctly', () => {
    expect(formatDollars(1_000_000)).toBe('$1.0M');
    expect(formatDollars(2_500_000)).toBe('$2.5M');
    expect(formatDollars(10_000_000)).toBe('$10.0M');
  });

  it('formats billions correctly', () => {
    expect(formatDollars(1_000_000_000)).toBe('$1.0B');
    expect(formatDollars(2_500_000_000)).toBe('$2.5B');
  });

  it('handles negative values', () => {
    expect(formatDollars(-5_000_000)).toBe('-$5.0M');
  });

  it('handles non-finite values', () => {
    expect(formatDollars(Infinity)).toBe('\u2014');
    expect(formatDollars(NaN)).toBe('\u2014');
  });
});

describe('formatPercent()', () => {
  it('formats with default 1 decimal', () => {
    expect(formatPercent(45.678)).toBe('45.7%');
  });

  it('formats with specified decimals', () => {
    expect(formatPercent(45.678, 0)).toBe('46%');
    expect(formatPercent(45.678, 2)).toBe('45.68%');
  });

  it('handles non-finite values', () => {
    expect(formatPercent(Infinity)).toBe('\u2014');
  });
});

// ─── Data integrity ──────────────────────────────────────────────────────────

describe('Data integrity', () => {
  it('all 30 stage/zone combinations have defined copy in signal-copy.ts', () => {
    const allZones: Zone[] = ['underinvest', 'ahead', 'healthy', 'above', 'elevated', 'critical'];
    for (const stageKey of STAGE_KEYS) {
      for (const zone of allZones) {
        const copy = SIGNAL_COPY[stageKey]?.[zone];
        expect(copy, `Missing copy for ${stageKey}/${zone}`).toBeDefined();
        expect(copy.headline, `Empty headline for ${stageKey}/${zone}`).toBeTruthy();
        expect(copy.body, `Empty body for ${stageKey}/${zone}`).toBeTruthy();
      }
    }
  });

  it('all stage benchmark ranges have lo < hi for every category', () => {
    for (const stageKey of STAGE_KEYS) {
      const config = STAGES[stageKey] as StageConfig;
      const b = config.benchmarks;
      expect(b.infraHosting[0], `${stageKey} infraHosting`).toBeLessThan(b.infraHosting[1]);
      expect(b.infraPersonnel[0], `${stageKey} infraPersonnel`).toBeLessThan(b.infraPersonnel[1]);
      expect(b.rdOpEx[0], `${stageKey} rdOpEx`).toBeLessThan(b.rdOpEx[1]);
      expect(b.rdCapExOfRD[0], `${stageKey} rdCapExOfRD`).toBeLessThanOrEqual(b.rdCapExOfRD[1]);
      expect(b.total[0], `${stageKey} total`).toBeLessThan(b.total[1]);
    }
  });

  it('all zone thresholds are in strictly ascending order within each stage', () => {
    for (const stageKey of STAGE_KEYS) {
      const config = STAGES[stageKey] as StageConfig;
      const z = config.zones;
      expect(z.underinvest, `${stageKey}`).toBeLessThan(z.lo);
      expect(z.lo, `${stageKey}`).toBeLessThan(z.hi);
      expect(z.hi, `${stageKey}`).toBeLessThan(z.above);
      expect(z.above, `${stageKey}`).toBeLessThan(z.critical);
    }
  });
});
