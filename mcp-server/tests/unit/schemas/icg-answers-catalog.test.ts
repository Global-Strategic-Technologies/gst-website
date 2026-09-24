/**
 * The `assess_infrastructure_cost_governance` `answers` description is the
 * only place a cold client can discover valid ICG question IDs (the engine
 * silently drops unknown keys into `unknownAnswerKeys`). The catalog is
 * derived from `DOMAINS`, so this pins the derivation: every question ID and
 * no stale count.
 */
import { ICGMcpInputsSchema } from '../../../src/schemas';
import {
  DOMAINS,
  TOTAL_QUESTIONS,
} from '../../../../src/data/infrastructure-cost-governance/domains';

describe('ICG answers description — question-ID catalog', () => {
  const description = ICGMcpInputsSchema.shape.answers.description ?? '';

  it('lists every question ID from DOMAINS', () => {
    const ids = DOMAINS.flatMap((d) => d.questions.map((q) => q.id));
    expect(ids).toHaveLength(TOTAL_QUESTIONS);
    for (const id of ids) {
      expect(description).toContain(`${id} (`);
    }
  });

  it('names each question under its domain', () => {
    for (const domain of DOMAINS) {
      expect(description).toContain(`(${domain.name}): ${domain.questions[0].text}`);
    }
  });
});
