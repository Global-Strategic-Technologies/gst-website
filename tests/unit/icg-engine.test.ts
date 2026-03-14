/**
 * Unit Tests for Infrastructure Cost Governance Engine
 *
 * Tests all pure functions:
 * - calculateResults(): domain scoring, weighted overall, maturity levels
 * - getMaturityLevel(): threshold boundaries
 * - getRecommendations(): filtering and sorting
 * - checkFoundationalFlag(): D1 threshold detection
 * - encodeState / decodeState: URL serialisation round-trip
 * - Data integrity: question/recommendation cross-references
 */

import {
  calculateResults,
  getMaturityLevel,
  getRecommendations,
  checkFoundationalFlag,
  encodeState,
  decodeState,
  DEFAULT_STATE,
} from '../../src/utils/icg-engine';

import type { ICGState, DomainScore } from '../../src/utils/icg-engine';

import { DOMAINS, ANSWER_OPTIONS, TOTAL_QUESTIONS } from '../../src/data/infrastructure-cost-governance/domains';
import { RECOMMENDATIONS } from '../../src/data/infrastructure-cost-governance/recommendations';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ICGState> = {}): ICGState {
  return { ...DEFAULT_STATE, ...overrides };
}

/** Create an answers map with all questions set to a given score */
function allAnswers(score: number): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const domain of DOMAINS) {
    for (const q of domain.questions) {
      answers[q.id] = score;
    }
  }
  return answers;
}

/** Create answers for a specific domain with all questions at a given score */
function domainAnswers(domainId: string, score: number): Record<string, number> {
  const answers: Record<string, number> = {};
  const domain = DOMAINS.find(d => d.id === domainId);
  if (domain) {
    for (const q of domain.questions) {
      answers[q.id] = score;
    }
  }
  return answers;
}

// ─── getMaturityLevel ────────────────────────────────────────────────────────

describe('getMaturityLevel', () => {
  it('returns Reactive for score 0', () => {
    expect(getMaturityLevel(0).level).toBe('Reactive');
  });

  it('returns Reactive at boundary score 25', () => {
    expect(getMaturityLevel(25).level).toBe('Reactive');
  });

  it('returns Aware at score 26', () => {
    expect(getMaturityLevel(26).level).toBe('Aware');
  });

  it('returns Aware at boundary score 50', () => {
    expect(getMaturityLevel(50).level).toBe('Aware');
  });

  it('returns Optimizing at score 51', () => {
    expect(getMaturityLevel(51).level).toBe('Optimizing');
  });

  it('returns Optimizing at boundary score 75', () => {
    expect(getMaturityLevel(75).level).toBe('Optimizing');
  });

  it('returns Strategic at score 76', () => {
    expect(getMaturityLevel(76).level).toBe('Strategic');
  });

  it('returns Strategic at score 100', () => {
    expect(getMaturityLevel(100).level).toBe('Strategic');
  });

  it('uses var(--color-primary) for Strategic', () => {
    expect(getMaturityLevel(100).color).toBe('var(--color-primary)');
  });
});

// ─── checkFoundationalFlag ───────────────────────────────────────────────────

describe('checkFoundationalFlag', () => {
  it('returns true when foundational domain score is exactly 33', () => {
    const scores: DomainScore[] = [
      { domainId: 'd1', name: 'Test', score: 33, rawScore: 3, maxScore: 9, isFoundational: true, belowFoundationalThreshold: true },
    ];
    expect(checkFoundationalFlag(scores)).toBe(true);
  });

  it('returns false when foundational domain score is 34', () => {
    const scores: DomainScore[] = [
      { domainId: 'd1', name: 'Test', score: 34, rawScore: 3, maxScore: 9, isFoundational: true, belowFoundationalThreshold: false },
    ];
    expect(checkFoundationalFlag(scores)).toBe(false);
  });

  it('returns false when no foundational domain exists', () => {
    const scores: DomainScore[] = [
      { domainId: 'd2', name: 'Test', score: 10, rawScore: 1, maxScore: 9, isFoundational: false, belowFoundationalThreshold: false },
    ];
    expect(checkFoundationalFlag(scores)).toBe(false);
  });

  it('returns true when foundational domain score is 0', () => {
    const scores: DomainScore[] = [
      { domainId: 'd1', name: 'Test', score: 0, rawScore: 0, maxScore: 9, isFoundational: true, belowFoundationalThreshold: true },
    ];
    expect(checkFoundationalFlag(scores)).toBe(true);
  });
});

// ─── calculateResults ────────────────────────────────────────────────────────

describe('calculateResults', () => {
  it('returns 0 overall score when all answers are 0', () => {
    const state = makeState({ answers: allAnswers(0), currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    expect(result.overallScore).toBe(0);
  });

  it('returns 100 overall score when all answers are 3 (Optimized)', () => {
    const state = makeState({ answers: allAnswers(3), currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    expect(result.overallScore).toBe(100);
  });

  it('returns correct maturity level for all-zero answers', () => {
    const state = makeState({ answers: allAnswers(0), currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    expect(result.maturityLevel).toBe('Reactive');
  });

  it('returns correct maturity level for all-optimized answers', () => {
    const state = makeState({ answers: allAnswers(3), currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    expect(result.maturityLevel).toBe('Strategic');
  });

  it('calculates correct per-domain score for Domain 1 with all answers at 1', () => {
    const answers = domainAnswers('d1', 1);
    const state = makeState({ answers, currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    const d1 = result.domainScores.find(d => d.domainId === 'd1')!;
    // 3 questions * 1 score = 3, max = 9, (3/9)*100 = 33
    expect(d1.score).toBe(33);
  });

  it('calculates correct per-domain score for Domain 5 with all answers at 2', () => {
    const answers = domainAnswers('d5', 2);
    const state = makeState({ answers, currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    const d5 = result.domainScores.find(d => d.domainId === 'd5')!;
    // 4 questions * 2 score = 8, max = 12, (8/12)*100 = 67
    expect(d5.score).toBe(67);
  });

  it('applies D1 weight of 1.5 in weighted overall score', () => {
    // Give D1 all 3s (score 100), everything else 0s (score 0)
    const answers = { ...allAnswers(0), ...domainAnswers('d1', 3) };
    const state = makeState({ answers, currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    // D1=100*1.5, D2-D5=0*1.0 each. Total weight=5.5
    // (150) / 5.5 = 27.27 -> 27
    expect(result.overallScore).toBe(27);
  });

  it('sets showFoundationalFlag when D1 score is 33', () => {
    const answers = domainAnswers('d1', 1); // score = 33
    const state = makeState({ answers, currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    expect(result.showFoundationalFlag).toBe(true);
  });

  it('does not set showFoundationalFlag when D1 score is above 33', () => {
    const answers = domainAnswers('d1', 2); // score = 67
    const state = makeState({ answers, currentStep: 6 });
    const result = calculateResults(state, DOMAINS);
    expect(result.showFoundationalFlag).toBe(false);
  });

  it('reports correct answeredCount', () => {
    const answers = { q1_1: 2, q1_2: 1, q1_3: 3 };
    const state = makeState({ answers, currentStep: 2 });
    const result = calculateResults(state, DOMAINS);
    expect(result.answeredCount).toBe(3);
  });

  it('reports correct totalQuestions', () => {
    const state = makeState();
    const result = calculateResults(state, DOMAINS);
    expect(result.totalQuestions).toBe(16);
  });

  it('returns 5 domain scores', () => {
    const state = makeState({ answers: allAnswers(2) });
    const result = calculateResults(state, DOMAINS);
    expect(result.domainScores).toHaveLength(5);
  });
});

// ─── getRecommendations ──────────────────────────────────────────────────────

describe('getRecommendations', () => {
  it('returns recommendations where answer score <= threshold', () => {
    // q1_1 at score 0 should trigger r01 (threshold 1) and r02 (threshold 0)
    const state = makeState({ answers: { q1_1: 0 } });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const r01 = recs.find(r => r.id === 'r01');
    const r02 = recs.find(r => r.id === 'r02');
    expect(r01).toBeDefined();
    expect(r02).toBeDefined();
  });

  it('does not return recommendations where answer score > threshold', () => {
    // q1_1 at score 2 should not trigger r01 (threshold 1) or r02 (threshold 0)
    const state = makeState({ answers: { q1_1: 2 } });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const r01 = recs.find(r => r.id === 'r01');
    const r02 = recs.find(r => r.id === 'r02');
    expect(r01).toBeUndefined();
    expect(r02).toBeUndefined();
  });

  it('sorts by impact tier: high before medium before low', () => {
    const state = makeState({ answers: allAnswers(0) });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    for (let i = 1; i < recs.length; i++) {
      const prevOrder = { high: 0, medium: 1, low: 2 }[recs[i - 1].impact];
      const currOrder = { high: 0, medium: 1, low: 2 }[recs[i].impact];
      expect(prevOrder).toBeLessThanOrEqual(currOrder);
    }
  });

  it('returns empty array when all answers are Optimized', () => {
    const state = makeState({ answers: allAnswers(3) });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    expect(recs).toHaveLength(0);
  });

  it('treats unanswered questions as score 0', () => {
    // Empty answers means every question defaults to 0
    const state = makeState({ answers: {} });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    expect(recs.length).toBeGreaterThan(0);
  });
});

// ─── encodeState / decodeState ───────────────────────────────────────────────

describe('encodeState / decodeState', () => {
  it('round-trips without data loss', () => {
    const state: ICGState = {
      currentStep: 3,
      answers: { q1_1: 2, q2_3: 1, q5_4: 0 },
      dismissed: [],
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded).toEqual({
      currentStep: 3,
      answers: { q1_1: 2, q2_3: 1, q5_4: 0 },
    });
  });

  it('round-trips with all answers filled', () => {
    const state = makeState({ answers: allAnswers(2), currentStep: 6 });
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded?.currentStep).toBe(6);
    expect(decoded?.answers).toEqual(state.answers);
  });

  it('returns null on invalid base64', () => {
    expect(decodeState('not-valid-base64!!!')).toBeNull();
  });

  it('returns null on empty string', () => {
    expect(decodeState('')).toBeNull();
  });

  it('returns null on valid base64 but invalid JSON', () => {
    expect(decodeState(btoa('not json'))).toBeNull();
  });

  it('returns null on valid JSON but not an object', () => {
    expect(decodeState(btoa('"just a string"'))).toBeNull();
  });

  it('validates currentStep range', () => {
    const encoded = btoa(JSON.stringify({ s: 7, a: {} }));
    const decoded = decodeState(encoded);
    expect(decoded?.currentStep).toBeUndefined();
  });

  it('validates answer score range', () => {
    const encoded = btoa(JSON.stringify({ s: 1, a: { q1_1: 5 } }));
    const decoded = decodeState(encoded);
    expect(decoded?.answers?.q1_1).toBeUndefined();
  });

  it('round-trips dismissed recommendation IDs', () => {
    const state: ICGState = {
      currentStep: 6,
      answers: { q1_1: 0 },
      dismissed: ['r01', 'r05'],
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded?.dismissed).toEqual(['r01', 'r05']);
  });

  it('omits dismissed key when empty', () => {
    const state: ICGState = {
      currentStep: 1,
      answers: {},
      dismissed: [],
    };
    const encoded = encodeState(state);
    const raw = JSON.parse(atob(encoded));
    expect(raw.d).toBeUndefined();
  });

  it('filters non-string values from dismissed array', () => {
    const encoded = btoa(JSON.stringify({ s: 6, a: {}, d: ['r01', 42, null, 'r03'] }));
    const decoded = decodeState(encoded);
    expect(decoded?.dismissed).toEqual(['r01', 'r03']);
  });
});

// ─── DEFAULT_STATE ───────────────────────────────────────────────────────────

describe('DEFAULT_STATE', () => {
  it('starts at step 0', () => {
    expect(DEFAULT_STATE.currentStep).toBe(0);
  });

  it('has empty answers', () => {
    expect(Object.keys(DEFAULT_STATE.answers)).toHaveLength(0);
  });

  it('has empty dismissed array', () => {
    expect(DEFAULT_STATE.dismissed).toEqual([]);
  });
});

// ─── Data integrity ─────────────────────────────────────────────────────────

describe('data integrity', () => {
  it('has exactly 16 total questions', () => {
    expect(TOTAL_QUESTIONS).toBe(16);
  });

  it('has 5 domains', () => {
    expect(DOMAINS).toHaveLength(5);
  });

  it('every question has a unique id', () => {
    const ids = DOMAINS.flatMap(d => d.questions.map(q => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every question references its parent domain', () => {
    for (const domain of DOMAINS) {
      for (const q of domain.questions) {
        expect(q.domain).toBe(domain.id);
      }
    }
  });

  it('answer options have scores 0, 1, 2, 3', () => {
    const scores = ANSWER_OPTIONS.map(o => o.score);
    expect(scores).toEqual([0, 1, 2, 3]);
  });

  it('answer options have exactly 4 entries', () => {
    expect(ANSWER_OPTIONS).toHaveLength(4);
  });

  it('domain weights are correct (D1=1.5, others=1.0)', () => {
    const d1 = DOMAINS.find(d => d.id === 'd1')!;
    expect(d1.weight).toBe(1.5);
    for (const d of DOMAINS.filter(d => d.id !== 'd1')) {
      expect(d.weight).toBe(1.0);
    }
  });

  it('only D1 is foundational', () => {
    const foundational = DOMAINS.filter(d => d.foundational);
    expect(foundational).toHaveLength(1);
    expect(foundational[0].id).toBe('d1');
  });

  it('every recommendation triggerQuestionId maps to a valid question', () => {
    const questionIds = new Set(DOMAINS.flatMap(d => d.questions.map(q => q.id)));
    for (const rec of RECOMMENDATIONS) {
      expect(questionIds.has(rec.triggerQuestionId)).toBe(true);
    }
  });

  it('every recommendation has a valid impact tier', () => {
    for (const rec of RECOMMENDATIONS) {
      expect(['high', 'medium', 'low']).toContain(rec.impact);
    }
  });

  it('every recommendation has a triggerThreshold of 0 or 1', () => {
    for (const rec of RECOMMENDATIONS) {
      expect([0, 1]).toContain(rec.triggerThreshold);
    }
  });

  it('has at least 20 recommendations', () => {
    expect(RECOMMENDATIONS.length).toBeGreaterThanOrEqual(20);
  });
});
