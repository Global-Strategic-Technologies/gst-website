/**
 * The `irlEvidencePrecedence()` clause and the `consumesTargetEvidence` flag
 * that declares who carries it.
 *
 * **Why a declared flag rather than an inferred set.** No `GstPrompt` property
 * expressed "takes target inputs", and the repo has already solved this shape
 * once: `needsFyiSnapshot` exists because *"a `prompt.name === '…'` check in the
 * registry is a special case at one, a pattern at two"*. The guard below is a
 * BICONDITIONAL — clause present ⇔ flag set — so every new prompt has to make
 * a choice rather than silently opting out of a discipline that governs how it
 * treats evidence. Prompt #10 (`gst_irl_fill`, BL-140) made that choice:
 * excluded, for the stop-at-artifact reason recorded on `EXPECTED_EXCLUDED`.
 *
 * **Non-zero counts are asserted on BOTH arms.** A guard iterating an empty set
 * has shipped in this repo twice (BL-124 bypassed Zod entirely; BL-125's enum
 * walk threw on all 60 fields and the catch swallowed it). Here the failure
 * would be quieter still: if `ALL_PROMPTS` were empty, or if every body failed
 * to render and the text came back blank, the biconditional would hold
 * vacuously on both sides.
 */

import { describe, it, expect } from 'vitest';
import { ALL_PROMPTS } from '../../src/prompts/_registry';
import { irlEvidencePrecedence } from '../../src/prompts/embed';
import { minimalArgsFor } from '../helpers/prompt-args';

/** A sentence distinctive enough that a paraphrase counts as absence — which is the point. */
const CLAUSE_MARKER = 'Canonical GST target evidence takes precedence over synthesis.';

/**
 * The six prompts that take target inputs. Written out rather than derived from
 * the flag, so this file states the intended set and the guard checks the code
 * against it — deriving it from `consumesTargetEvidence` would make the
 * assertion a tautology.
 */
const EXPECTED_OPT_IN = [
  'gst_architecture_layer_review',
  'gst_comparable_engagements_memo',
  'gst_diligence_handoff_memo',
  'gst_diligence_kickoff',
  'gst_regulatory_exposure_brief',
  'gst_target_quick_look',
];

/**
 * Deliberately excluded, each for a stated reason:
 *   - `gst_radar_brief_today` takes no target inputs at all.
 *   - `gst_information_request_list` PRODUCES the blank IRL.
 *   - `gst_irl_fill` (BL-140) genuinely resolves answers from target evidence
 *     in context — but the clause's mandatory upgrade path ("call
 *     `prepare_irl_body` … then `validate_irl_provenance`") instructs the
 *     model to invoke the sweep tools, a direct contradiction of the fill
 *     prompt's stop-at-artifact ruling (a human review checkpoint sits
 *     between fill and ingest by design). The stop-at-artifact contradiction
 *     alone carries the exclusion; the prompt's own body states the
 *     evidence-first discipline in its authoring rules.
 *   - `gst_irl_ingestion` PRODUCES the record; telling it to resolve inputs
 *     from an artifact it is writing would be circular.
 */
const EXPECTED_EXCLUDED = [
  'gst_information_request_list',
  'gst_irl_fill',
  'gst_irl_ingestion',
  'gst_radar_brief_today',
];

function renderBody(prompt: (typeof ALL_PROMPTS)[number]): string {
  const parsed = prompt.argsSchema.parse(minimalArgsFor(prompt.name));
  const result = prompt.build(parsed as never);
  return result.messages.map((m) => (m.content.type === 'text' ? m.content.text : '')).join('\n');
}

describe('irlEvidencePrecedence — clause present ⇔ consumesTargetEvidence', () => {
  it('the registry is non-empty and every prompt renders (otherwise the guard below is vacuous)', () => {
    expect(ALL_PROMPTS.length).toBeGreaterThanOrEqual(9);
    for (const prompt of ALL_PROMPTS) {
      expect(renderBody(prompt).length, `${prompt.name} rendered an empty body`).toBeGreaterThan(
        200
      );
    }
  });

  it('the biconditional holds across ALL_PROMPTS, with both arms non-empty', () => {
    const withFlag: string[] = [];
    const withClause: string[] = [];
    for (const prompt of ALL_PROMPTS) {
      const flagged = prompt.consumesTargetEvidence === true;
      const carries = renderBody(prompt).includes(CLAUSE_MARKER);
      if (flagged) withFlag.push(prompt.name);
      if (carries) withClause.push(prompt.name);
      expect(
        carries,
        flagged
          ? `${prompt.name} declares consumesTargetEvidence but its body does not carry the clause`
          : `${prompt.name} carries the clause without declaring consumesTargetEvidence`
      ).toBe(flagged);
    }
    // Both arms probed something real.
    expect(withFlag.sort()).toEqual(EXPECTED_OPT_IN);
    expect(withClause.sort()).toEqual(EXPECTED_OPT_IN);
    expect(
      ALL_PROMPTS.filter((p) => p.consumesTargetEvidence !== true)
        .map((p) => p.name)
        .sort()
    ).toEqual(EXPECTED_EXCLUDED);
  });

  it('the clause carries BOTH halves — precedence, and the verified-vs-asserted disclosure', () => {
    const clause = irlEvidencePrecedence();
    // Precedence half.
    expect(clause).toContain('IRL extract record');
    expect(clause).toMatch(/resolve every input from it before synthesizing/i);
    expect(clause).toMatch(/matching on the IRL request text/i);
    expect(clause).toMatch(/say what you synthesized/i);
    expect(clause).toMatch(/Never overwrite a stated figure with a norm/i);
    // Staleness half — the reason `generatedAt` / `promptVersion` have a reader.
    expect(clause).toMatch(/ASSERTED, not verified/i);
    expect(clause).toContain('validate_irl_provenance');
    expect(clause).toContain('prepare_irl_body');
    expect(clause).toMatch(/four hours/i);
    expect(clause).toContain('_meta.generatedAt');
    expect(clause).toContain('_meta.promptVersion');
  });

  it('every opt-in body carries the staleness sentence, not just the precedence one', () => {
    // A clause split in half across bodies would satisfy the marker check while
    // leaving the record's citations reading as verified.
    let checked = 0;
    for (const prompt of ALL_PROMPTS.filter((p) => p.consumesTargetEvidence === true)) {
      const text = renderBody(prompt);
      expect(text, `${prompt.name} missing the asserted-vs-verified disclosure`).toMatch(
        /ASSERTED, not verified/i
      );
      checked += 1;
    }
    expect(checked).toBe(EXPECTED_OPT_IN.length);
  });
});
