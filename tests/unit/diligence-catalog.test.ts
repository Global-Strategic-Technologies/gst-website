/**
 * The Diligence Machine's English catalog mirrors what the engine emits
 * (BL-153 Tier B). The questions, attention areas and topics stay English in
 * the TypeScript data the MCP server imports; `diligence-machine-data` repeats
 * them by id so the page can translate them. This pins the two together: an
 * edit to the data without the catalog (or the reverse) fails here, and the
 * es / pt-BR staleness guard then asks for the translations to be revisited.
 */
import { QUESTIONS, TOPIC_META } from '../../src/data/diligence-machine/questions';
import { ATTENTION_AREAS } from '../../src/data/diligence-machine/attention-areas';
import {
  AttentionRelevanceSchema,
  ExitImpactSchema,
  QuestionPrioritySchema,
} from '../../src/schemas/diligence';
import { CONDITION_LABELS } from '../../src/utils/diligence-engine';
import { CONDITION_DIMENSION, exitImpactSlug } from '../../src/scripts/diligence-machine/logic';
import DATA from '../../src/i18n/en/diligence-machine-data.json';
import UI from '../../src/i18n/en/diligence-machine.json';

const data = DATA as Record<string, string>;
const ui = UI as Record<string, string>;

describe('Diligence Machine catalog — English equals the data the engine emits', () => {
  it('mirrors every question by id', () => {
    for (const q of QUESTIONS) {
      expect(data[`question.${q.id}.text`], q.id).toBe(q.text);
      expect(data[`question.${q.id}.rationale`], q.id).toBe(q.rationale);
      expect(data[`question.${q.id}.lookout`], q.id).toBe(q.lookoutSignal);
    }
  });

  it('mirrors every attention area by id', () => {
    for (const a of ATTENTION_AREAS) {
      expect(data[`area.${a.id}.title`], a.id).toBe(a.title);
      expect(data[`area.${a.id}.description`], a.id).toBe(a.description);
    }
  });

  it('mirrors every topic', () => {
    for (const [key, meta] of Object.entries(TOPIC_META)) {
      expect(data[`topic.${key}.label`]).toBe(meta.label);
      expect(data[`topic.${key}.audience`]).toBe(meta.audience);
      expect(data[`topic.${key}.subtitle`]).toBe(meta.subtitle);
    }
  });

  it('labels every priority, relevance and exit impact as its value', () => {
    for (const v of QuestionPrioritySchema.options) expect(data[`priority.${v}`]).toBe(v);
    for (const v of AttentionRelevanceSchema.options) expect(data[`relevance.${v}`]).toBe(v);
    for (const v of ExitImpactSchema.options)
      expect(data[`exitImpact.${exitImpactSlug(v)}`]).toBe(v);
  });

  it('has nothing else: every data key names an item the engine can emit', () => {
    const expected = new Set<string>();
    for (const q of QUESTIONS) {
      expected.add(`question.${q.id}.text`).add(`question.${q.id}.rationale`);
      if (q.lookoutSignal) expected.add(`question.${q.id}.lookout`);
    }
    for (const a of ATTENTION_AREAS) {
      expected.add(`area.${a.id}.title`).add(`area.${a.id}.description`);
    }
    for (const key of Object.keys(TOPIC_META)) {
      for (const part of ['label', 'audience', 'subtitle']) expected.add(`topic.${key}.${part}`);
    }
    for (const v of QuestionPrioritySchema.options) expected.add(`priority.${v}`);
    for (const v of AttentionRelevanceSchema.options) expected.add(`relevance.${v}`);
    for (const v of ExitImpactSchema.options) expected.add(`exitImpact.${exitImpactSlug(v)}`);
    expect(Object.keys(data).sort()).toEqual([...expected].sort());
  });

  it('each trigger label is the target-parameters label of the dimension it stands for', () => {
    // The page shows the engine's English trigger labels through the same
    // js.meta.* keys as the target-parameters block, so one translation serves both.
    for (const [key, label] of Object.entries(CONDITION_LABELS)) {
      const dimension = CONDITION_DIMENSION[key];
      expect(dimension, `${key} has no dimension`).toBeDefined();
      expect(ui[`js.meta.${dimension}`], key).toBe(label);
    }
  });
});
