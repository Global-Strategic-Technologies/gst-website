/**
 * Unit Tests for Infrastructure Cost Governance Engine
 *
 * Tests all pure functions:
 * - calculateResults(): domain scoring, weighted overall, maturity levels
 * - getMaturityLevel(): threshold boundaries
 * - getRecommendations(): filtering and sorting
 * - checkFoundationalFlag(): D1/D2 threshold detection
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
  buildSummaryText,
  buildExportPayload,
  getQuickWins,
  compareSnapshots,
  buildRadarPoints,
  DEFAULT_STATE,
} from '../../src/utils/icg-engine';

import type { ICGState, DomainScore, ICGSnapshot } from '../../src/utils/icg-engine';

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
      { domainId: 'd3', name: 'Test', score: 10, rawScore: 1, maxScore: 9, isFoundational: false, belowFoundationalThreshold: false },
    ];
    expect(checkFoundationalFlag(scores)).toBe(false);
  });

  it('returns true when foundational domain score is 0', () => {
    const scores: DomainScore[] = [
      { domainId: 'd1', name: 'Test', score: 0, rawScore: 0, maxScore: 9, isFoundational: true, belowFoundationalThreshold: true },
    ];
    expect(checkFoundationalFlag(scores)).toBe(true);
  });

  it('returns true when second foundational domain is below threshold', () => {
    const scores: DomainScore[] = [
      { domainId: 'd1', name: 'Visibility', score: 67, rawScore: 6, maxScore: 9, isFoundational: true, belowFoundationalThreshold: false },
      { domainId: 'd2', name: 'Account Structure', score: 25, rawScore: 3, maxScore: 12, isFoundational: true, belowFoundationalThreshold: true },
    ];
    expect(checkFoundationalFlag(scores)).toBe(true);
  });

  it('returns true when both foundational domains are below threshold', () => {
    const scores: DomainScore[] = [
      { domainId: 'd1', name: 'Visibility', score: 33, rawScore: 3, maxScore: 9, isFoundational: true, belowFoundationalThreshold: true },
      { domainId: 'd2', name: 'Account Structure', score: 25, rawScore: 3, maxScore: 12, isFoundational: true, belowFoundationalThreshold: true },
    ];
    expect(checkFoundationalFlag(scores)).toBe(true);
  });
});

// ─── calculateResults ────────────────────────────────────────────────────────

describe('calculateResults', () => {
  it('returns 0 overall score when all answers are 0', () => {
    const state = makeState({ answers: allAnswers(0), currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    expect(result.overallScore).toBe(0);
  });

  it('returns 100 overall score when all answers are 3 (Optimized)', () => {
    const state = makeState({ answers: allAnswers(3), currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    expect(result.overallScore).toBe(100);
  });

  it('returns correct maturity level for all-zero answers', () => {
    const state = makeState({ answers: allAnswers(0), currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    expect(result.maturityLevel).toBe('Reactive');
  });

  it('returns correct maturity level for all-optimized answers', () => {
    const state = makeState({ answers: allAnswers(3), currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    expect(result.maturityLevel).toBe('Strategic');
  });

  it('calculates correct per-domain score for Domain 1 with all answers at 1', () => {
    const answers = domainAnswers('d1', 1);
    const state = makeState({ answers, currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    const d1 = result.domainScores.find(d => d.domainId === 'd1')!;
    // 3 questions * 1 score = 3, max = 9, (3/9)*100 = 33
    expect(d1.score).toBe(33);
  });

  it('calculates correct per-domain score for Domain 6 with all answers at 2', () => {
    const answers = domainAnswers('d6', 2);
    const state = makeState({ answers, currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    const d6 = result.domainScores.find(d => d.domainId === 'd6')!;
    // 4 questions * 2 score = 8, max = 12, (8/12)*100 = 67
    expect(d6.score).toBe(67);
  });

  it('applies D1 weight of 1.5 in weighted overall score', () => {
    // Give D1 all 3s (score 100), everything else 0s (score 0)
    const answers = { ...allAnswers(0), ...domainAnswers('d1', 3) };
    const state = makeState({ answers, currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    // D1=100*1.5, D2=0*1.5, D3-D6=0*1.0 each. Total weight=7.0
    // (150) / 7.0 = 21.43 -> 21
    expect(result.overallScore).toBe(21);
  });

  it('sets showFoundationalFlag when D1 score is 33', () => {
    const answers = domainAnswers('d1', 1); // score = 33
    const state = makeState({ answers, currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    expect(result.showFoundationalFlag).toBe(true);
  });

  it('does not set showFoundationalFlag when D1 score is above 33', () => {
    const answers = domainAnswers('d1', 2); // score = 67
    const state = makeState({ answers, currentStep: 7 });
    const result = calculateResults(state, DOMAINS);
    // D2 is also foundational and unanswered (score 0), so flag still shows
    // To test D1 alone, we need D2 above threshold too
    const answersWithD2 = { ...answers, ...domainAnswers('d2', 2) };
    const state2 = makeState({ answers: answersWithD2, currentStep: 7 });
    const result2 = calculateResults(state2, DOMAINS);
    expect(result2.showFoundationalFlag).toBe(false);
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
    expect(result.totalQuestions).toBe(20);
  });

  it('returns 6 domain scores', () => {
    const state = makeState({ answers: allAnswers(2) });
    const result = calculateResults(state, DOMAINS);
    expect(result.domainScores).toHaveLength(6);
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
      answers: { q1_1: 2, q3_3: 1, q6_4: 0 },
      dismissed: [],
    };
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded).toEqual({
      currentStep: 3,
      answers: { q1_1: 2, q3_3: 1, q6_4: 0 },
    });
  });

  it('round-trips with all answers filled', () => {
    const state = makeState({ answers: allAnswers(2), currentStep: 7 });
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);
    expect(decoded?.currentStep).toBe(7);
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
    const encoded = btoa(JSON.stringify({ s: 8, a: {} }));
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
      currentStep: 7,
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
    const encoded = btoa(JSON.stringify({ s: 7, a: {}, d: ['r01', 42, null, 'r03'] }));
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
  it('has exactly 20 total questions', () => {
    expect(TOTAL_QUESTIONS).toBe(20);
  });

  it('has 6 domains', () => {
    expect(DOMAINS).toHaveLength(6);
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

  it('domain weights are correct (D1=1.5, D2=1.5, others=1.0)', () => {
    const d1 = DOMAINS.find(d => d.id === 'd1')!;
    const d2 = DOMAINS.find(d => d.id === 'd2')!;
    expect(d1.weight).toBe(1.5);
    expect(d2.weight).toBe(1.5);
    for (const d of DOMAINS.filter(d => d.id !== 'd1' && d.id !== 'd2')) {
      expect(d.weight).toBe(1.0);
    }
  });

  it('D1 and D2 are foundational', () => {
    const foundational = DOMAINS.filter(d => d.foundational);
    expect(foundational).toHaveLength(2);
    expect(foundational.map(d => d.id)).toEqual(['d1', 'd2']);
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

// ─── buildSummaryText ────────────────────────────────────────────────────────

describe('buildSummaryText', () => {
  it('includes overall score and maturity level', () => {
    const state = makeState({ answers: allAnswers(3) });
    const result = calculateResults(state, DOMAINS);
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const text = buildSummaryText(state, result, DOMAINS, recs);

    expect(text).toContain(`Overall score: ${result.overallScore}/100`);
    expect(text).toContain(result.maturityLevel);
  });

  it('includes all six domain names and scores', () => {
    const state = makeState({ answers: allAnswers(2) });
    const result = calculateResults(state, DOMAINS);
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const text = buildSummaryText(state, result, DOMAINS, recs);

    for (const ds of result.domainScores) {
      expect(text).toContain(`${ds.name}: ${ds.score}/100`);
    }
  });

  it('includes active recommendation titles', () => {
    const state = makeState({ answers: allAnswers(0) });
    const result = calculateResults(state, DOMAINS);
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const text = buildSummaryText(state, result, DOMAINS, recs);

    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(text).toContain(`[${r.impact.toUpperCase()}] ${r.title}`);
    }
  });

  it('excludes dismissed recommendations when filtered by caller', () => {
    const state = makeState({ answers: allAnswers(0), dismissed: [] });
    const allRecs = getRecommendations(state, RECOMMENDATIONS);
    expect(allRecs.length).toBeGreaterThan(1);

    const dismissed = new Set([allRecs[0].id]);
    const filtered = allRecs.filter(r => !dismissed.has(r.id));
    const result = calculateResults(state, DOMAINS);
    const text = buildSummaryText(state, result, DOMAINS, filtered);

    expect(text).not.toContain(allRecs[0].title);
    expect(text).toContain(allRecs[1].title);
  });

  it('includes URL when provided', () => {
    const state = makeState({ answers: allAnswers(3) });
    const result = calculateResults(state, DOMAINS);
    const url = 'https://example.com/icg?s=abc';
    const text = buildSummaryText(state, result, DOMAINS, [], url);

    expect(text).toContain(url);
    expect(text).toContain('Generated by GST');
  });

  it('includes generated date', () => {
    const state = makeState({ answers: allAnswers(2) });
    const result = calculateResults(state, DOMAINS);
    const text = buildSummaryText(state, result, DOMAINS, []);

    const today = new Date().toISOString().slice(0, 10);
    expect(text).toContain(`Generated: ${today}`);
  });

  it('includes foundational warning when applicable', () => {
    // Score D1 and D2 at 0 (foundational), rest at max
    const answers: Record<string, number> = {};
    for (const d of DOMAINS) {
      for (const q of d.questions) {
        answers[q.id] = d.foundational ? 0 : 3;
      }
    }
    const state = makeState({ answers });
    const result = calculateResults(state, DOMAINS);
    const text = buildSummaryText(state, result, DOMAINS, []);

    expect(result.showFoundationalFlag).toBe(true);
    expect(text).toContain('Foundational gap');
  });

  it('omits recommendations section when none active', () => {
    const state = makeState({ answers: allAnswers(3) });
    const result = calculateResults(state, DOMAINS);
    const text = buildSummaryText(state, result, DOMAINS, []);

    expect(text).not.toContain('Active recommendations');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// "Not sure" (-1) answer handling
// ═════════════════════════════════════════════════════════════════════════════

describe('Not sure (-1) answers', () => {
  it('treats -1 answers as 0 in calculateResults', () => {
    const answersNeg = allAnswers(-1);
    const answersZero = allAnswers(0);

    const resultNeg = calculateResults(makeState({ answers: answersNeg }), DOMAINS);
    const resultZero = calculateResults(makeState({ answers: answersZero }), DOMAINS);

    expect(resultNeg.overallScore).toBe(resultZero.overallScore);
    expect(resultNeg.overallScore).toBe(0);
  });

  it('decodeState accepts -1 values', () => {
    const state = makeState({ answers: { q1_1: -1, q1_2: 2 }, currentStep: 3 });
    const encoded = encodeState(state);
    const decoded = decodeState(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.answers!.q1_1).toBe(-1);
    expect(decoded!.answers!.q1_2).toBe(2);
  });

  it('triggers recommendations on -1 answers', () => {
    const state = makeState({ answers: { q1_1: -1 } });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const q1_1recs = recs.filter(r => r.triggerQuestionId === 'q1_1');

    expect(q1_1recs.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildExportPayload
// ═════════════════════════════════════════════════════════════════════════════

describe('buildExportPayload', () => {
  it('returns correct structure', () => {
    const state = makeState({ answers: allAnswers(2) });
    const result = calculateResults(state, DOMAINS);
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const payload = buildExportPayload(state, result, recs);

    expect(payload.toolVersion).toBe('1.0');
    expect(payload.exportedAt).toBeTruthy();
    expect(payload.overallScore).toBe(result.overallScore);
    expect(payload.maturityLevel).toBe(result.maturityLevel);
    expect(payload.domainScores).toHaveLength(6);
    expect(payload.answeredCount).toBe(TOTAL_QUESTIONS);
    expect(typeof payload.answers).toBe('object');
  });

  it('includes only active recommendations', () => {
    const state = makeState({ answers: allAnswers(0) });
    const result = calculateResults(state, DOMAINS);
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const payload = buildExportPayload(state, result, recs);

    expect(payload.recommendations.length).toBe(recs.length);
    payload.recommendations.forEach(r => {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('impact');
      expect(r).toHaveProperty('effort');
      expect(r).toHaveProperty('domain');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getQuickWins
// ═════════════════════════════════════════════════════════════════════════════

describe('getQuickWins', () => {
  it('returns high-impact recs for worst-case answers', () => {
    const state = makeState({ answers: allAnswers(0) });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const quickWins = getQuickWins(state, recs);

    expect(quickWins.length).toBeLessThanOrEqual(3);
    quickWins.forEach(qw => {
      expect(qw.impact).toBe('high');
    });
  });

  it('returns empty for all-optimized answers', () => {
    const state = makeState({ answers: allAnswers(3) });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const quickWins = getQuickWins(state, recs);

    expect(quickWins).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    const state = makeState({ answers: allAnswers(0) });
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const quickWins = getQuickWins(state, recs, 1);

    expect(quickWins).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// compareSnapshots
// ═════════════════════════════════════════════════════════════════════════════

describe('compareSnapshots', () => {
  it('calculates correct deltas between two snapshots', () => {
    const stateA = makeState({ answers: allAnswers(1), currentStep: 7 });
    const stateB = makeState({ answers: allAnswers(2), currentStep: 7 });

    const snapA: ICGSnapshot = {
      id: 'a', label: 'Before', timestamp: '2026-01-01', encodedState: encodeState(stateA),
    };
    const snapB: ICGSnapshot = {
      id: 'b', label: 'After', timestamp: '2026-03-01', encodedState: encodeState(stateB),
    };

    const comparison = compareSnapshots(snapA, snapB, DOMAINS);

    expect(comparison).not.toBeNull();
    expect(comparison!.a.label).toBe('Before');
    expect(comparison!.b.label).toBe('After');
    expect(comparison!.overallDelta).toBeGreaterThan(0);
    expect(comparison!.domainDeltas).toHaveLength(6);
    comparison!.domainDeltas.forEach(dd => {
      expect(dd.delta).toBeGreaterThan(0);
      expect(dd.scoreB).toBeGreaterThan(dd.scoreA);
    });
  });

  it('returns null for invalid encoded state', () => {
    const snapA: ICGSnapshot = { id: 'a', label: 'A', timestamp: '', encodedState: 'invalid' };
    const snapB: ICGSnapshot = { id: 'b', label: 'B', timestamp: '', encodedState: 'alsoInvalid' };

    const comparison = compareSnapshots(snapA, snapB, DOMAINS);
    expect(comparison).toBeNull();
  });

  it('returns zero deltas for identical snapshots', () => {
    const stateA = makeState({ answers: allAnswers(2), currentStep: 7 });
    const encoded = encodeState(stateA);

    const snapA: ICGSnapshot = { id: 'a', label: 'A', timestamp: '', encodedState: encoded };
    const snapB: ICGSnapshot = { id: 'b', label: 'B', timestamp: '', encodedState: encoded };

    const comparison = compareSnapshots(snapA, snapB, DOMAINS);

    expect(comparison).not.toBeNull();
    expect(comparison!.overallDelta).toBe(0);
    comparison!.domainDeltas.forEach(dd => {
      expect(dd.delta).toBe(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildRadarPoints
// ═════════════════════════════════════════════════════════════════════════════

describe('buildRadarPoints', () => {
  it('returns 6 coordinate pairs for 6 domains', () => {
    const scores: DomainScore[] = DOMAINS.map(d => ({
      domainId: d.id, name: d.name, score: 50, rawScore: 0, maxScore: 0,
      isFoundational: false, belowFoundationalThreshold: false,
    }));

    const points = buildRadarPoints(scores, 150, 150, 110);
    const pairs = points.split(' ');

    expect(pairs).toHaveLength(6);
    pairs.forEach(p => {
      const [x, y] = p.split(',');
      expect(parseFloat(x)).not.toBeNaN();
      expect(parseFloat(y)).not.toBeNaN();
    });
  });

  it('returns center point for zero scores', () => {
    const scores: DomainScore[] = DOMAINS.map(d => ({
      domainId: d.id, name: d.name, score: 0, rawScore: 0, maxScore: 0,
      isFoundational: false, belowFoundationalThreshold: false,
    }));

    const points = buildRadarPoints(scores, 150, 150, 110);
    const pairs = points.split(' ');

    pairs.forEach(p => {
      const [x, y] = p.split(',');
      expect(parseFloat(x)).toBeCloseTo(150, 0);
      expect(parseFloat(y)).toBeCloseTo(150, 0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Data integrity — new fields
// ═════════════════════════════════════════════════════════════════════════════

describe('Data integrity — effort field', () => {
  const VALID_EFFORTS = ['quick-win', 'project', 'initiative'];

  it('every recommendation has a valid effort value', () => {
    RECOMMENDATIONS.forEach(r => {
      expect(VALID_EFFORTS).toContain(r.effort);
    });
  });
});

describe('Data integrity — rationale field', () => {
  it('every question has a non-empty rationale', () => {
    for (const domain of DOMAINS) {
      for (const q of domain.questions) {
        expect(q.rationale).toBeTruthy();
        expect(q.rationale.length).toBeGreaterThan(20);
      }
    }
  });
});
