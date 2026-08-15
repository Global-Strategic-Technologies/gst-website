/**
 * BL-126 — the payload the prompt describes must actually parse.
 *
 * The string-presence assertions in `bl-125-run-parameters.test.ts` prove the
 * prompt *says* something. They cannot prove the thing it says is legal, and
 * the first cut of this change said the wrong thing: it instructed the model
 * not to supply `rdOpEx` at all under `deepdive`, on the reasoning that the
 * engine ignores it. The engine does ignore it — but `AuditedTechParInputsSchema`
 * requires both `rdOpEx` and `_audit.rdOpEx` in **both** modes, so a compliant
 * model would have been hard-rejected on the exact path this change exists to
 * make deterministic.
 *
 * This file closes that class: build the payload the prompt describes and parse
 * it against the real schema. A presence test could not have caught it; only
 * running the shape could.
 */

import { describe, it, expect } from 'vitest';
import { AuditedTechParInputsSchema } from '../../src/schemas/techpar-audit';
import { TECHPAR_MODE_RULE } from '../../src/prompts/extraction-rules';

const CITE = 'Section 02 — Engineering FTE count: 58 total, 8 infrastructure / SRE';
const SOURCED = { annualizationSource: 'irl-annualized-stated' as const, citation: CITE };

/** Exactly what TECHPAR_MODE_RULE instructs, including the rdOpEx escape. */
function deepdivePayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mode: 'deepdive',
    capexView: 'cash',
    stage: 'pe',
    arr: 27_240_000,
    growthRate: 10,
    exitMultiple: 12,
    engFTE: 42,
    infraHostingAnnual: 3_400_000,
    infraPersonnel: 1_070_000,
    rdOpEx: 0,
    rdCapEx: 0,
    engCost: 5_080_000,
    prodCost: 750_000,
    toolingCost: 308_000,
    _audit: {
      monetaryBasis: { currency: 'USD', citation: CITE },
      arr: SOURCED,
      infraHostingAnnual: SOURCED,
      infraPersonnel: SOURCED,
      rdCapEx: SOURCED,
      rdOpEx: {
        annualizationSource: 'irl-annualized-stated',
        citation:
          'Section -- — not sourced; deepdive synthesizes R&D OpEx from engCost + prodCost + toolingCost',
      },
      engCost: SOURCED,
      prodCost: SOURCED,
      toolingCost: SOURCED,
    },
    ...over,
  };
}

describe('BL-126 — the deepdive payload the prompt describes is accepted', () => {
  it('parses with rdOpEx: 0 and the Section -- audit escape', () => {
    const r = AuditedTechParInputsSchema.safeParse(deepdivePayload());
    if (!r.success) {
      throw new Error(
        `the shape TECHPAR_MODE_RULE instructs was rejected:\n  ${r.error.issues
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('\n  ')}`
      );
    }
    expect(r.success).toBe(true);
  });

  it('rejects the shape the FIRST cut of this rule described', () => {
    // "do not supply rdOpEx; the engine ignores it" — the engine does, the
    // schema does not. This is the paired negative: if a future edit makes the
    // omission legal, the rule's wire-shape paragraph is stale and should move
    // with it.
    const { rdOpEx: _v, ...noValue } = deepdivePayload() as Record<string, unknown>;
    const audit = { ...(noValue._audit as Record<string, unknown>) };
    delete audit.rdOpEx;
    const r = AuditedTechParInputsSchema.safeParse({ ...noValue, _audit: audit });
    expect(r.success).toBe(false);
  });

  it('a zeroed component is legal, which is why the (J) rule carries the weight', () => {
    // Nothing in the schema or engine objects to prodCost/toolingCost of 0 —
    // the number simply comes out smaller and the zone verdict softer. The
    // only guard against a silently flattering figure is the gap-list
    // instruction, so it has to be in a directive every calling body renders.
    const r = AuditedTechParInputsSchema.safeParse(
      deepdivePayload({ prodCost: 0, toolingCost: 0 })
    );
    expect(r.success).toBe(true);
  });

  it('the payload above is the shape the rule actually instructs', () => {
    // Without this the fixture and the rule can drift apart silently: the file
    // would keep proving that SOME legal payload parses while the prompt told
    // the model to build a different one. Bind the two.
    expect(TECHPAR_MODE_RULE).toContain('`mode: "deepdive"`');
    expect(TECHPAR_MODE_RULE).toContain('pass `rdOpEx: 0`');
    expect(TECHPAR_MODE_RULE).toContain('irl-annualized-stated');
    expect(TECHPAR_MODE_RULE).toContain('Section --');
    const audit = (deepdivePayload()._audit as Record<string, Record<string, string>>).rdOpEx;
    expect(audit.annualizationSource).toBe('irl-annualized-stated');
    expect(audit.citation.startsWith('Section --')).toBe(true);
  });
});
