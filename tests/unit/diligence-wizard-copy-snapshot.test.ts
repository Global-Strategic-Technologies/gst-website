/**
 * Temporary (BL-153 Tier B): the wizard's English prose, keyed the way the
 * `diligence-machine` catalog keys it, pinned to a file before the prose
 * moves out of `wizard-config.ts`. Once the catalog is the source, this test
 * proves the move left every English string byte-identical, and is deleted.
 */
import { WIZARD_STEPS } from '../../src/data/diligence-machine/wizard-config';

function wizardCopy(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const step of WIZARD_STEPS) {
    out[`step.${step.id}.title`] = step.title;
    out[`step.${step.id}.navLabel`] = step.navLabel;
    out[`step.${step.id}.subtitle`] = step.subtitle;
    for (const o of step.options ?? []) {
      out[`option.${step.id}.${o.id}.label`] = o.label;
      if (o.description) out[`option.${step.id}.${o.id}.description`] = o.description;
    }
    for (const f of step.fields ?? []) {
      out[`field.${f.id}.label`] = f.label;
      for (const o of f.options) {
        out[`option.${f.id}.${o.id}.label`] = o.label;
        if (o.description) out[`option.${f.id}.${o.id}.description`] = o.description;
      }
    }
  }
  return out;
}

describe('Diligence Machine wizard English (pre-move snapshot)', () => {
  it('matches the pinned key → English map', async () => {
    await expect(JSON.stringify(wizardCopy(), null, 2) + '\n').toMatchFileSnapshot(
      './fixtures/diligence-wizard-en.json'
    );
  });
});
