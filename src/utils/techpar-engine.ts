/**
 * TechPar - pure calculation engine
 *
 * All functions are stateless and side-effect free, making them
 * directly importable by unit tests and by the page <script> block.
 */

import { STAGES } from '../data/techpar/stages';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Stage = 'seed' | 'series_a' | 'series_bc' | 'pe' | 'enterprise';
export type Frame = 'convergence' | 'dollars';
export type Zone = 'underinvest' | 'ahead' | 'healthy' | 'above' | 'elevated' | 'critical';
export type Mode = 'quick' | 'deepdive';
export type CapExView = 'cash' | 'gaap';

export interface StageConfig {
  key: Stage;
  label: string;
  frame: Frame;
  note: string;
  zones: {
    underinvest: number;
    lo: number;
    hi: number;
    above: number;
    critical: number;
  };
  benchmarks: {
    infraHosting: [number, number];
    infraPersonnel: [number, number];
    rdOpEx: [number, number];
    rdCapExOfRD: [number, number];
    total: [number, number];
  };
}

export interface TechParInputs {
  arr: number;
  stage: Stage;
  mode: Mode;
  capexView: CapExView;
  growthRate: number;
  exitMultiple: number;
  infraHosting: number;
  infraPersonnel: number;
  rdOpEx: number;
  rdCapEx: number;
  engFTE: number;
  engCost: number;
  prodCost: number;
  toolingCost: number;
}

export interface CategoryKPI {
  label: string;
  value: number;
  pctArr: number;
  benchmarkLo: number;
  benchmarkHi: number;
  zone: Zone;
  colorVar: string;
}

export interface TechParResult {
  total: number;
  totalCash: number;
  totalGAAP: number;
  totalTechPct: number;
  zone: Zone;
  stageConfig: StageConfig;
  categories: CategoryKPI[];
  kpis: {
    annualTechCost: number;
    infraHostingPct: number;
    infraPersonnelPct: number | null;
    rdOpExPct: number | null;
    rdCapExPct: number | null;
    rdCapExOfRD: number | null;
    blendedInfra: number;
    revenuePerEngineer: number | null;
    engPctOfRD: number | null;
    prodPctOfRD: number | null;
  };
  gap: {
    cumulative36: number;
    exitValue: number;
    underinvestGap: number;
    annualAdvantage: number;
  };
}

export interface TrajectoryDataset {
  label: string;
  data: number[];
  borderColor: string;
  borderWidth: number;
  borderDash?: number[];
  pointRadius: number;
  fill: boolean | { target: string; above: string; below: string };
  tension: number;
  hidden?: boolean;
}

// ─── Default inputs ──────────────────────────────────────────────────────────

export const DEFAULT_INPUTS: TechParInputs = {
  arr: 0,
  stage: 'series_bc',
  mode: 'quick',
  capexView: 'cash',
  growthRate: 20,
  exitMultiple: 12,
  infraHosting: 0,
  infraPersonnel: 0,
  rdOpEx: 0,
  rdCapEx: 0,
  engFTE: 0,
  engCost: 0,
  prodCost: 0,
  toolingCost: 0,
};

// ─── Zone classification ─────────────────────────────────────────────────────

export function getZone(pct: number, config: StageConfig): Zone {
  if (pct < config.zones.underinvest) return 'underinvest';
  if (pct < config.zones.lo) return 'ahead';
  if (pct <= config.zones.hi) return 'healthy';
  if (pct < config.zones.above) return 'above';
  if (pct < config.zones.critical) return 'elevated';
  return 'critical';
}

// ─── Zone display helpers ────────────────────────────────────────────────────

export function zoneColorVar(zone: Zone): string {
  return `--techpar-zone-${zone}`;
}

export function zoneBgVar(zone: Zone): string {
  return `--techpar-zone-${zone}-bg`;
}

export function zoneLabel(zone: Zone): string {
  const labels: Record<Zone, string> = {
    underinvest: 'Underinvestment signal',
    ahead: 'Efficiency advantage',
    healthy: 'At par',
    above: 'Above par',
    elevated: 'Elevated risk',
    critical: 'Critical',
  };
  return labels[zone];
}

// ─── KPI classification ──────────────────────────────────────────────────────

export function kpiClass(pct: number, lo: number, hi: number): 'pos' | 'warn' | 'bad' {
  if (pct <= lo) return 'pos';
  if (pct <= hi) return 'warn';
  return 'bad';
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export function formatDollars(n: number): string {
  if (!isFinite(n) || n === null) return '\u2014';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + '$' + Math.round(abs / 1e3) + 'K';
  return sign + '$' + Math.round(abs);
}

export function formatPercent(n: number, decimals: number = 1): string {
  if (!isFinite(n)) return '\u2014';
  return n.toFixed(decimals) + '%';
}

// ─── Gap computations ────────────────────────────────────────────────────────

function monthlyGrowthFactor(annualRate: number): number {
  return Math.pow(1 + annualRate / 100, 1 / 12) - 1;
}

function computeGap(pctArr: number, arr: number, hi: number, growthRate: number): number {
  const mg = monthlyGrowthFactor(growthRate);
  let gap = 0;
  for (let m = 0; m < 36; m++) {
    const monthlyRev = (arr / 12) * Math.pow(1 + mg, m);
    gap += Math.max(0, monthlyRev * pctArr / 100 - monthlyRev * hi / 100);
  }
  return gap;
}

function computeUnderGap(pctArr: number, arr: number, lo: number, growthRate: number): number {
  const mg = monthlyGrowthFactor(growthRate);
  let gap = 0;
  for (let m = 0; m < 36; m++) {
    const monthlyRev = (arr / 12) * Math.pow(1 + mg, m);
    gap += Math.max(0, monthlyRev * lo / 100 - monthlyRev * pctArr / 100);
  }
  return gap;
}

// ─── Category zone helper ────────────────────────────────────────────────────

function categoryZone(pct: number, benchLo: number, benchHi: number): Zone {
  const fakeConfig: StageConfig = {
    key: 'seed',
    label: '',
    frame: 'convergence',
    note: '',
    zones: {
      underinvest: benchLo * 0.5,
      lo: benchLo,
      hi: benchHi,
      above: benchHi * 1.3,
      critical: benchHi * 1.6,
    },
    benchmarks: { infraHosting: [0, 0], infraPersonnel: [0, 0], rdOpEx: [0, 0], rdCapExOfRD: [0, 0], total: [0, 0] },
  };
  return getZone(pct, fakeConfig);
}

// ─── Core computation ────────────────────────────────────────────────────────

export function compute(inputs: TechParInputs): TechParResult | null {
  const { arr, infraHosting, infraPersonnel, rdCapEx, engFTE, engCost, prodCost, toolingCost, capexView, growthRate, exitMultiple } = inputs;

  if (!arr || !infraHosting) return null;

  const stageConfig = STAGES[inputs.stage] as StageConfig;

  // Compute rdOpEx based on mode
  const rdOpEx = inputs.mode === 'deepdive'
    ? engCost + prodCost + toolingCost
    : inputs.rdOpEx;

  const infraAnnual = infraHosting * 12;
  const totalCash = infraAnnual + infraPersonnel + rdOpEx + rdCapEx;
  const totalGAAP = infraAnnual + infraPersonnel + rdOpEx;
  const total = capexView === 'gaap' ? totalGAAP : totalCash;
  const totalTechPct = (total / arr) * 100;
  const zone = getZone(totalTechPct, stageConfig);

  // Category KPIs
  const categories: CategoryKPI[] = [];
  if (infraAnnual > 0) {
    const pct = (infraAnnual / arr) * 100;
    categories.push({
      label: 'Infra hosting',
      value: infraAnnual,
      pctArr: pct,
      benchmarkLo: stageConfig.benchmarks.infraHosting[0],
      benchmarkHi: stageConfig.benchmarks.infraHosting[1],
      zone: categoryZone(pct, stageConfig.benchmarks.infraHosting[0], stageConfig.benchmarks.infraHosting[1]),
      colorVar: '--techpar-category-infra',
    });
  }
  if (infraPersonnel > 0) {
    const pct = (infraPersonnel / arr) * 100;
    categories.push({
      label: 'Infra personnel',
      value: infraPersonnel,
      pctArr: pct,
      benchmarkLo: stageConfig.benchmarks.infraPersonnel[0],
      benchmarkHi: stageConfig.benchmarks.infraPersonnel[1],
      zone: categoryZone(pct, stageConfig.benchmarks.infraPersonnel[0], stageConfig.benchmarks.infraPersonnel[1]),
      colorVar: '--techpar-category-personnel',
    });
  }
  if (rdOpEx > 0) {
    const pct = (rdOpEx / arr) * 100;
    categories.push({
      label: 'R&D OpEx',
      value: rdOpEx,
      pctArr: pct,
      benchmarkLo: stageConfig.benchmarks.rdOpEx[0],
      benchmarkHi: stageConfig.benchmarks.rdOpEx[1],
      zone: categoryZone(pct, stageConfig.benchmarks.rdOpEx[0], stageConfig.benchmarks.rdOpEx[1]),
      colorVar: '--techpar-category-rd-opex',
    });
  }
  if (rdCapEx > 0) {
    const pct = (rdCapEx / arr) * 100;
    categories.push({
      label: 'R&D CapEx',
      value: rdCapEx,
      pctArr: pct,
      benchmarkLo: 0,
      benchmarkHi: 0,
      zone: 'healthy',
      colorVar: '--techpar-category-rd-capex',
    });
  }

  // KPIs
  const infraHostingPct = (infraAnnual / arr) * 100;
  const infraPersonnelPct = infraPersonnel > 0 ? (infraPersonnel / arr) * 100 : null;
  const rdOpExPct = rdOpEx > 0 ? (rdOpEx / arr) * 100 : null;
  const rdCapExPct = rdCapEx > 0 ? (rdCapEx / arr) * 100 : null;
  const rdCapExOfRD = (rdOpEx + rdCapEx) > 0 ? (rdCapEx / (rdOpEx + rdCapEx)) * 100 : null;
  const blendedInfra = ((infraAnnual + infraPersonnel) / arr) * 100;
  const revenuePerEngineer = engFTE > 0 ? arr / engFTE : null;
  const engPctOfRD = engCost > 0 && rdOpEx > 0 ? (engCost / rdOpEx) * 100 : null;
  const prodPctOfRD = prodCost > 0 && rdOpEx > 0 ? (prodCost / rdOpEx) * 100 : null;

  // Gap calculations
  const cumulative36 = computeGap(totalTechPct, arr, stageConfig.zones.hi, growthRate);
  const exitValue = cumulative36 * exitMultiple;
  const underinvestGap = computeUnderGap(totalTechPct, arr, stageConfig.zones.lo, growthRate);
  const annualAdvantage = totalTechPct < stageConfig.zones.hi
    ? (arr / 12) * (stageConfig.zones.hi - totalTechPct) / 100 * 12
    : 0;

  return {
    total,
    totalCash,
    totalGAAP,
    totalTechPct,
    zone,
    stageConfig,
    categories,
    kpis: {
      annualTechCost: total,
      infraHostingPct,
      infraPersonnelPct,
      rdOpExPct,
      rdCapExPct,
      rdCapExOfRD,
      blendedInfra,
      revenuePerEngineer,
      engPctOfRD,
      prodPctOfRD,
    },
    gap: {
      cumulative36,
      exitValue,
      underinvestGap,
      annualAdvantage,
    },
  };
}

// ─── Trajectory data builder ─────────────────────────────────────────────────

export interface TrajectoryData {
  labels: string[];
  spend: number[];
  bandLo: number[];
  bandHi: number[];
  underFloor: number[];
  revenue: number[];
  frame: Frame;
}

export function buildTrajectory(inputs: TechParInputs, config: StageConfig): TrajectoryData {
  const mg = monthlyGrowthFactor(inputs.growthRate);
  const mon = inputs.arr / 12;

  const rdOpEx = inputs.mode === 'deepdive'
    ? inputs.engCost + inputs.prodCost + inputs.toolingCost
    : inputs.rdOpEx;

  const infraAnnual = inputs.infraHosting * 12;
  const totalVal = inputs.capexView === 'gaap'
    ? infraAnnual + inputs.infraPersonnel + rdOpEx
    : infraAnnual + inputs.infraPersonnel + rdOpEx + inputs.rdCapEx;
  const pctArr = inputs.arr > 0 ? (totalVal / inputs.arr) * 100 : 0;

  const labels: string[] = [];
  const spend: number[] = [];
  const bandLo: number[] = [];
  const bandHi: number[] = [];
  const underFloor: number[] = [];
  const revenue: number[] = [];

  for (let m = 0; m < 37; m++) {
    labels.push(m === 0 ? 'Now' : m % 6 === 0 ? `M${m}` : '');
    const rev = mon * Math.pow(1 + mg, m);
    spend.push(Math.round(rev * pctArr / 100));
    bandLo.push(Math.round(rev * config.zones.lo / 100));
    bandHi.push(Math.round(rev * config.zones.hi / 100));
    underFloor.push(Math.round(rev * config.zones.underinvest / 100));
    revenue.push(Math.round(rev));
  }

  return { labels, spend, bandLo, bandHi, underFloor, revenue, frame: config.frame };
}
