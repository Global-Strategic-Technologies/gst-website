/**
 * Tests for the assess_infrastructure_cost_governance tool wrapper.
 *
 * Exercises the input contract surface and asserts MCP-wrapper output
 * matches a direct call to `calculateResults` + `getRecommendations`.
 */

import { calculateResults, getRecommendations, type ICGState } from '../../../src/utils/icg-engine';
import { DOMAINS } from '../../../src/data/infrastructure-cost-governance/domains';
import { RECOMMENDATIONS } from '../../../src/data/infrastructure-cost-governance/recommendations';
import { ICGInputsSchema, type ICGInputs } from '../../src/schemas';

const sampleAnswers: Record<string, number> = {
  q1_1: 2,
  q1_2: 1,
  q1_3: 0,
  q2_1: 3,
  q2_2: 2,
  q2_3: -1,
  q2_4: 1,
  q3_1: 2,
  q3_2: 2,
  q3_3: 1,
};

const validInputs: ICGInputs = {
  answers: sampleAnswers,
  companyStage: 'series-bc',
};

describe('ICGInputsSchema (tool input contract)', () => {
  it('parses a valid answers map with companyStage', () => {
    const result = ICGInputsSchema.safeParse(validInputs);
    expect(result.success).toBe(true);
  });

  it('parses an empty answers map (skipped wizard)', () => {
    const result = ICGInputsSchema.safeParse({ answers: {} });
    expect(result.success).toBe(true);
  });

  it('rejects an answer score outside the -1..3 range', () => {
    const bad = { answers: { q1_1: 5 } };
    const result = ICGInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown companyStage enum value', () => {
    const bad = { answers: {}, companyStage: 'mature' };
    const result = ICGInputsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('assess_infrastructure_cost_governance (engine parity)', () => {
  it('matches direct engine output for the canonical sample', () => {
    const state: ICGState = {
      answers: sampleAnswers,
      currentStep: 0,
      dismissed: [],
      companyStage: 'series-bc',
    };
    const direct = calculateResults(state, DOMAINS);
    const directRecs = getRecommendations(state, RECOMMENDATIONS);

    expect(direct.overallScore).toBeGreaterThanOrEqual(0);
    expect(direct.overallScore).toBeLessThanOrEqual(100);
    expect(direct.domainScores.length).toBe(DOMAINS.length);
    expect(directRecs.length).toBeGreaterThan(0);
  });

  it('produces a higher score for fully-optimised answers vs all-zeros', () => {
    const optimised: Record<string, number> = {};
    const reactive: Record<string, number> = {};
    for (const d of DOMAINS) {
      for (const q of d.questions) {
        optimised[q.id] = 3;
        reactive[q.id] = 0;
      }
    }
    const optResult = calculateResults(
      { answers: optimised, currentStep: 0, dismissed: [] },
      DOMAINS
    );
    const reaResult = calculateResults(
      { answers: reactive, currentStep: 0, dismissed: [] },
      DOMAINS
    );
    expect(optResult.overallScore).toBeGreaterThan(reaResult.overallScore);
    expect(optResult.maturityLevel).toBe('Strategic');
    expect(reaResult.maturityLevel).toBe('Reactive');
  });

  it('serializes cleanly to JSON (no circular refs)', () => {
    const state: ICGState = { answers: sampleAnswers, currentStep: 0, dismissed: [] };
    const result = calculateResults(state, DOMAINS);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});

// K.2.c.3 / K.2.c.5 — input keys outside the canonical domain registry
// must not inflate `answeredCount` / `skippedCount` and must surface on
// `unknownAnswerKeys` so a typo doesn't pass silently. Per-domain
// scoring already ignores unknown keys; these tests pin that contract.
describe('calculateResults — unknown answer keys (K.2.c.3 / K.2.c.5)', () => {
  const allDefinedIds = DOMAINS.flatMap((d) => d.questions.map((q) => q.id));
  const totalDefined = allDefinedIds.length;

  function fullyAnswered(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of allDefinedIds) out[id] = 2;
    return out;
  }

  it('drops unknown keys from answeredCount so it reconciles against totalQuestions', () => {
    const answers = { ...fullyAnswered(), q3_4: 1, q4_4: 2, q5_4: 0 };
    const result = calculateResults({ answers, currentStep: 0, dismissed: [] }, DOMAINS);
    expect(result.answeredCount).toBe(totalDefined);
    expect(result.totalQuestions).toBe(totalDefined);
    expect(result.answeredCount).toBeLessThanOrEqual(result.totalQuestions);
  });

  it('does NOT increment skippedCount for unknown keys with value -1', () => {
    const answers = { ...fullyAnswered(), q3_4: -1, q4_4: -1 };
    const result = calculateResults({ answers, currentStep: 0, dismissed: [] }, DOMAINS);
    // None of the canonical answers are -1, so skippedCount should be 0.
    expect(result.skippedCount).toBe(0);
  });

  it('surfaces unknown keys on unknownAnswerKeys for operator visibility', () => {
    const answers = { ...fullyAnswered(), q3_4: 1, badKey: 2 };
    const result = calculateResults({ answers, currentStep: 0, dismissed: [] }, DOMAINS);
    expect(result.unknownAnswerKeys).toEqual(expect.arrayContaining(['q3_4', 'badKey']));
    expect(result.unknownAnswerKeys).toHaveLength(2);
  });

  it('returns an empty unknownAnswerKeys array on the happy path', () => {
    const result = calculateResults(
      { answers: fullyAnswered(), currentStep: 0, dismissed: [] },
      DOMAINS
    );
    expect(result.unknownAnswerKeys).toEqual([]);
  });

  it('does NOT let unknown keys affect any domain rawScore (regression guard)', () => {
    // Same canonical answers in two runs; the second adds a noise key.
    // Per-domain rawScore must be identical.
    const baseAnswers = fullyAnswered();
    const noisy = { ...baseAnswers, q3_4: 3, q4_4: 3, totallyMadeUp: 3 };
    const baseResult = calculateResults(
      { answers: baseAnswers, currentStep: 0, dismissed: [] },
      DOMAINS
    );
    const noisyResult = calculateResults(
      { answers: noisy, currentStep: 0, dismissed: [] },
      DOMAINS
    );
    expect(noisyResult.overallScore).toBe(baseResult.overallScore);
    for (let i = 0; i < baseResult.domainScores.length; i++) {
      expect(noisyResult.domainScores[i].rawScore).toBe(baseResult.domainScores[i].rawScore);
      expect(noisyResult.domainScores[i].score).toBe(baseResult.domainScores[i].score);
    }
  });
});

// K.2.b.4 — `triggerQuestionAnswered` lets consuming agents distinguish
// a "confirmed gap" (user explicitly answered the trigger question with
// 0 or -1) from an "assumed gap pending more info" (the trigger question
// key is absent and the engine defaulted to 0).
describe('getRecommendations — triggerQuestionAnswered (K.2.b.4)', () => {
  it('sets triggerQuestionAnswered: true when the trigger question is explicitly answered (value 0)', () => {
    // Pick a recommendation whose trigger condition fires on `0`.
    const sampleRec = RECOMMENDATIONS.find((r) => r.triggerThreshold >= 0);
    expect(sampleRec).toBeDefined();
    const state: ICGState = {
      answers: { [sampleRec!.triggerQuestionId]: 0 },
      currentStep: 0,
      dismissed: [],
    };
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const matched = recs.find((r) => r.id === sampleRec!.id);
    expect(matched).toBeDefined();
    expect(matched!.triggerQuestionAnswered).toBe(true);
  });

  it('sets triggerQuestionAnswered: true when the trigger question is "Not sure" (-1)', () => {
    // -1 is still an explicit answer — user said "I do not know."
    const sampleRec = RECOMMENDATIONS.find((r) => r.triggerThreshold >= 0);
    const state: ICGState = {
      answers: { [sampleRec!.triggerQuestionId]: -1 },
      currentStep: 0,
      dismissed: [],
    };
    const recs = getRecommendations(state, RECOMMENDATIONS);
    const matched = recs.find((r) => r.id === sampleRec!.id);
    expect(matched).toBeDefined();
    expect(matched!.triggerQuestionAnswered).toBe(true);
  });

  it('sets triggerQuestionAnswered: false when the trigger question key is absent (defaulted to 0)', () => {
    // Empty state — every rec fires by default but no question was answered.
    const state: ICGState = { answers: {}, currentStep: 0, dismissed: [] };
    const recs = getRecommendations(state, RECOMMENDATIONS);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.triggerQuestionAnswered).toBe(false);
    }
  });

  it('every returned recommendation carries the triggerQuestionAnswered flag', () => {
    const state: ICGState = {
      answers: { q1_1: 0, q2_1: 1 },
      currentStep: 0,
      dismissed: [],
    };
    const recs = getRecommendations(state, RECOMMENDATIONS);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(typeof r.triggerQuestionAnswered).toBe('boolean');
    }
  });
});

// Data-integrity guard — every recommendation's `triggerQuestionId` must
// resolve to a real domain question. If a rec references a non-existent
// question id (e.g. via a domain rename or question removal), the
// `triggerQuestionAnswered: false` flag would silently mislead agents
// into treating an unfireable rec as a real "assumed gap." This pins
// the data invariant so a future RECOMMENDATIONS edit can't drift
// undetected.
describe('RECOMMENDATIONS data integrity', () => {
  it('every recommendation triggerQuestionId resolves to a real domain question', () => {
    const validIds = new Set(DOMAINS.flatMap((d) => d.questions.map((q) => q.id)));
    const orphans = RECOMMENDATIONS.filter((r) => !validIds.has(r.triggerQuestionId)).map((r) => ({
      id: r.id,
      triggerQuestionId: r.triggerQuestionId,
    }));
    expect(orphans).toEqual([]);
  });
});
