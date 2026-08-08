/**
 * Minimal VALID arguments for every registered prompt, shared by the two
 * `prompts/get` rendering suites (`protocol-era-worker.test.ts` on the Worker
 * lane, `protocol-roundtrip.test.ts` on the paired-transport lane).
 *
 * Shared rather than duplicated because a stale copy fails in the wrong
 * direction: the `assertPromptArgs` guard below catches a prompt with NO
 * entry, but two hand-maintained copies would let a prompt that GAINS a
 * required field keep passing in one lane while the other silently starts
 * testing argument validation instead of rendering.
 *
 * `{}` is not usable here — several prompts have required fields, so an
 * empty payload would fail validation and prove nothing about whether the
 * prompt body renders. These shapes were verified against production on
 * 2026-08-07.
 */

export const MINIMAL_PROMPT_ARGS: Record<string, Record<string, unknown>> = {
  gst_diligence_kickoff: { targetName: 'Acme' },
  gst_target_quick_look: {
    targetName: 'Acme',
    productType: 'b2b-saas',
    // Wire strings: prompt arguments arrive as strings and are coerced.
    arr: '25000000',
    // Canonical funding stage (ADR-0001), NOT a portfolio growth-stage label.
    stage: 'series-b',
    hqJurisdiction: 'us-ca',
  },
  gst_comparable_engagements_memo: { targetDescription: 'vertical SaaS bolt-on' },
  gst_regulatory_exposure_brief: {
    targetJurisdictions: 'eu,us-ca',
    dataCategories: 'data-privacy',
    productType: 'b2b-saas',
  },
  gst_architecture_layer_review: { targetSummary: 'healthcare RCM SaaS on AWS' },
  gst_radar_brief_today: {},
  gst_diligence_handoff_memo: { targetName: 'Acme' },
  gst_information_request_list: { targetName: 'Acme' },
  gst_irl_ingestion: { targetName: 'Acme', mode: 'extract-only' },
};

/**
 * Look up a prompt's minimal args, throwing when a newly registered prompt
 * has no entry. Throwing (rather than returning `{}`) is deliberate: a
 * silently-skipped prompt is how a rendering bug reaches production.
 */
export function minimalArgsFor(promptName: string): Record<string, unknown> {
  const args = MINIMAL_PROMPT_ARGS[promptName];
  if (!args) {
    throw new Error(
      `No minimal args registered for prompt "${promptName}". ` +
        'Add an entry to tests/helpers/prompt-args.ts so both prompts/get ' +
        'rendering suites cover it.'
    );
  }
  return args;
}
