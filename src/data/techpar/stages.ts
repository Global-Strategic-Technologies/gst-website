/**
 * TechPar - Stage configuration data
 *
 * Five stage definitions with zone thresholds, per-category benchmark ranges,
 * and trajectory frame type. Populated from the POC's STAGES object.
 */

import type { StageConfig } from '../../utils/techpar-engine';

export const STAGES: Record<string, StageConfig> = {
  seed: {
    key: 'seed',
    label: 'Seed / Pre-A',
    frame: 'convergence',
    note: 'At seed stage, a high technology cost ratio is expected. Infrastructure often leads revenue. What matters is whether the ratio trends down as ARR scales.',
    zones: { underinvest: 15, lo: 60, hi: 100, above: 115, critical: 130 },
    benchmarks: {
      infraHosting: [8, 28],
      infraPersonnel: [3, 8],
      rdOpEx: [50, 80],
      rdCapExOfRD: [0, 15],
      total: [60, 100],
    },
  },
  series_a: {
    key: 'series_a',
    label: 'Series A',
    frame: 'convergence',
    note: 'Series A companies often carry cost structures from rapid early growth. The key question is whether technology spend as a percentage of revenue is declining as you scale.',
    zones: { underinvest: 12, lo: 45, hi: 75, above: 90, critical: 105 },
    benchmarks: {
      infraHosting: [8, 22],
      infraPersonnel: [3, 7],
      rdOpEx: [35, 55],
      rdCapExOfRD: [10, 30],
      total: [45, 75],
    },
  },
  series_bc: {
    key: 'series_bc',
    label: 'Series B\u2013C',
    frame: 'convergence',
    note: 'At Series B\u2013C, technology spend should be converging toward a sustainable ratio. Persistent overspend signals architectural issues that compound as you scale toward profitability.',
    zones: { underinvest: 10, lo: 35, hi: 55, above: 68, critical: 80 },
    benchmarks: {
      infraHosting: [8, 18],
      infraPersonnel: [2, 6],
      rdOpEx: [25, 40],
      rdCapExOfRD: [20, 40],
      total: [35, 55],
    },
  },
  pe: {
    key: 'pe',
    label: 'PE-backed',
    frame: 'dollars',
    note: 'In a PE context, every percentage point above the 40% ceiling translates directly to EBITDA compression and exit value. Technology cost optimization is a financial engineering lever.',
    zones: { underinvest: 8, lo: 25, hi: 40, above: 50, critical: 60 },
    benchmarks: {
      infraHosting: [8, 15],
      infraPersonnel: [2, 5],
      rdOpEx: [15, 25],
      rdCapExOfRD: [25, 45],
      total: [25, 40],
    },
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise',
    frame: 'dollars',
    note: 'At enterprise scale, technology spend as a percentage of revenue is typically well below early-stage norms. Persistent spend above 32% warrants a structural review.',
    zones: { underinvest: 6, lo: 18, hi: 32, above: 40, critical: 50 },
    benchmarks: {
      infraHosting: [5, 12],
      infraPersonnel: [1, 4],
      rdOpEx: [10, 20],
      rdCapExOfRD: [30, 50],
      total: [18, 32],
    },
  },
};

export const STAGE_KEYS = ['seed', 'series_a', 'series_bc', 'pe', 'enterprise'] as const;
