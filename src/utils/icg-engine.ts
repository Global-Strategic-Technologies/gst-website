/**
 * Infrastructure Cost Governance — pure calculation engine
 *
 * All functions are stateless and side-effect free, making them
 * directly importable by unit tests and by the page <script> block.
 */

import type { Domain } from '../data/infrastructure-cost-governance/domains';
import type { Recommendation } from '../data/infrastructure-cost-governance/recommendations';

// ─── State & result types ────────────────────────────────────────────────────

export type CompanyStage = 'pre-series-b' | 'series-bc' | 'pe-backed' | 'enterprise';

export interface ICGState {
  answers: Record<string, number>;
  currentStep: number;
  dismissed: string[];
  expanded?: string[];
  companyStage?: CompanyStage;
}

export interface DomainScore {
  domainId: string;
  name: string;
  score: number;
  rawScore: number;
  maxScore: number;
  isFoundational: boolean;
  belowFoundationalThreshold: boolean;
  skippedCount: number;
}

export interface ICGResult {
  overallScore: number;
  maturityLevel: 'Reactive' | 'Aware' | 'Optimizing' | 'Strategic';
  maturityColor: string;
  domainScores: DomainScore[];
  showFoundationalFlag: boolean;
  recommendations: Recommendation[];
  answeredCount: number;
  totalQuestions: number;
  skippedCount: number;
}

// ─── Maturity thresholds ────────────────────────────────────────────────────

/** Score ceilings for each maturity level (Reactive ≤ 25, Aware ≤ 50, Optimizing ≤ 75, Strategic > 75) */
export const MATURITY_THRESHOLDS = {
  reactive: 25,
  aware: 50,
  optimizing: 75,
} as const;

/** A foundational domain scoring at or below this value triggers the foundational-gap flag */
export const FOUNDATIONAL_THRESHOLD = 33;

// ─── Maturity level ──────────────────────────────────────────────────────────

export function getMaturityLevel(score: number): {
  level: ICGResult['maturityLevel'];
  color: string;
} {
  if (score <= MATURITY_THRESHOLDS.reactive)
    return { level: 'Reactive', color: 'var(--color-error)' };
  if (score <= MATURITY_THRESHOLDS.aware) return { level: 'Aware', color: 'var(--color-warning)' };
  if (score <= MATURITY_THRESHOLDS.optimizing)
    return { level: 'Optimizing', color: 'var(--color-success)' };
  return { level: 'Strategic', color: 'var(--color-primary)' };
}

// ─── Foundational flag ──────────────────────────────────────────────────────

export function checkFoundationalFlag(domainScores: DomainScore[]): boolean {
  return domainScores.some((d) => d.isFoundational && d.score <= FOUNDATIONAL_THRESHOLD);
}

// ─── Recommendations ────────────────────────────────────────────────────────

const IMPACT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const EFFORT_ORDER: Record<string, number> = { 'quick-win': 0, project: 1, initiative: 2 };
const DOMAIN_ORDER: Record<string, number> = { d1: 0, d2: 1, d3: 2, d4: 3, d5: 4, d6: 5 };

export function getRecommendations(
  state: ICGState,
  allRecs: readonly Recommendation[]
): Recommendation[] {
  return allRecs
    .filter((r) => {
      const answer = state.answers[r.triggerQuestionId];
      // -1 ("Not sure") and undefined both treated as 0 for triggering
      const effective = answer === undefined || answer === -1 ? 0 : answer;
      return effective <= r.triggerThreshold;
    })
    .sort((a, b) => {
      const impactDiff = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
      if (impactDiff !== 0) return impactDiff;
      const effortDiff = (EFFORT_ORDER[a.effort] ?? 1) - (EFFORT_ORDER[b.effort] ?? 1);
      if (effortDiff !== 0) return effortDiff;
      return (DOMAIN_ORDER[a.domain] ?? 0) - (DOMAIN_ORDER[b.domain] ?? 0);
    });
}

// ─── Core calculation ────────────────────────────────────────────────────────

export function calculateResults(state: ICGState, domains: readonly Domain[]): ICGResult {
  const totalQuestions = domains.reduce((sum, d) => sum + d.questions.length, 0);

  const domainScores: DomainScore[] = domains.map((d) => {
    const maxScore = d.questions.length * 3;
    const skippedCount = d.questions.filter((q) => state.answers[q.id] === -1).length;
    // -1 ("Not sure") scores as -1 — ignorance is worse than known absence (0)
    // Unanswered questions default to 0; "Not sure" actively penalizes
    const rawScore = d.questions.reduce((sum, q) => {
      const a = state.answers[q.id];
      return sum + (a === undefined ? 0 : a);
    }, 0);
    const score = Math.max(0, Math.round((rawScore / maxScore) * 100));
    return {
      domainId: d.id,
      name: d.name,
      score,
      rawScore,
      maxScore,
      isFoundational: d.foundational,
      belowFoundationalThreshold: d.foundational && score <= FOUNDATIONAL_THRESHOLD,
      skippedCount,
    };
  });

  const answeredCount = Object.keys(state.answers).length;
  const skippedCount = Object.values(state.answers).filter((v) => v === -1).length;

  const totalWeight = domains.reduce((sum, d) => sum + d.weight, 0);
  const weightedSum = domainScores.reduce((sum, ds, i) => {
    return sum + ds.score * domains[i].weight;
  }, 0);
  const overallScore = Math.round(weightedSum / totalWeight);

  const { level: maturityLevel, color: maturityColor } = getMaturityLevel(overallScore);
  const showFoundationalFlag = checkFoundationalFlag(domainScores);

  return {
    overallScore,
    maturityLevel,
    maturityColor,
    domainScores,
    showFoundationalFlag,
    recommendations: [], // populated separately via getRecommendations
    answeredCount,
    totalQuestions,
    skippedCount,
  };
}

// ─── URL state serialisation ────────────────────────────────────────────────
//
// Compact key map keeps the base64 string short.

export function encodeState(state: ICGState): string {
  const compact: Record<string, unknown> = {
    s: state.currentStep,
    a: state.answers,
  };
  if (state.dismissed.length > 0) {
    compact.d = state.dismissed;
  }
  if (state.expanded && state.expanded.length > 0) {
    compact.e = state.expanded;
  }
  if (state.companyStage) {
    compact.g = state.companyStage;
  }
  return btoa(JSON.stringify(compact));
}

export function decodeState(encoded: string): Partial<ICGState> | null {
  try {
    if (!encoded) return null;
    const raw = JSON.parse(atob(encoded));
    if (typeof raw !== 'object' || raw === null) return null;

    const out: Partial<ICGState> = {};

    if (Number.isInteger(raw.s) && raw.s >= 0 && raw.s <= 7) {
      out.currentStep = raw.s;
    }

    if (typeof raw.a === 'object' && raw.a !== null && !Array.isArray(raw.a)) {
      const answers: Record<string, number> = {};
      for (const [key, val] of Object.entries(raw.a)) {
        if (typeof val === 'number' && Number.isInteger(val) && val >= -1 && val <= 3) {
          answers[key] = val;
        }
      }
      out.answers = answers;
    }

    if (Array.isArray(raw.d)) {
      out.dismissed = raw.d.filter((v: unknown) => typeof v === 'string');
    }

    if (Array.isArray(raw.e)) {
      out.expanded = raw.e.filter((v: unknown) => typeof v === 'string');
    }

    const VALID_STAGES: CompanyStage[] = ['pre-series-b', 'series-bc', 'pe-backed', 'enterprise'];
    if (typeof raw.g === 'string' && VALID_STAGES.includes(raw.g as CompanyStage)) {
      out.companyStage = raw.g as CompanyStage;
    }

    return out;
  } catch {
    return null;
  }
}

// ─── Summary text ───────────────────────────────────────────────────────────

export function buildSummaryText(
  _state: ICGState,
  result: ICGResult,
  _domains: readonly Domain[],
  recs: readonly Recommendation[],
  url?: string
): string {
  const date = new Date().toISOString().slice(0, 10);
  const { level } = getMaturityLevel(result.overallScore);

  const lines: string[] = [
    'Infrastructure Cost Governance - Summary',
    `Generated: ${date}`,
    '────────────────────────────────────────',
    `Overall score: ${result.overallScore}/100 (${level})`,
    `Questions answered: ${result.answeredCount} of ${result.totalQuestions}`,
  ];

  if (result.skippedCount > 0) {
    lines.push(`"Not sure" responses: ${result.skippedCount} (scored as zero)`);
  }

  if (result.showFoundationalFlag) {
    const belowNames = result.domainScores
      .filter((ds) => ds.isFoundational && ds.belowFoundationalThreshold)
      .map((ds) => ds.name);
    lines.push(`⚠ Foundational gap: ${belowNames.join(' and ')} scored below threshold`);
  }

  lines.push('', 'Domain breakdown:');
  for (const ds of result.domainScores) {
    const { level: dl } = getMaturityLevel(ds.score);
    lines.push(`  ${ds.name}: ${ds.score}/100 (${dl})`);
  }

  if (recs.length > 0) {
    lines.push('', `Active recommendations: ${recs.length}`);
    for (const r of recs) {
      lines.push(`  [${r.impact.toUpperCase()}] ${r.title}`);
    }
  }

  if (url) {
    lines.push('', `Generated by GST | ${url}`);
  }

  return lines.join('\n');
}

// ─── JSON export ────────────────────────────────────────────────────────────

export interface ICGExport {
  exportedAt: string;
  toolVersion: string;
  overallScore: number;
  maturityLevel: string;
  domainScores: DomainScore[];
  showFoundationalFlag: boolean;
  answeredCount: number;
  totalQuestions: number;
  skippedCount: number;
  answers: Record<string, number>;
  recommendations: Array<{
    id: string;
    title: string;
    impact: string;
    effort: string;
    domain: string;
  }>;
}

export function buildExportPayload(
  state: ICGState,
  result: ICGResult,
  recs: readonly Recommendation[]
): ICGExport {
  return {
    exportedAt: new Date().toISOString(),
    toolVersion: '1.1',
    overallScore: result.overallScore,
    maturityLevel: result.maturityLevel,
    domainScores: result.domainScores,
    showFoundationalFlag: result.showFoundationalFlag,
    answeredCount: result.answeredCount,
    totalQuestions: result.totalQuestions,
    skippedCount: result.skippedCount,
    answers: { ...state.answers },
    recommendations: recs.map((r) => ({
      id: r.id,
      title: r.title,
      impact: r.impact,
      effort: r.effort,
      domain: r.domain,
    })),
  };
}

// ─── Quick wins ─────────────────────────────────────────────────────────────

export function getQuickWins(recs: readonly Recommendation[], limit = 3): Recommendation[] {
  return recs.filter((r) => r.impact === 'high' && r.effort === 'quick-win').slice(0, limit);
}

// ─── Benchmark contextualization ────────────────────────────────────────────

export interface BenchmarkRange {
  label: string;
  low: number;
  high: number;
  stageKey: CompanyStage;
}

export const BENCHMARK_RANGES: readonly BenchmarkRange[] = [
  { label: 'Pre-Series B', low: 15, high: 35, stageKey: 'pre-series-b' },
  { label: 'Series B-C', low: 30, high: 55, stageKey: 'series-bc' },
  { label: 'PE-backed 2+ yr', low: 45, high: 70, stageKey: 'pe-backed' },
  { label: 'Enterprise', low: 65, high: 90, stageKey: 'enterprise' },
];

/** Return the first benchmark range that contains the given score, or null. */
export function findMatchingRange(score: number): BenchmarkRange | null {
  return BENCHMARK_RANGES.find((r) => score >= r.low && score <= r.high) ?? null;
}

export function contextualizeScore(score: number, stage?: CompanyStage): string | null {
  if (!stage) return null;
  const range = BENCHMARK_RANGES.find((r) => r.stageKey === stage);
  if (!range) return null;
  if (score < range.low)
    return `Your score of ${score} is below the typical range for ${range.label} companies (${range.low}\u2013${range.high})`;
  if (score > range.high)
    return `Your score of ${score} is above the typical range for ${range.label} companies (${range.low}\u2013${range.high})`;
  return `Your score of ${score} is within the typical range for ${range.label} companies (${range.low}\u2013${range.high})`;
}

// ─── Comparison / snapshots ─────────────────────────────────────────────────

export interface ICGSnapshot {
  id: string;
  label: string;
  timestamp: string;
  encodedState: string;
}

export interface ICGComparison {
  a: { label: string; overallScore: number; maturityLevel: string };
  b: { label: string; overallScore: number; maturityLevel: string };
  overallDelta: number;
  domainDeltas: Array<{
    domainId: string;
    name: string;
    scoreA: number;
    scoreB: number;
    delta: number;
  }>;
}

export function compareSnapshots(
  snapshotA: ICGSnapshot,
  snapshotB: ICGSnapshot,
  domains: readonly Domain[]
): ICGComparison | null {
  const stateA = decodeState(snapshotA.encodedState);
  const stateB = decodeState(snapshotB.encodedState);
  if (!stateA?.answers || !stateB?.answers) return null;

  const fullA: ICGState = { ...DEFAULT_STATE, ...stateA };
  const fullB: ICGState = { ...DEFAULT_STATE, ...stateB };

  const resultA = calculateResults(fullA, domains);
  const resultB = calculateResults(fullB, domains);

  return {
    a: {
      label: snapshotA.label,
      overallScore: resultA.overallScore,
      maturityLevel: resultA.maturityLevel,
    },
    b: {
      label: snapshotB.label,
      overallScore: resultB.overallScore,
      maturityLevel: resultB.maturityLevel,
    },
    overallDelta: resultB.overallScore - resultA.overallScore,
    domainDeltas: resultA.domainScores.map((dsA, i) => ({
      domainId: dsA.domainId,
      name: dsA.name,
      scoreA: dsA.score,
      scoreB: resultB.domainScores[i].score,
      delta: resultB.domainScores[i].score - dsA.score,
    })),
  };
}

// ─── Radar chart ────────────────────────────────────────────────────────────

/**
 * Builds SVG polygon points for the radar chart.
 * Accepts the minimal shape it actually reads — name+score — so callers
 * with stricter or looser DomainScore types don't need casts.
 */
export function buildRadarPoints(
  domainScores: ReadonlyArray<Pick<DomainScore, 'name' | 'score'>>,
  cx: number,
  cy: number,
  radius: number
): string {
  return domainScores
    .map((ds, i) => {
      const angle = (Math.PI * 2 * i) / domainScores.length - Math.PI / 2;
      const r = (ds.score / 100) * radius;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// ─── Default initial state ──────────────────────────────────────────────────

export const DEFAULT_STATE: ICGState = {
  answers: {},
  currentStep: 0,
  dismissed: [],
};
