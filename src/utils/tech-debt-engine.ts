/**
 * Tech Debt Cost Calculator — pure calculation engine
 *
 * All functions are stateless and side-effect free, making them
 * directly importable by unit tests and by the page <script> block.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEPLOY_OPTIONS = [
  { label: 'Multiple/day', doraLabel: 'Elite', V: 0.8 },
  { label: 'Daily', doraLabel: 'Elite', V: 0.9 },
  { label: 'Weekly', doraLabel: 'High', V: 1.0 },
  { label: 'Bi-weekly', doraLabel: 'High', V: 1.1 },
  { label: 'Three-week', doraLabel: 'Medium', V: 1.25 },
  { label: 'Monthly', doraLabel: 'Medium', V: 1.45 },
  { label: 'Quarterly+', doraLabel: 'Low', V: 1.7 },
  { label: 'Bi-annually', doraLabel: 'Low', V: 2.0 },
  { label: 'Annually', doraLabel: 'Low', V: 2.4 },
] as const;

// ─── Slider transforms (position 0–100 → business value) ─────────────────────

export const posToTeamSize = (pos: number): number =>
  Math.max(1, Math.round(1 + 499 * Math.pow(pos / 100, 2.3)));

export const posToSalary = (pos: number): number =>
  Math.round((60000 + 940000 * Math.pow(pos / 100, 2)) / 5000) * 5000;

export const posTobudget = (pos: number): number =>
  Math.round((10000 + 49990000 * Math.pow(pos / 100, 2.5)) / 1000) * 1000;

export const posToArr = (pos: number): number =>
  Math.round((100000 + 999900000 * Math.pow(pos / 100, 2.5)) / 100000) * 100000;

// ─── Inverse transforms (business value → initial slider position) ────────────

export const teamSizeToPos = (v: number): number =>
  Math.round(Math.pow((v - 1) / 499, 1 / 2.3) * 100);

export const salaryToPos = (v: number): number => Math.round(Math.sqrt((v - 60000) / 940000) * 100);

export const budgetToPos = (v: number): number =>
  Math.round(Math.pow((v - 10000) / 49990000, 1 / 2.5) * 100);

export const arrToPos = (v: number): number =>
  Math.round(Math.pow((v - 100000) / 999900000, 1 / 2.5) * 100);

// ─── State & result types ─────────────────────────────────────────────────────

// Canonical state stores raw business values (dollars, headcount, percent).
// Slider positions are a UI concern derived via `*ToPos()` for thumb placement
// and produced by `posTo*()` on slider drag. This contract prevents the user's
// typed precision from being round-tripped through the slider's coarse 0-100
// integer space — see TEST_BEST_PRACTICES.md § 27 for the anti-pattern.
export interface CalcState {
  advancedOpen: boolean;
  teamSize: number; // headcount, 1-500
  salary: number; // dollars, 60000-1000000
  maintPct: number; // percent, 0-100
  deployIdx: number;
  incidents: number; // count, 0-20
  mttr: number; // hours, 1-48
  remediationBudget: number; // dollars, 10000-50000000
  arr: number; // dollars, 100000-1000000000
  remediationPct: number; // percent, 0-100
  contextSwitchOn: boolean;
}

/** Deployment-frequency label union — derived from DEPLOY_OPTIONS so additions stay in sync. */
export type DeployFrequency = (typeof DEPLOY_OPTIONS)[number]['label'];

/**
 * Raw business-meaningful inputs to the tech-debt engine. Used by callers
 * that don't speak slider positions — namely the MCP tool wrapper. The
 * website continues to call `calculate(state)` and gets the same result.
 */
export interface RawTechDebtInputs {
  teamSize: number;
  salary: number;
  maintenanceBurdenPct: number;
  deployFrequency: DeployFrequency;
  incidents: number;
  mttrHours: number;
  remediationBudget: number;
  arr: number;
  remediationPct: number;
  contextSwitchOn: boolean;
}

export interface CalcResult {
  totalMonthly: number;
  annualCost: number;
  hoursLostPerEng: number;
  costPerEng: number;
  directMonthly: number;
  contextSwitchMonthly: number;
  incidentMonthly: number;
  V: number;
  doraLabel: string;
  debtPctArr: number;
  paybackMonths: number;
  monthlySavings: number;
}

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Compute carrying-cost results from raw business values. Used by both the
 * website's `calculate(state)` (after slider→value conversion) and the MCP
 * tool wrapper (which receives raw values from the agent). Refactored out
 * of `calculate` so the engine has a clean entry point that doesn't depend
 * on the wizard's slider domain.
 */
export function calculateFromRawInputs(raw: RawTechDebtInputs): CalcResult {
  const deploy = DEPLOY_OPTIONS.find((d) => d.label === raw.deployFrequency);
  if (!deploy) {
    throw new Error(`Unknown deployFrequency: ${raw.deployFrequency}`);
  }
  const V = deploy.V;
  const hourlyRate = raw.salary / 2080;

  const directMonthly = raw.teamSize * (raw.salary / 12) * (raw.maintenanceBurdenPct / 100) * V;
  const contextSwitchMonthly = raw.contextSwitchOn ? directMonthly * 0.23 : 0;
  const incidentMonthly = raw.incidents * raw.mttrHours * hourlyRate;
  const hoursLostPerEng = 40 * (raw.maintenanceBurdenPct / 100);
  const totalMonthly = directMonthly + contextSwitchMonthly + incidentMonthly;
  const annualCost = totalMonthly * 12;
  const debtPctArr = raw.arr > 0 ? (annualCost / raw.arr) * 100 : 0;
  const monthlySavings = totalMonthly * (raw.remediationPct / 100);
  const paybackMonths = monthlySavings > 0 ? raw.remediationBudget / monthlySavings : Infinity;

  return {
    totalMonthly,
    annualCost,
    hoursLostPerEng,
    costPerEng: totalMonthly / raw.teamSize,
    directMonthly,
    contextSwitchMonthly,
    incidentMonthly,
    V,
    doraLabel: deploy.doraLabel,
    debtPctArr,
    paybackMonths,
    monthlySavings,
  };
}

export function calculate(state: CalcState): CalcResult {
  const deploy = DEPLOY_OPTIONS[state.deployIdx];
  return calculateFromRawInputs({
    teamSize: state.teamSize,
    salary: state.salary,
    maintenanceBurdenPct: state.maintPct,
    deployFrequency: deploy.label,
    incidents: state.incidents,
    mttrHours: state.mttr,
    remediationBudget: state.remediationBudget,
    arr: state.arr,
    remediationPct: state.remediationPct,
    contextSwitchOn: state.contextSwitchOn,
  });
}

// ─── Formatting utilities ─────────────────────────────────────────────────────

export const fmt = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

export const fmtShort = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

export const fmtPayback = (months: number): string => {
  if (months < 1) return '< 1 mo';
  if (months > 60) return '> 5 yrs';
  return `${months.toFixed(1)} mo`;
};

// ─── URL state serialisation ──────────────────────────────────────────────────
//
// Compact key map keeps the base64 string short. URL stores raw business
// values directly so shared deeplinks reproduce typed precision exactly
// (previous slider-position format quantized to 100 buckets and was lossy
// at high ARR values). 'in' is a JS reserved word in some contexts — always
// access as raw['in'].

export function encodeState(state: CalcState): string {
  const compact = {
    a: state.advancedOpen ? 1 : 0,
    ts: state.teamSize,
    sa: state.salary,
    mp: state.maintPct,
    di: state.deployIdx,
    in: state.incidents,
    mttr: state.mttr,
    bg: state.remediationBudget,
    ar: state.arr,
    re: state.remediationPct,
    cs: state.contextSwitchOn ? 1 : 0,
  };
  return btoa(JSON.stringify(compact));
}

export function decodeState(encoded: string): Partial<CalcState> | null {
  try {
    const raw = JSON.parse(atob(encoded));
    if (typeof raw !== 'object' || raw === null) return null;

    const out: Partial<CalcState> = {};
    const isNum = (v: unknown, min: number, max: number): v is number =>
      typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

    if (raw.a === 0 || raw.a === 1) out.advancedOpen = raw.a === 1;
    if (isNum(raw.ts, 1, 500)) out.teamSize = raw.ts;
    if (isNum(raw.sa, 60000, 1000000)) out.salary = raw.sa;
    if (Number.isInteger(raw.mp) && raw.mp >= 0 && raw.mp <= 100) out.maintPct = raw.mp;
    if (Number.isInteger(raw.di) && raw.di >= 0 && raw.di <= 8) out.deployIdx = raw.di;
    if (Number.isInteger(raw['in']) && raw['in'] >= 0 && raw['in'] <= 20) out.incidents = raw['in'];
    if (Number.isInteger(raw.mttr) && raw.mttr >= 1 && raw.mttr <= 48) out.mttr = raw.mttr;
    if (isNum(raw.bg, 10000, 50000000)) out.remediationBudget = raw.bg;
    if (isNum(raw.ar, 100000, 1000000000)) out.arr = raw.ar;
    if (Number.isInteger(raw.re) && raw.re >= 0 && raw.re <= 100) out.remediationPct = raw.re;
    if (raw.cs === 0 || raw.cs === 1) out.contextSwitchOn = raw.cs === 1;

    return out;
  } catch {
    return null;
  }
}

// ─── Currency parsing ─────────────────────────────────────────────────────────

/**
 * Parses a currency string with optional K/M suffix into a number.
 * Honors the same shorthand format the UI displays back (`fmtShortC`), so the
 * user can mirror what they see ("$12.5M") instead of being forced to type
 * seven zeros. Leading currency symbol, commas, and whitespace are stripped.
 *
 * Returns NaN for unparseable input (caller decides clamp / fallback).
 *
 * Examples:
 *   parseShortCurrency("$12.5M") → 12500000
 *   parseShortCurrency("750K")   → 750000
 *   parseShortCurrency("237500") → 237500
 *   parseShortCurrency("1,000")  → 1000
 *   parseShortCurrency("")       → NaN
 */
export function parseShortCurrency(input: string): number {
  if (typeof input !== 'string') return NaN;
  const cleaned = input.replace(/[\s,$£€¥]/g, '').toUpperCase();
  // Allow optional leading +/-, digits, optional decimal, optional K|M suffix
  const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?)([KM])?$/);
  if (!match) return NaN;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return NaN;
  const mult = match[2] === 'M' ? 1_000_000 : match[2] === 'K' ? 1_000 : 1;
  return num * mult;
}

// ─── Default initial state ────────────────────────────────────────────────────

// ─── Currency-aware formatting ───────────────────────────────────────────────

export const fmtShortC = (n: number, symbol: string = '$', multiplier: number = 1): string => {
  const v = n * multiplier;
  if (v >= 1_000_000) return `${symbol}${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${symbol}${(v / 1_000).toFixed(0)}K`;
  return `${symbol}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v)}`;
};

// ─── Burden classification ───────────────────────────────────────────────────

export interface BurdenLevel {
  text: string;
  range: string;
  color: string;
}

/** Rich burden classification for UI display (label + range + color). */
export function burdenClassify(pct: number): BurdenLevel {
  if (pct < 10) return { text: 'Well-managed', range: '< 10%', color: 'var(--color-primary)' };
  if (pct < 15) return { text: 'Acceptable', range: '10–15%', color: 'var(--color-primary)' };
  if (pct < 25) return { text: 'Yellow flag', range: '15–25%', color: 'var(--color-secondary)' };
  if (pct < 40) return { text: 'Red flag', range: '25–40%', color: '#d93636' };
  return { text: 'Deal risk', range: '40%+', color: '#b82e2e' };
}

/** Plain-text burden label for clipboard/summary export. */
function burdenLabel(pct: number): string {
  if (pct < 10) return 'Well-managed (< 10%)';
  if (pct < 15) return 'Acceptable (10-15%)';
  if (pct < 25) return 'Yellow flag (15-25%)';
  if (pct < 40) return 'Red flag (25-40%)';
  return 'Deal risk (40%+)';
}

// ─── Plain-text summary for clipboard export ─────────────────────────────────

/** Contextual narrative for a given burden level. */
export function contextNote(pct: number, formattedAnnualCost: string): string {
  if (pct < 10)
    return 'Engineering capacity is predominantly forward-looking. Maintain discipline as the team scales.';
  if (pct < 15)
    return 'Some accumulated friction is present. Normal for companies that have shipped fast, but should be on the 100-day plan.';
  if (pct < 25)
    return `At ${pct}% burden, maintenance is a material drag on velocity. Warrants targeted investigation into root causes and active mitigation: SDLC maturity, infrastructure architecture, test coverage, and deployment pipeline should all be examined.`;
  if (pct < 40)
    return `At ${pct}% burden, debt is a strategic liability carrying ${formattedAnnualCost}/yr in costs. Expect architectural problems, manual processes, fragile deployments, and potential talent retention risk. Remediation cost belongs in the deal model.`;
  return `At ${pct}% burden, debt is the dominant constraint on this technology organization. The ${formattedAnnualCost}/yr carrying cost signals the platform may require significant restructuring or rewrite post-close. Factor directly into valuation.`;
}

export function buildSummaryText(
  state: CalcState,
  result: CalcResult,
  symbol: string = '$',
  multiplier: number = 1,
  url?: string
): string {
  const f = (n: number) => fmtShortC(n, symbol, multiplier);
  const teamSize = state.teamSize;
  const salary = state.salary;
  const deploy = DEPLOY_OPTIONS[state.deployIdx];
  const ftesLost = (teamSize * (state.maintPct / 100)).toFixed(1);
  const date = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    'Tech Debt Cost Calculator — Summary',
    `Generated: ${date}`,
    '────────────────────────────────────────',
    `Team: ${teamSize} engineers | Avg. salary: ${f(salary)}`,
    `Maintenance burden: ${state.maintPct}%`,
    `Deployment frequency: ${deploy.label} (DORA ${deploy.doraLabel}, ${deploy.V}×)`,
    '',
    `Annual cost of technical debt: ${f(result.annualCost)}`,
    `Monthly cost: ${f(result.totalMonthly)}`,
    `Hours lost / eng / week: ${result.hoursLostPerEng.toFixed(0)}h`,
    `Cost / eng / month: ${f(result.costPerEng)}`,
    `FTEs lost to debt: ${ftesLost}`,
    `Burden level: ${burdenLabel(state.maintPct)}`,
  ];

  if (state.advancedOpen) {
    lines.push('', `Direct labor: ${f(result.directMonthly)}/mo`);
    if (state.contextSwitchOn) {
      lines.push(`Context-switch overhead (+23%): ${f(result.contextSwitchMonthly)}/mo`);
    }
    lines.push(
      `Incident labor: ${f(result.incidentMonthly)}/mo`,
      `Debt as % of ARR: ${result.debtPctArr.toFixed(1)}%`,
      `Remediation efficiency: ${state.remediationPct}%`,
      `Payback period: ${fmtPayback(result.paybackMonths)}`
    );
  }

  lines.push('', contextNote(state.maintPct, f(result.annualCost)));
  lines.push(
    '',
    `Generated by GST | ${url || 'https://globalstrategic.tech/hub/tools/tech-debt-calculator'}`
  );

  return lines.join('\n');
}

// ─── Default initial state ────────────────────────────────────────────────────

export const DEFAULT_STATE: CalcState = {
  advancedOpen: false,
  teamSize: 8,
  salary: 150000,
  maintPct: 25,
  deployIdx: 3,
  incidents: 3,
  mttr: 4,
  remediationBudget: 500000,
  arr: 10000000,
  remediationPct: 70,
  contextSwitchOn: false,
};
