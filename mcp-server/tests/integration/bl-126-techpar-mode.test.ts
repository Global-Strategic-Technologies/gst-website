/**
 * BL-126 — the payload the prompt describes must actually parse.
 *
 * The string-presence assertions in `bl-125-run-parameters.test.ts` prove the
 * prompt *says* something. They cannot prove the thing it says is legal, and
 * the first cut of this change said the wrong thing: it instructed the model
 * not to supply `rdOpEx` at all under `deepdive`, on the reasoning that the
 * engine ignores it — but the schema then required the field in both modes,
 * so a compliant model would have been hard-rejected on the exact path this
 * change exists to make deterministic.
 *
 * This file closes that class: build the payload the prompt describes and run
 * it through the real schema AND the real refinement runner. A presence test
 * could not have caught it; only running the shape could.
 *
 * BL-163 changed the shape: `rdOpEx` is now nullable and `_audit.rdOpEx`
 * optional under deepdive, and a blank component is `null` + `irl-absent`,
 * replacing the `rdOpEx: 0` + `irl-annualized-stated` + `Section --`
 * placeholder the rule used to prescribe.
 */

import { describe, it, expect } from 'vitest';
import {
  AuditedTechParInputsSchema,
  runTechParAuditRefinements,
  type AuditCarryingTechParInputs,
} from '../../src/schemas/techpar-audit';
import { TECHPAR_MODE_RULE } from '../../src/prompts/extraction-rules';

const CITE = 'Section 02 — Engineering FTE count: 58 total, 8 infrastructure / SRE';
const SOURCED = { annualizationSource: 'irl-annualized-stated' as const, citation: CITE };

/** Exactly what TECHPAR_MODE_RULE instructs: rdOpEx null, no _audit.rdOpEx. */
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
    rdOpEx: null,
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
      engCost: SOURCED,
      prodCost: SOURCED,
      toolingCost: SOURCED,
    },
    ...over,
  };
}

/** Parse, then run the handler-side refinements; returns every failure. */
function problems(payload: Record<string, unknown>): string[] {
  const r = AuditedTechParInputsSchema.safeParse(payload);
  if (!r.success) {
    return r.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`);
  }
  return runTechParAuditRefinements(r.data as AuditCarryingTechParInputs).map(
    (i) => `[${i.ruleId}] ${i.path.join('.')}`
  );
}

describe('BL-126 — the deepdive payload the prompt describes is accepted', () => {
  it('parses and passes the refinements with rdOpEx: null and no _audit.rdOpEx', () => {
    expect(problems(deepdivePayload())).toEqual([]);
  });

  it('a blank component as null + irl-absent is accepted', () => {
    const payload = deepdivePayload({ toolingCost: null });
    const audit = payload._audit as Record<string, unknown>;
    audit.toolingCost = {
      annualizationSource: 'irl-absent',
      citation: 'Section 02 — annual build/tooling cost bullet left blank by the target',
    };
    expect(problems(payload)).toEqual([]);
  });

  it('a null component still claiming a derivation is rejected', () => {
    expect(problems(deepdivePayload({ toolingCost: null }))).toContain(
      '[BL-163-TECHPAR-ABSENT-SOURCE-REQUIRED-FOR-NULL] _audit.toolingCost.annualizationSource'
    );
  });

  it('the payload above is the shape the rule actually instructs', () => {
    // Without this the fixture and the rule can drift apart silently: the file
    // would keep proving that SOME legal payload parses while the prompt told
    // the model to build a different one. Bind the two.
    expect(TECHPAR_MODE_RULE).toContain('`mode: "deepdive"`');
    expect(TECHPAR_MODE_RULE).toContain('pass `rdOpEx: null` and omit `_audit.rdOpEx`');
    expect(TECHPAR_MODE_RULE).toContain('annualizationSource: "irl-absent"');
    expect(TECHPAR_MODE_RULE).not.toContain('rdOpEx: 0');
    const payload = deepdivePayload();
    expect(payload.rdOpEx).toBeNull();
    expect((payload._audit as Record<string, unknown>).rdOpEx).toBeUndefined();
  });
});
