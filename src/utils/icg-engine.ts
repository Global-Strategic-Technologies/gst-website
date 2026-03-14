/**
 * Infrastructure Cost Governance — pure calculation engine
 *
 * All functions are stateless and side-effect free, making them
 * directly importable by unit tests and by the page <script> block.
 */

import type { Domain } from '../data/infrastructure-cost-governance/domains';
import type { Recommendation } from '../data/infrastructure-cost-governance/recommendations';

// ─── State & result types ────────────────────────────────────────────────────

export interface ICGState {
  answers: Record<string, number>;
  currentStep: number;
  dismissed: string[];
}

export interface DomainScore {
  domainId: string;
  name: string;
  score: number;
  rawScore: number;
  maxScore: number;
  isFoundational: boolean;
  belowFoundationalThreshold: boolean;
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
}

// ─── Maturity level ──────────────────────────────────────────────────────────

export function getMaturityLevel(score: number): { level: ICGResult['maturityLevel']; color: string } {
  if (score <= 25) return { level: 'Reactive',   color: '#E24B4A' };
  if (score <= 50) return { level: 'Aware',      color: '#EF9F27' };
  if (score <= 75) return { level: 'Optimizing', color: '#639922' };
  return                   { level: 'Strategic',  color: 'var(--color-primary)' };
}

// ─── Foundational flag ──────────────────────────────────────────────────────

export function checkFoundationalFlag(domainScores: DomainScore[]): boolean {
  const d1 = domainScores.find(d => d.isFoundational);
  return d1 ? d1.score <= 33 : false;
}

// ─── Recommendations ────────────────────────────────────────────────────────

const IMPACT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const DOMAIN_ORDER: Record<string, number> = { d1: 0, d2: 1, d3: 2, d4: 3, d5: 4 };

export function getRecommendations(
  state: ICGState,
  allRecs: readonly Recommendation[],
): Recommendation[] {
  return allRecs
    .filter(r => (state.answers[r.triggerQuestionId] ?? 0) <= r.triggerThreshold)
    .sort((a, b) => {
      const impactDiff = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
      if (impactDiff !== 0) return impactDiff;
      return (DOMAIN_ORDER[a.domain] ?? 0) - (DOMAIN_ORDER[b.domain] ?? 0);
    });
}

// ─── Core calculation ────────────────────────────────────────────────────────

export function calculateResults(state: ICGState, domains: readonly Domain[]): ICGResult {
  const totalQuestions = domains.reduce((sum, d) => sum + d.questions.length, 0);
  const answeredCount = Object.keys(state.answers).length;

  const domainScores: DomainScore[] = domains.map(d => {
    const maxScore = d.questions.length * 3;
    const rawScore = d.questions.reduce((sum, q) => sum + (state.answers[q.id] ?? 0), 0);
    const score = Math.round((rawScore / maxScore) * 100);
    return {
      domainId: d.id,
      name: d.name,
      score,
      rawScore,
      maxScore,
      isFoundational: d.foundational,
      belowFoundationalThreshold: d.foundational && score <= 33,
    };
  });

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
  return btoa(JSON.stringify(compact));
}

export function decodeState(encoded: string): Partial<ICGState> | null {
  try {
    if (!encoded) return null;
    const raw = JSON.parse(atob(encoded));
    if (typeof raw !== 'object' || raw === null) return null;

    const out: Partial<ICGState> = {};

    if (Number.isInteger(raw.s) && raw.s >= 0 && raw.s <= 6) {
      out.currentStep = raw.s;
    }

    if (typeof raw.a === 'object' && raw.a !== null && !Array.isArray(raw.a)) {
      const answers: Record<string, number> = {};
      for (const [key, val] of Object.entries(raw.a)) {
        if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 3) {
          answers[key] = val;
        }
      }
      out.answers = answers;
    }

    if (Array.isArray(raw.d)) {
      out.dismissed = raw.d.filter((v: unknown) => typeof v === 'string');
    }

    return out;
  } catch {
    return null;
  }
}

// ─── Default initial state ──────────────────────────────────────────────────

export const DEFAULT_STATE: ICGState = {
  answers: {},
  currentStep: 0,
  dismissed: [],
};
