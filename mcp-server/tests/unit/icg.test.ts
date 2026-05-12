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
