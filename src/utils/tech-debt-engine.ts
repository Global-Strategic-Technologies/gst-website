/**
 * Tech Debt Cost Calculator — pure calculation engine
 *
 * All functions are stateless and side-effect free, making them
 * directly importable by unit tests and by the page <script> block.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEPLOY_OPTIONS = [
  { label: 'Multiple/day', doraLabel: 'Elite',  V: 0.8  },
  { label: 'Daily',        doraLabel: 'Elite',  V: 0.9  },
  { label: 'Weekly',       doraLabel: 'High',   V: 1.0  },
  { label: 'Bi-weekly',    doraLabel: 'High',   V: 1.1  },
  { label: 'Three-week',   doraLabel: 'Medium', V: 1.25 },
  { label: 'Monthly',      doraLabel: 'Medium', V: 1.45 },
  { label: 'Quarterly+',   doraLabel: 'Low',    V: 1.7  },
  { label: 'Bi-annually',  doraLabel: 'Low',    V: 2.0  },
  { label: 'Annually',     doraLabel: 'Low',    V: 2.4  },
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

export const salaryToPos = (v: number): number =>
  Math.round(Math.sqrt((v - 60000) / 940000) * 100);

export const budgetToPos = (v: number): number =>
  Math.round(Math.pow((v - 10000) / 49990000, 1 / 2.5) * 100);

export const arrToPos = (v: number): number =>
  Math.round(Math.pow((v - 100000) / 999900000, 1 / 2.5) * 100);

// ─── State & result types ─────────────────────────────────────────────────────

export interface CalcState {
  advancedOpen: boolean;
  teamSizePos: number;
  salaryPos: number;
  maintPct: number;
  deployIdx: number;
  incidents: number;
  mttr: number;
  budgetPos: number;
  arrPos: number;
}

export interface CalcResult {
  totalMonthly: number;
  annualCost: number;
  hoursLostPerEng: number;
  costPerEng: number;
  directMonthly: number;
  incidentMonthly: number;
  V: number;
  doraLabel: string;
  debtPctArr: number;
  paybackMonths: number;
  monthlySavings: number;
}

// ─── Core calculation ─────────────────────────────────────────────────────────

export function calculate(state: CalcState): CalcResult {
  const teamSize  = posToTeamSize(state.teamSizePos);
  const salary    = posToSalary(state.salaryPos);
  const budgetVal = posTobudget(state.budgetPos);
  const arrVal    = posToArr(state.arrPos);
  const hourlyRate = salary / 2080;
  const deploy    = DEPLOY_OPTIONS[state.deployIdx];
  const V         = deploy.V;

  const directMonthly   = teamSize * (salary / 12) * (state.maintPct / 100) * V;
  const incidentMonthly = state.incidents * state.mttr * hourlyRate;
  const hoursLostPerEng = 40 * (state.maintPct / 100);
  const totalMonthly    = state.advancedOpen
    ? directMonthly + incidentMonthly
    : directMonthly;
  const annualCost      = totalMonthly * 12;
  const debtPctArr      = arrVal > 0 ? (annualCost / arrVal) * 100 : 0;
  const monthlySavings  = totalMonthly;
  const paybackMonths   = monthlySavings > 0 ? budgetVal / monthlySavings : Infinity;

  return {
    totalMonthly,
    annualCost,
    hoursLostPerEng,
    costPerEng: totalMonthly / teamSize,
    directMonthly,
    incidentMonthly,
    V,
    doraLabel: deploy.doraLabel,
    debtPctArr,
    paybackMonths,
    monthlySavings,
  };
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
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

export const fmtPayback = (months: number): string => {
  if (months < 1)  return '< 1 mo';
  if (months > 60) return '> 5 yrs';
  return `${months.toFixed(1)} mo`;
};

// ─── Default initial state ────────────────────────────────────────────────────

export const DEFAULT_STATE: CalcState = {
  advancedOpen: false,
  teamSizePos: teamSizeToPos(8),
  salaryPos:   salaryToPos(150000),
  maintPct:    40,
  deployIdx:   3,
  incidents:   3,
  mttr:        4,
  budgetPos:   budgetToPos(500000),
  arrPos:      arrToPos(10000000),
};
