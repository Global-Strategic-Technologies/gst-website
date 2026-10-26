/**
 * Tech Debt Cost Calculator — pure calculation engine
 *
 * All functions are stateless and side-effect free, making them
 * directly importable by unit tests and by the tool page's client script.
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
//
// Sliders use step="0.1" (1000 discrete positions across the 0-100 domain) so
// the thumb can faithfully represent a typed value without snapping to one of
// only 100 buckets. Output is rounded to one decimal place to match the
// slider's step granularity exactly.
const POS_DECIMAL = (x: number): number => Math.round(x * 10) / 10;

export const teamSizeToPos = (v: number): number =>
  POS_DECIMAL(Math.pow((v - 1) / 499, 1 / 2.3) * 100);

export const salaryToPos = (v: number): number =>
  POS_DECIMAL(Math.sqrt((v - 60000) / 940000) * 100);

export const budgetToPos = (v: number): number =>
  POS_DECIMAL(Math.pow((v - 10000) / 49990000, 1 / 2.5) * 100);

export const arrToPos = (v: number): number =>
  POS_DECIMAL(Math.pow((v - 100000) / 999900000, 1 / 2.5) * 100);

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
//
// Producer/consumer domain note: the MCP `estimate_tech_debt_cost` tool
// accepts a WIDER numeric domain than this calculator's sliders (e.g.
// remediationBudget/arr `>= 0`, mttrHours `>= 0` including 0 as an "elided /
// unknown" sentinel). A deeplink built from those inputs can therefore carry
// values outside a slider's [min,max]. Rather than silently dropping such a
// field back to an unrelated default — which makes a shared link misreport the
// analysis it was built to convey — `decodeState` clamps each out-of-range
// value to the nearest supported bound and records the field in `adjusted[]`
// so the page can surface a visible "values were adjusted" notice.

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

/**
 * English label per compact state key, as `decodeState` reports an adjusted
 * field. The site's localized page translates by key (`field.<key>`).
 */
export const STATE_FIELD_LABELS = {
  ts: 'Team Size',
  sa: 'Avg. Salary',
  mp: 'Maintenance Burden',
  di: 'Deployment Frequency',
  in: 'Incidents / Mo',
  mttr: 'Avg. Time to Resolve',
  bg: 'Remediation Budget',
  ar: 'Annual Recurring Revenue',
  re: 'Remediation Efficiency',
} as const;
export type StateFieldKey = keyof typeof STATE_FIELD_LABELS;

export interface DecodedState {
  /** Fields present in the payload and usable — either verbatim (in range) or clamped to a bound. */
  state: Partial<CalcState>;
  /**
   * Human-readable labels for fields that were present but had to be coerced:
   * clamped to the nearest bound (out of range) or dropped (non-numeric). Empty
   * when every shared value was honored exactly. The page renders these in a
   * notice so a link built from the wider MCP input domain never silently
   * decodes to an unrelated default without telling the reader.
   */
  adjusted: string[];
  /** The same fields as `adjusted`, as `STATE_FIELD_LABELS` keys, in the same order. */
  adjustedKeys: StateFieldKey[];
}

export function decodeState(encoded: string): DecodedState | null {
  try {
    const raw = JSON.parse(atob(encoded));
    if (typeof raw !== 'object' || raw === null) return null;

    const state: Partial<CalcState> = {};
    const adjusted: string[] = [];
    const adjustedKeys: StateFieldKey[] = [];

    // Clamp a present numeric field into [min,max] and assign it via `set`. An
    // out-of-range value is coerced to the nearest bound; a non-numeric present
    // value is dropped. Either coercion records the field in `adjusted` (its
    // English label) and `adjustedKeys` (its key). Absent fields are skipped
    // silently (partial links are normal). Integer fields are
    // rounded so the stored value stays representable on the slider control.
    const clampNum = (
      value: unknown,
      min: number,
      max: number,
      key: StateFieldKey,
      set: (v: number) => void,
      isInt = false
    ): void => {
      if (value === undefined) return;
      const flag = (): void => {
        adjusted.push(STATE_FIELD_LABELS[key]);
        adjustedKeys.push(key);
      };
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        flag();
        return;
      }
      const rounded = isInt ? Math.round(value) : value;
      const clamped = Math.min(max, Math.max(min, rounded));
      if (clamped !== value) flag();
      set(clamped);
    };

    if (raw.a === 0 || raw.a === 1) state.advancedOpen = raw.a === 1;
    clampNum(raw.ts, 1, 500, 'ts', (v) => (state.teamSize = v), true);
    clampNum(raw.sa, 60000, 1000000, 'sa', (v) => (state.salary = v));
    clampNum(raw.mp, 0, 100, 'mp', (v) => (state.maintPct = v), true);
    clampNum(raw.di, 0, 8, 'di', (v) => (state.deployIdx = v), true);
    clampNum(raw['in'], 0, 20, 'in', (v) => (state.incidents = v), true);
    clampNum(raw.mttr, 1, 48, 'mttr', (v) => (state.mttr = v), true);
    clampNum(raw.bg, 10000, 50000000, 'bg', (v) => (state.remediationBudget = v));
    clampNum(raw.ar, 100000, 1000000000, 'ar', (v) => (state.arr = v));
    clampNum(raw.re, 0, 100, 're', (v) => (state.remediationPct = v), true);
    if (raw.cs === 0 || raw.cs === 1) state.contextSwitchOn = raw.cs === 1;

    return { state, adjusted, adjustedKeys };
  } catch {
    return null;
  }
}

// ─── Currency parsing ─────────────────────────────────────────────────────────

/**
 * Parses a currency string with optional K/M/B suffix into a number.
 * Honors the same shorthand format the UI displays back (`fmtShortC`), so the
 * user can mirror what they see ("$12.5M") instead of being forced to type
 * seven zeros. Leading currency symbol, commas, and whitespace are stripped.
 *
 * Returns NaN for unparseable input (caller decides clamp / fallback).
 *
 * Examples:
 *   parseShortCurrency("$12.5M") → 12500000
 *   parseShortCurrency("750K")   → 750000
 *   parseShortCurrency("$1.0B")  → 1000000000
 *   parseShortCurrency("237500") → 237500
 *   parseShortCurrency("1,000")  → 1000
 *   parseShortCurrency("")       → NaN
 */
export function parseShortCurrency(input: string): number {
  if (typeof input !== 'string') return NaN;
  const cleaned = input
    .replace(/[\s,$£€¥]/g, '')
    .toUpperCase()
    // A letter prefix left by "C$" / "A$" (or a typed "USD"), before the number
    .replace(/^[A-Z]{1,3}(?=[+-]?\d)/, '');
  // Allow optional leading +/-, digits, optional decimal, optional K|M|B suffix
  const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?)([KMB])?$/);
  if (!match) return NaN;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return NaN;
  const suffix = match[2];
  const mult =
    suffix === 'B' ? 1_000_000_000 : suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
  return num * mult;
}

// ─── Default initial state ────────────────────────────────────────────────────

// ─── Currency-aware formatting ───────────────────────────────────────────────

export const fmtShortC = (n: number, symbol: string = '$'): string => {
  // Each threshold sits where the smaller unit would round up to 1000
  // ("1000K", "1000.0M"), so such amounts print in the larger unit instead.
  if (n >= 999_950_000) return `${symbol}${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 999_500) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${symbol}${(n / 1_000).toFixed(0)}K`;
  return `${symbol}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)}`;
};

// ─── Burden classification ───────────────────────────────────────────────────
//
// The level is a key, so the site's localized page can render its label,
// range and narrative from a catalog (BL-153 Tier B). The English text below
// is what this engine prints, and the `en` catalog is pinned to it by test.

export type BurdenKey = 'managed' | 'acceptable' | 'yellow' | 'red' | 'risk';

export function burdenKeyOf(pct: number): BurdenKey {
  if (pct < 10) return 'managed';
  if (pct < 15) return 'acceptable';
  if (pct < 25) return 'yellow';
  if (pct < 40) return 'red';
  return 'risk';
}

/** English burden text: UI label, UI range, and the summary's plain label. */
export const BURDEN_TEXT_EN: Record<BurdenKey, { label: string; range: string; plain: string }> = {
  managed: { label: 'Well-managed', range: '< 10%', plain: 'Well-managed (< 10%)' },
  acceptable: { label: 'Acceptable', range: '10–15%', plain: 'Acceptable (10-15%)' },
  yellow: { label: 'Yellow flag', range: '15–25%', plain: 'Yellow flag (15-25%)' },
  red: { label: 'Red flag', range: '25–40%', plain: 'Red flag (25-40%)' },
  risk: { label: 'Deal risk', range: '40%+', plain: 'Deal risk (40%+)' },
};

export const BURDEN_COLOR: Record<BurdenKey, string> = {
  managed: 'var(--color-primary)',
  acceptable: 'var(--color-primary)',
  yellow: 'var(--color-secondary-ink)',
  red: 'var(--color-error-ink)',
  risk: 'var(--color-error-ink)',
};

/**
 * English narrative per level; `{pct}` is the burden and `{cost}` the
 * formatted annual cost. One whole sentence per level, so a translation can
 * agree in gender and number instead of splicing fragments.
 */
export const CONTEXT_NOTE_EN: Record<BurdenKey, string> = {
  managed:
    'Engineering capacity is predominantly forward-looking. Maintain discipline as the team scales.',
  acceptable:
    'Some accumulated friction is present. Normal for companies that have shipped fast, but should be on the 100-day plan.',
  yellow:
    'At {pct}% burden, maintenance is a material drag on velocity. Warrants targeted investigation into root causes and active mitigation: SDLC maturity, infrastructure architecture, test coverage, and deployment pipeline should all be examined.',
  red: 'At {pct}% burden, debt is a strategic liability carrying {cost}/yr in costs. Expect architectural problems, manual processes, fragile deployments, and potential talent retention risk. Remediation cost belongs in the deal model.',
  risk: 'At {pct}% burden, debt is the dominant constraint on this technology organization. The {cost}/yr carrying cost signals the platform may require significant restructuring or rewrite post-close. Factor directly into valuation.',
};

export interface BurdenLevel {
  text: string;
  range: string;
  color: string;
}

/** Rich burden classification for UI display (label + range + color). */
export function burdenClassify(pct: number): BurdenLevel {
  const key = burdenKeyOf(pct);
  return {
    text: BURDEN_TEXT_EN[key].label,
    range: BURDEN_TEXT_EN[key].range,
    color: BURDEN_COLOR[key],
  };
}

/** `{name}` fill. Local on purpose: the Worker imports this engine, and the MCP
 * workflows' path filters do not cover `src/i18n/` (workflow-paths-parity). */
function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

// ─── Plain-text summary for clipboard export ─────────────────────────────────

/** Contextual narrative for a given burden level. */
export function contextNote(pct: number, formattedAnnualCost: string): string {
  return fill(CONTEXT_NOTE_EN[burdenKeyOf(pct)], { pct, cost: formattedAnnualCost });
}

/** English summary text. `{name}` placeholders are filled by `fill`. */
export const SUMMARY_TEXT_EN = {
  title: 'Tech Debt Cost Calculator — Summary',
  generated: 'Generated: {date}',
  team: 'Team: {team} engineers | Avg. salary: {salary}',
  burden: 'Maintenance burden: {pct}%',
  deploy: 'Deployment frequency: {deploy} (DORA {dora}, {v}×)',
  annual: 'Annual cost of technical debt: {amount}',
  monthly: 'Monthly cost: {amount}',
  hoursLost: 'Hours lost / eng / week: {hours}h',
  costPerEng: 'Cost / eng / month: {amount}',
  ftesLost: 'FTEs lost to debt: {ftes}',
  burdenLevel: 'Burden level: {level}',
  direct: 'Direct labor: {amount}/mo',
  contextSwitch: 'Context-switch overhead (+23%): {amount}/mo',
  incident: 'Incident labor: {amount}/mo',
  debtPctArr: 'Debt as % of ARR: {pct}%',
  efficiency: 'Remediation efficiency: {pct}%',
  payback: 'Payback period: {payback}',
  footer: 'Generated by GST | {url}',
} as const;
export type SummaryText = { [K in keyof typeof SUMMARY_TEXT_EN]: string };

/**
 * Localization hooks for `buildSummaryText`. Every field is optional and
 * defaults to the English text and formatting the summary has always used, so
 * the engine (and the MCP server that imports it) is unchanged unless a caller
 * opts in. The site's localized page passes catalog text, the selected display
 * currency and the page language's number format.
 */
export interface SummaryOptions {
  text?: SummaryText;
  money?: (n: number) => string;
  /** Numbers in prose; `digits` fixes the decimals, omitted prints as-is. */
  num?: (n: number, digits?: number) => string;
  deployLabel?: (deployIdx: number) => string;
  doraLabel?: (doraLabel: string) => string;
  burdenLabel?: (key: BurdenKey) => string;
  contextNote?: (key: BurdenKey, pct: number, formattedAnnualCost: string) => string;
  payback?: (months: number) => string;
}

const enNum = (n: number, digits?: number): string =>
  digits === undefined ? String(n) : n.toFixed(digits);

export function buildSummaryText(
  state: CalcState,
  result: CalcResult,
  symbol: string = '$',
  url?: string,
  options: SummaryOptions = {}
): string {
  const t = options.text ?? SUMMARY_TEXT_EN;
  const f = options.money ?? ((n: number) => fmtShortC(n, symbol));
  const num = options.num ?? enNum;
  const teamSize = state.teamSize;
  const deploy = DEPLOY_OPTIONS[state.deployIdx];
  const key = burdenKeyOf(state.maintPct);
  const date = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    t.title,
    fill(t.generated, { date }),
    '────────────────────────────────────────',
    fill(t.team, { team: num(teamSize), salary: f(state.salary) }),
    fill(t.burden, { pct: num(state.maintPct) }),
    fill(t.deploy, {
      deploy: options.deployLabel?.(state.deployIdx) ?? deploy.label,
      dora: options.doraLabel?.(deploy.doraLabel) ?? deploy.doraLabel,
      v: num(deploy.V),
    }),
    '',
    fill(t.annual, { amount: f(result.annualCost) }),
    fill(t.monthly, { amount: f(result.totalMonthly) }),
    fill(t.hoursLost, { hours: num(result.hoursLostPerEng, 0) }),
    fill(t.costPerEng, { amount: f(result.costPerEng) }),
    fill(t.ftesLost, { ftes: num(teamSize * (state.maintPct / 100), 1) }),
    fill(t.burdenLevel, { level: options.burdenLabel?.(key) ?? BURDEN_TEXT_EN[key].plain }),
  ];

  if (state.advancedOpen) {
    lines.push('', fill(t.direct, { amount: f(result.directMonthly) }));
    if (state.contextSwitchOn) {
      lines.push(fill(t.contextSwitch, { amount: f(result.contextSwitchMonthly) }));
    }
    lines.push(
      fill(t.incident, { amount: f(result.incidentMonthly) }),
      fill(t.debtPctArr, { pct: num(result.debtPctArr, 1) }),
      fill(t.efficiency, { pct: num(state.remediationPct) }),
      fill(t.payback, {
        payback: (options.payback ?? fmtPayback)(result.paybackMonths),
      })
    );
  }

  const cost = f(result.annualCost);
  lines.push(
    '',
    options.contextNote?.(key, state.maintPct, cost) ?? contextNote(state.maintPct, cost)
  );
  lines.push(
    '',
    fill(t.footer, {
      url: url || 'https://globalstrategic.tech/hub/tools/tech-debt-calculator',
    })
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
