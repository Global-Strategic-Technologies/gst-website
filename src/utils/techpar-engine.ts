/**
 * TechPar - pure calculation engine
 *
 * All functions are stateless and side-effect free, making them
 * directly importable by unit tests and by the page <script> block.
 */

import { STAGES } from '../data/techpar/stages';

// ─── Types ───────────────────────────────────────────────────────────────────

// Data-shape types are inferred from Zod schemas in src/schemas/techpar.ts
// (single source of truth) and re-exported here so existing imports stay
// stable. Engine-only computation types (TechParInputs, TechParResult,
// TrajectoryDataset, etc.) remain declared locally below.
import type { Stage, Frame, Zone, StageConfig } from '../schemas/techpar';
export type { Stage, Frame, Zone, StageConfig };

export type Mode = 'quick' | 'deepdive';
export type CapExView = 'cash' | 'gaap';

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
    annualExcess: number;
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

export function formatDollars(n: number, symbol: string = '$'): string {
  if (!isFinite(n) || n === null) return '\u2014';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return sign + symbol + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + symbol + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + symbol + Math.round(abs / 1e3) + 'K';
  return sign + symbol + Math.round(abs);
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
    gap += Math.max(0, (monthlyRev * pctArr) / 100 - (monthlyRev * hi) / 100);
  }
  return gap;
}

function computeUnderGap(pctArr: number, arr: number, lo: number, growthRate: number): number {
  const mg = monthlyGrowthFactor(growthRate);
  let gap = 0;
  for (let m = 0; m < 36; m++) {
    const monthlyRev = (arr / 12) * Math.pow(1 + mg, m);
    gap += Math.max(0, (monthlyRev * lo) / 100 - (monthlyRev * pctArr) / 100);
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
    benchmarks: {
      infraHosting: [0, 0],
      infraPersonnel: [0, 0],
      rdOpEx: [0, 0],
      rdCapExOfRD: [0, 0],
      total: [0, 0],
    },
  };
  return getZone(pct, fakeConfig);
}

// ─── Core computation ────────────────────────────────────────────────────────

export function compute(inputs: TechParInputs): TechParResult | null {
  const {
    arr,
    infraHosting,
    infraPersonnel,
    rdCapEx,
    engFTE,
    engCost,
    prodCost,
    toolingCost,
    capexView,
    growthRate,
    exitMultiple,
  } = inputs;

  if (!arr || !infraHosting) return null;

  const stageConfig = STAGES[inputs.stage] as StageConfig;

  // Compute rdOpEx based on mode
  const rdOpEx = inputs.mode === 'deepdive' ? engCost + prodCost + toolingCost : inputs.rdOpEx;

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
      zone: categoryZone(
        pct,
        stageConfig.benchmarks.infraHosting[0],
        stageConfig.benchmarks.infraHosting[1]
      ),
      colorVar: '--color-primary',
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
      zone: categoryZone(
        pct,
        stageConfig.benchmarks.infraPersonnel[0],
        stageConfig.benchmarks.infraPersonnel[1]
      ),
      colorVar: '--color-authority',
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
      colorVar: '--color-distinguish',
    });
  }
  if (rdCapEx > 0) {
    const pct = (rdCapEx / arr) * 100;
    // Derive CapEx-as-%-of-revenue benchmark from rdCapExOfRD (CapEx as % of total R&D)
    const totalRD = rdOpEx + rdCapEx;
    const rdCapExBenchLo =
      totalRD > 0 ? ((totalRD * stageConfig.benchmarks.rdCapExOfRD[0]) / 100 / arr) * 100 : 0;
    const rdCapExBenchHi =
      totalRD > 0 ? ((totalRD * stageConfig.benchmarks.rdCapExOfRD[1]) / 100 / arr) * 100 : 0;
    categories.push({
      label: 'R&D CapEx',
      value: rdCapEx,
      pctArr: pct,
      benchmarkLo: Math.round(rdCapExBenchLo * 10) / 10,
      benchmarkHi: Math.round(rdCapExBenchHi * 10) / 10,
      zone: categoryZone(pct, rdCapExBenchLo, rdCapExBenchHi),
      colorVar: '--color-secondary',
    });
  }

  // KPIs
  const infraHostingPct = (infraAnnual / arr) * 100;
  const infraPersonnelPct = infraPersonnel > 0 ? (infraPersonnel / arr) * 100 : null;
  const rdOpExPct = rdOpEx > 0 ? (rdOpEx / arr) * 100 : null;
  const rdCapExPct = rdCapEx > 0 ? (rdCapEx / arr) * 100 : null;
  const rdCapExOfRD = rdOpEx + rdCapEx > 0 ? (rdCapEx / (rdOpEx + rdCapEx)) * 100 : null;
  const blendedInfra = ((infraAnnual + infraPersonnel) / arr) * 100;
  const revenuePerEngineer = engFTE > 0 ? arr / engFTE : null;
  const engPctOfRD = engCost > 0 && rdOpEx > 0 ? (engCost / rdOpEx) * 100 : null;
  const prodPctOfRD = prodCost > 0 && rdOpEx > 0 ? (prodCost / rdOpEx) * 100 : null;

  // Gap calculations
  const cumulative36 = computeGap(totalTechPct, arr, stageConfig.zones.hi, growthRate);
  const exitValue = cumulative36 * exitMultiple;
  const underinvestGap = computeUnderGap(totalTechPct, arr, stageConfig.zones.lo, growthRate);
  const annualAdvantage =
    totalTechPct < stageConfig.zones.hi
      ? (((arr / 12) * (stageConfig.zones.hi - totalTechPct)) / 100) * 12
      : 0;
  const annualExcess =
    totalTechPct > stageConfig.zones.hi ? ((totalTechPct - stageConfig.zones.hi) / 100) * arr : 0;

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
      annualExcess,
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
  aboveCeiling: number[];
  revenue: number[];
  frame: Frame;
}

export function buildTrajectory(inputs: TechParInputs, config: StageConfig): TrajectoryData {
  const mg = monthlyGrowthFactor(inputs.growthRate);
  const mon = inputs.arr / 12;

  const rdOpEx =
    inputs.mode === 'deepdive'
      ? inputs.engCost + inputs.prodCost + inputs.toolingCost
      : inputs.rdOpEx;

  const infraAnnual = inputs.infraHosting * 12;
  const totalVal =
    inputs.capexView === 'gaap'
      ? infraAnnual + inputs.infraPersonnel + rdOpEx
      : infraAnnual + inputs.infraPersonnel + rdOpEx + inputs.rdCapEx;
  const pctArr = inputs.arr > 0 ? (totalVal / inputs.arr) * 100 : 0;

  const labels: string[] = [];
  const spend: number[] = [];
  const bandLo: number[] = [];
  const bandHi: number[] = [];
  const underFloor: number[] = [];
  const aboveCeiling: number[] = [];
  const revenue: number[] = [];

  for (let m = 0; m < 37; m++) {
    labels.push(m === 0 ? 'Now' : m % 6 === 0 ? `M${m}` : '');
    const rev = mon * Math.pow(1 + mg, m);
    spend.push(Math.round((rev * pctArr) / 100));
    bandLo.push(Math.round((rev * config.zones.lo) / 100));
    bandHi.push(Math.round((rev * config.zones.hi) / 100));
    underFloor.push(Math.round((rev * config.zones.underinvest) / 100));
    aboveCeiling.push(Math.round((rev * config.zones.above) / 100));
    revenue.push(Math.round(rev));
  }

  return { labels, spend, bandLo, bandHi, underFloor, aboveCeiling, revenue, frame: config.frame };
}

// ─── Historical actuals ───────────────────────────────────────────────────────

export interface HistoricalPoint {
  label: string;
  arr: number;
  totalTechSpend: number;
}

export interface HistoricalResult {
  label: string;
  techCostPct: number;
  monthlySpend: number;
  monthlyRevenue: number;
}

/** Compute technology cost percentages and monthly equivalents for prior-year data points. */
export function computeHistorical(points: HistoricalPoint[]): HistoricalResult[] {
  return points
    .filter((p) => p.arr > 0 && p.totalTechSpend > 0)
    .map((p) => ({
      label: p.label,
      techCostPct: (p.totalTechSpend / p.arr) * 100,
      monthlySpend: p.totalTechSpend / 12,
      monthlyRevenue: p.arr / 12,
    }));
}

/**
 * Build chart-ready data for historical points.
 * Each year expands to 12 monthly data points so historical segments
 * occupy proportional width relative to the 36-month forward projection.
 *
 * Values are linearly interpolated from the previous year-end to the
 * current year-end within each 12-month segment, creating smooth
 * transitions between years and into "Now."
 *
 * @param currentArr - The current ARR (used to interpolate the final
 *   historical year smoothly toward the forward projection start)
 * @param currentTechSpend - The current total annual tech spend
 */
export function buildHistoricalTrajectory(
  points: HistoricalPoint[],
  config: StageConfig,
  currentArr?: number,
  currentTechSpend?: number
): {
  labels: string[];
  spend: number[];
  bandLo: number[];
  bandHi: number[];
  underFloor: number[];
  aboveCeiling: number[];
  revenue: number[];
} {
  const labels: string[] = [];
  const spend: number[] = [];
  const bandLo: number[] = [];
  const bandHi: number[] = [];
  const underFloor: number[] = [];
  const aboveCeiling: number[] = [];
  const revenue: number[] = [];

  // Build anchor points: each historical year, then "Now" as the final target
  interface Anchor {
    label: string;
    monSpend: number;
    monRev: number;
  }
  const anchors: Anchor[] = [];
  for (const p of points) {
    if (p.arr <= 0) continue;
    anchors.push({
      label: p.label || '',
      monSpend: p.totalTechSpend / 12,
      monRev: p.arr / 12,
    });
  }
  // Add "Now" as final anchor so the last historical year interpolates
  // smoothly into the forward projection's starting point
  if (currentArr && currentArr > 0) {
    anchors.push({
      label: '', // "Now" label is provided by the forward trajectory
      monSpend: (currentTechSpend || 0) / 12,
      monRev: currentArr / 12,
    });
  }

  if (anchors.length < 2) {
    // Only one anchor (no interpolation possible): hold flat
    const a = anchors[0];
    if (!a) return { labels, spend, bandLo, bandHi, underFloor, aboveCeiling, revenue };
    for (let m = 0; m < 12; m++) {
      labels.push(m === 0 ? a.label : '');
      spend.push(Math.round(a.monSpend));
      bandLo.push(Math.round((a.monRev * config.zones.lo) / 100));
      bandHi.push(Math.round((a.monRev * config.zones.hi) / 100));
      underFloor.push(Math.round((a.monRev * config.zones.underinvest) / 100));
      aboveCeiling.push(Math.round((a.monRev * config.zones.above) / 100));
      revenue.push(Math.round(a.monRev));
    }
    return { labels, spend, bandLo, bandHi, underFloor, aboveCeiling, revenue };
  }

  // Interpolate 12 months between each pair of consecutive anchors
  // (last pair is final historical year → "Now", which is NOT emitted
  //  as data points since "Now" is the forward trajectory's first point)
  const segmentCount = anchors.length - 1; // e.g., 2 hist + Now = 3 anchors = 2 segments
  for (let seg = 0; seg < segmentCount; seg++) {
    const from = anchors[seg];
    const to = anchors[seg + 1];
    for (let m = 0; m < 12; m++) {
      const t = m / 11; // 0 at start, 1 at end
      const monRev = from.monRev + (to.monRev - from.monRev) * t;
      const monSpend = from.monSpend + (to.monSpend - from.monSpend) * t;

      labels.push(m === 0 ? from.label : '');
      spend.push(Math.round(monSpend));
      bandLo.push(Math.round((monRev * config.zones.lo) / 100));
      bandHi.push(Math.round((monRev * config.zones.hi) / 100));
      underFloor.push(Math.round((monRev * config.zones.underinvest) / 100));
      aboveCeiling.push(Math.round((monRev * config.zones.above) / 100));
      revenue.push(Math.round(monRev));
    }
  }

  return { labels, spend, bandLo, bandHi, underFloor, aboveCeiling, revenue };
}

// ─── URL State Serialization ──────────────────────────────────────────────────

/** Compact single-letter key mapping for URL params */
const PARAM_KEYS: Record<string, keyof TechParInputs | 'stage' | 'mode' | 'capexView'> = {
  s: 'stage',
  a: 'arr',
  g: 'growthRate',
  m: 'mode',
  c: 'capexView',
  e: 'exitMultiple',
  h: 'infraHosting',
  p: 'infraPersonnel',
  r: 'rdOpEx',
  x: 'rdCapEx',
  f: 'engFTE',
  k: 'engCost',
  q: 'prodCost',
  t: 'toolingCost',
};

const REVERSE_KEYS: Record<string, string> = Object.fromEntries(
  Object.entries(PARAM_KEYS).map(([short, long]) => [long, short])
);

const VALID_STAGES: Stage[] = ['seed', 'series_a', 'series_bc', 'pe', 'enterprise'];
const VALID_MODES: Mode[] = ['quick', 'deepdive'];
const VALID_CAPEX: CapExView[] = ['cash', 'gaap'];

/** Serialize TechParInputs into compact URL search params. Only non-default values are included. */
export function serializeToParams(
  inputs: TechParInputs,
  historical?: HistoricalPoint[]
): URLSearchParams {
  const params = new URLSearchParams();
  const set = (field: string, val: string) => {
    const key = REVERSE_KEYS[field];
    if (key && val) params.set(key, val);
  };

  set('stage', inputs.stage);
  if (inputs.arr) set('arr', String(inputs.arr));
  if (inputs.growthRate) set('growthRate', String(inputs.growthRate));
  if (inputs.mode !== 'quick') set('mode', inputs.mode);
  if (inputs.capexView !== 'cash') set('capexView', inputs.capexView);
  if (inputs.exitMultiple !== 12) set('exitMultiple', String(inputs.exitMultiple));
  if (inputs.infraHosting) set('infraHosting', String(inputs.infraHosting));
  if (inputs.infraPersonnel) set('infraPersonnel', String(inputs.infraPersonnel));
  if (inputs.rdOpEx) set('rdOpEx', String(inputs.rdOpEx));
  if (inputs.rdCapEx) set('rdCapEx', String(inputs.rdCapEx));
  if (inputs.engFTE) set('engFTE', String(inputs.engFTE));
  if (inputs.engCost) set('engCost', String(inputs.engCost));
  if (inputs.prodCost) set('prodCost', String(inputs.prodCost));
  if (inputs.toolingCost) set('toolingCost', String(inputs.toolingCost));

  // Historical data points (max 2)
  if (historical) {
    historical.slice(0, 2).forEach((pt, i) => {
      const j = i + 1;
      if (pt.label) params.set(`y${j}l`, pt.label);
      if (pt.arr) params.set(`y${j}a`, String(pt.arr));
      if (pt.totalTechSpend) params.set(`y${j}t`, String(pt.totalTechSpend));
    });
  }

  return params;
}

/** Partial state recovered from URL params. Missing fields should use defaults. */
export interface DeserializedState {
  stage?: Stage;
  arr?: number;
  growthRate?: number;
  mode?: Mode;
  capexView?: CapExView;
  exitMultiple?: number;
  infraHosting?: number;
  infraPersonnel?: number;
  rdOpEx?: number;
  rdCapEx?: number;
  engFTE?: number;
  engCost?: number;
  prodCost?: number;
  toolingCost?: number;
  historical?: HistoricalPoint[];
}

/** Deserialize URL search params into partial state. Invalid values are silently ignored. */
export function deserializeFromParams(params: URLSearchParams): DeserializedState {
  const state: DeserializedState = {};

  const str = (key: string): string | null => params.get(key) || null;
  const num = (key: string): number | undefined => {
    const v = params.get(key);
    if (!v) return undefined;
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  };

  const s = str('s');
  if (s && VALID_STAGES.includes(s as Stage)) state.stage = s as Stage;

  state.arr = num('a');
  state.growthRate = num('g');

  const m = str('m');
  if (m && VALID_MODES.includes(m as Mode)) state.mode = m as Mode;

  const c = str('c');
  if (c && VALID_CAPEX.includes(c as CapExView)) state.capexView = c as CapExView;

  state.exitMultiple = num('e');
  state.infraHosting = num('h');
  state.infraPersonnel = num('p');
  state.rdOpEx = num('r');
  state.rdCapEx = num('x');
  state.engFTE = num('f');
  state.engCost = num('k');
  state.prodCost = num('q');
  state.toolingCost = num('t');

  // Historical data points
  const hist: HistoricalPoint[] = [];
  for (let j = 1; j <= 2; j++) {
    const lbl = params.get(`y${j}l`);
    const a = num(`y${j}a`);
    const t = num(`y${j}t`);
    if (lbl || a || t) {
      hist.push({ label: lbl || `Y-${j}`, arr: a || 0, totalTechSpend: t || 0 });
    }
  }
  if (hist.length) state.historical = hist;

  return state;
}

// ─── Plain-text Summary ───────────────────────────────────────────────────────

/** Build a structured plain-text summary suitable for clipboard / email / Slack. */
export function buildSummaryText(
  inputs: TechParInputs,
  result: TechParResult,
  url?: string,
  historical?: HistoricalPoint[]
): string {
  const s = result.stageConfig;
  const lines: string[] = [];

  lines.push('TechPar Summary');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('\u2500'.repeat(40));
  lines.push(`Stage: ${s.label}`);
  lines.push(
    `ARR: ${formatDollars(inputs.arr)} | Growth: ${inputs.growthRate}% | Basis: ${inputs.capexView === 'gaap' ? 'GAAP' : 'Cash'}`
  );
  lines.push('');
  lines.push(
    `Total technology cost: ${formatPercent(result.totalTechPct)} of revenue (${formatDollars(result.total)}/yr)`
  );
  lines.push(`Zone: ${zoneLabel(result.zone)}`);
  lines.push(`Benchmark range: ${s.benchmarks.total[0]}\u2013${s.benchmarks.total[1]}%`);
  lines.push('');

  for (const cat of result.categories) {
    const bench = cat.benchmarkHi > 0 ? ` (bench ${cat.benchmarkLo}\u2013${cat.benchmarkHi}%)` : '';
    lines.push(`${cat.label}: ${formatPercent(cat.pctArr)}${bench}`);
  }

  if (historical?.length) {
    lines.push('');
    lines.push('Historical:');
    const histResults = computeHistorical(historical);
    for (const h of histResults) {
      lines.push(
        `  ${h.label}: ${formatPercent(h.techCostPct)} (${formatDollars(h.monthlySpend * 12)} on ${formatDollars(h.monthlyRevenue * 12)} ARR)`
      );
    }
    lines.push(
      `  Current: ${formatPercent(result.totalTechPct)} (${formatDollars(result.total)} on ${formatDollars(inputs.arr)} ARR)`
    );
  }

  if (
    result.gap.cumulative36 > 0 &&
    result.zone !== 'healthy' &&
    result.zone !== 'ahead' &&
    result.zone !== 'underinvest'
  ) {
    lines.push('');
    lines.push(
      `36-month excess above ${s.zones.hi}% ceiling: ${formatDollars(result.gap.cumulative36)}`
    );
    lines.push(
      `Exit value at ${inputs.exitMultiple}\u00d7: ${formatDollars(result.gap.exitValue)}`
    );
  } else if (result.gap.underinvestGap > 0) {
    lines.push('');
    lines.push(
      `36-month gap below ${s.zones.lo}% floor: ${formatDollars(result.gap.underinvestGap)}`
    );
  }

  lines.push('');
  if (url) {
    lines.push(`Generated by TechPar | ${url}`);
  } else {
    lines.push('Generated by TechPar | globalstrategic.tech/hub/tools/techpar');
  }

  return lines.join('\n');
}
