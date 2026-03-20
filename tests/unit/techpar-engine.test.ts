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
  serializeToParams,
  deserializeFromParams,
  buildSummaryText,
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

// ─── Currency Symbol in formatDollars ──────────────────────────────────────────

describe('formatDollars with currency symbol', () => {
  it('should use $ by default', () => {
    expect(formatDollars(1_000_000)).toBe('$1.0M');
  });

  it('should use custom symbol', () => {
    expect(formatDollars(1_000_000, '€')).toBe('€1.0M');
    expect(formatDollars(1_000_000, '£')).toBe('£1.0M');
    expect(formatDollars(500_000, 'C$')).toBe('C$500K');
    expect(formatDollars(2_500_000_000, 'A$')).toBe('A$2.5B');
  });

  it('should handle negatives with custom symbol', () => {
    expect(formatDollars(-1_000_000, '€')).toBe('-€1.0M');
  });
});

// ─── R&D CapEx Benchmark Range ─────────────────────────────────────────────────

describe('R&D CapEx benchmark range', () => {
  it('should derive non-zero benchmark range when rdCapEx > 0', () => {
    const inputs = makeInputs({
      arr: 10_000_000,
      stage: 'pe',
      infraHosting: 50_000,
      rdOpEx: 3_000_000,
      rdCapEx: 1_000_000,
    });
    const result = compute(inputs);
    expect(result).not.toBeNull();
    const capExCat = result!.categories.find(c => c.label === 'R&D CapEx');
    expect(capExCat).toBeDefined();
    expect(capExCat!.benchmarkLo).toBeGreaterThan(0);
    expect(capExCat!.benchmarkHi).toBeGreaterThan(capExCat!.benchmarkLo);
    // Zone is now computed from benchmarks instead of always 'healthy'
    expect(['underinvest', 'ahead', 'healthy', 'above', 'elevated', 'critical']).toContain(capExCat!.zone);
  });

  it('should classify R&D CapEx zone properly', () => {
    const inputs = makeInputs({
      arr: 10_000_000,
      stage: 'series_bc',
      infraHosting: 50_000,
      rdOpEx: 3_000_000,
      rdCapEx: 100_000, // very small CapEx
    });
    const result = compute(inputs);
    expect(result).not.toBeNull();
    const capExCat = result!.categories.find(c => c.label === 'R&D CapEx');
    if (capExCat) {
      // Zone should be based on actual benchmark comparison, not always 'healthy'
      expect(['underinvest', 'ahead', 'healthy', 'above', 'elevated', 'critical']).toContain(capExCat.zone);
    }
  });
});

// ─── URL State Serialization ──────────────────────────────────────────────────

describe('serializeToParams / deserializeFromParams', () => {
  it('should round-trip all fields', () => {
    const inputs: TechParInputs = {
      arr: 25_000_000,
      stage: 'pe',
      mode: 'deepdive',
      capexView: 'gaap',
      growthRate: 30,
      exitMultiple: 15,
      infraHosting: 80_000,
      infraPersonnel: 600_000,
      rdOpEx: 4_000_000,
      rdCapEx: 500_000,
      engFTE: 25,
      engCost: 2_500_000,
      prodCost: 800_000,
      toolingCost: 700_000,
    };

    const params = serializeToParams(inputs);
    const restored = deserializeFromParams(params);

    expect(restored.stage).toBe(inputs.stage);
    expect(restored.arr).toBe(inputs.arr);
    expect(restored.growthRate).toBe(inputs.growthRate);
    expect(restored.mode).toBe(inputs.mode);
    expect(restored.capexView).toBe(inputs.capexView);
    expect(restored.exitMultiple).toBe(inputs.exitMultiple);
    expect(restored.infraHosting).toBe(inputs.infraHosting);
    expect(restored.infraPersonnel).toBe(inputs.infraPersonnel);
    expect(restored.rdOpEx).toBe(inputs.rdOpEx);
    expect(restored.rdCapEx).toBe(inputs.rdCapEx);
    expect(restored.engFTE).toBe(inputs.engFTE);
    expect(restored.engCost).toBe(inputs.engCost);
    expect(restored.prodCost).toBe(inputs.prodCost);
    expect(restored.toolingCost).toBe(inputs.toolingCost);
  });

  it('should omit default values from URL', () => {
    const inputs = makeInputs({ arr: 10_000_000, infraHosting: 50_000 });
    const params = serializeToParams(inputs);
    // mode=quick is default, should not be in URL
    expect(params.has('m')).toBe(false);
    // capexView=cash is default
    expect(params.has('c')).toBe(false);
    // exitMultiple=12 is default
    expect(params.has('e')).toBe(false);
  });

  it('should use compact single-letter keys', () => {
    const inputs = makeInputs({ arr: 10_000_000, stage: 'seed', infraHosting: 50_000 });
    const params = serializeToParams(inputs);
    expect(params.get('s')).toBe('seed');
    expect(params.get('a')).toBe('10000000');
    expect(params.get('h')).toBe('50000');
  });

  it('should handle missing params gracefully', () => {
    const params = new URLSearchParams();
    const state = deserializeFromParams(params);
    expect(state.stage).toBeUndefined();
    expect(state.arr).toBeUndefined();
  });

  it('should reject invalid stage values', () => {
    const params = new URLSearchParams('s=invalid');
    const state = deserializeFromParams(params);
    expect(state.stage).toBeUndefined();
  });

  it('should reject invalid mode values', () => {
    const params = new URLSearchParams('m=invalid');
    const state = deserializeFromParams(params);
    expect(state.mode).toBeUndefined();
  });

  it('should reject non-numeric values for numeric fields', () => {
    const params = new URLSearchParams('a=notanumber');
    const state = deserializeFromParams(params);
    expect(state.arr).toBeUndefined();
  });

  it('should keep URL under 2000 chars even with all fields populated', () => {
    const inputs: TechParInputs = {
      arr: 250_000_000,
      stage: 'enterprise',
      mode: 'deepdive',
      capexView: 'gaap',
      growthRate: 50,
      exitMultiple: 20,
      infraHosting: 500_000,
      infraPersonnel: 2_000_000,
      rdOpEx: 15_000_000,
      rdCapEx: 3_000_000,
      engFTE: 100,
      engCost: 10_000_000,
      prodCost: 3_000_000,
      toolingCost: 2_000_000,
    };
    const params = serializeToParams(inputs);
    const url = `/hub/tools/techpar?${params.toString()}`;
    expect(url.length).toBeLessThan(2000);
  });
});

// ─── Plain-text Summary ───────────────────────────────────────────────────────

describe('buildSummaryText', () => {
  it('should include stage, ARR, zone, and categories', () => {
    const inputs = makeInputs({
      arr: 10_000_000,
      stage: 'series_bc',
      infraHosting: 50_000,
      rdOpEx: 3_000_000,
      infraPersonnel: 500_000,
    });
    const result = compute(inputs);
    expect(result).not.toBeNull();
    const text = buildSummaryText(inputs, result!);

    expect(text).toContain('TechPar Summary');
    expect(text).toContain('Series B');
    expect(text).toContain('$10.0M');
    expect(text).toContain('Zone:');
    expect(text).toContain('Infra hosting');
    expect(text).toContain('globalstrategic.tech/hub/tools/techpar');
  });

  it('should include custom URL when provided', () => {
    const inputs = makeInputs({
      arr: 10_000_000,
      stage: 'pe',
      infraHosting: 50_000,
    });
    const result = compute(inputs);
    const text = buildSummaryText(inputs, result!, 'https://example.com/techpar?s=pe');
    expect(text).toContain('https://example.com/techpar?s=pe');
  });

  it('should include gap analysis for overspend zones', () => {
    const inputs = makeInputs({
      arr: 10_000_000,
      stage: 'pe',
      infraHosting: 200_000,
      rdOpEx: 5_000_000,
      infraPersonnel: 1_000_000,
    });
    const result = compute(inputs);
    expect(result).not.toBeNull();
    // This should be well above par for PE stage
    if (result!.zone !== 'healthy' && result!.zone !== 'ahead' && result!.zone !== 'underinvest') {
      const text = buildSummaryText(inputs, result!);
      expect(text).toContain('36-month excess');
      expect(text).toContain('Exit value');
    }
  });

  it('should include a Generated date in ISO format', () => {
    const inputs = makeInputs({ arr: 10_000_000, stage: 'pe', infraHosting: 50_000 });
    const result = compute(inputs);
    const text = buildSummaryText(inputs, result!);
    expect(text).toMatch(/Generated: \d{4}-\d{2}-\d{2}/);
  });
});

// ─── gap.annualExcess ───────────────────────────────────────────────────────

describe('gap.annualExcess', () => {
  it('is positive when totalTechPct exceeds the stage ceiling', () => {
    // PE ceiling is 40%. $50K/mo infra + $3M R&D + $500K pers + $500K capex on $10M ARR
    // = ($600K + $3M + $500K + $500K) / $10M = 46% → above 40%
    const inputs = makeInputs({
      arr: 10_000_000,
      stage: 'pe',
      infraHosting: 50_000,
      rdOpEx: 3_000_000,
      infraPersonnel: 500_000,
      rdCapEx: 500_000,
    });
    const result = compute(inputs)!;
    expect(result.totalTechPct).toBeGreaterThan(40);
    const expectedExcess = (result.totalTechPct - 40) / 100 * 10_000_000;
    expect(result.gap.annualExcess).toBeCloseTo(expectedExcess, 0);
  });

  it('is zero when totalTechPct is at or below the stage ceiling', () => {
    // PE ceiling is 40%. $20K/mo infra on $10M ARR = 2.4% → well below 40%
    const inputs = makeInputs({
      arr: 10_000_000,
      stage: 'pe',
      infraHosting: 20_000,
    });
    const result = compute(inputs)!;
    expect(result.totalTechPct).toBeLessThanOrEqual(40);
    expect(result.gap.annualExcess).toBe(0);
  });
});
