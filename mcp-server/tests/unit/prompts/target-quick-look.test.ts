import { describe, it, expect } from 'vitest';
import { targetQuickLookPrompt } from '../../../src/prompts/target-quick-look';

const VALID_ARGS = {
  targetName: 'Acme Corp',
  productType: 'b2b-saas',
  arr: 25_000_000,
  // Canonical funding stage (BL-031.87) — replaces the portfolio-style
  // 'Scaling Growth' literal. Each downstream tool's wrapper translates
  // this canonical value to its native enum locally.
  stage: 'series-b' as const,
  hqJurisdiction: 'us-ca',
};

describe('gst_target_quick_look', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(targetQuickLookPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema parses a representative payload', () => {
    expect(targetQuickLookPrompt.argsSchema.safeParse(VALID_ARGS).success).toBe(true);
  });

  it('argsSchema rejects negative arr', () => {
    expect(targetQuickLookPrompt.argsSchema.safeParse({ ...VALID_ARGS, arr: -1 }).success).toBe(
      false
    );
  });

  it('argsSchema rejects empty hqJurisdiction', () => {
    expect(
      targetQuickLookPrompt.argsSchema.safeParse({ ...VALID_ARGS, hqJurisdiction: '' }).success
    ).toBe(false);
  });

  it('build() returns at least one message', () => {
    const parsed = targetQuickLookPrompt.argsSchema.parse(VALID_ARGS);
    expect(targetQuickLookPrompt.build(parsed).messages.length).toBeGreaterThanOrEqual(1);
  });

  it('message body mentions every orchestrates entry literally', () => {
    const parsed = targetQuickLookPrompt.argsSchema.parse(VALID_ARGS);
    const allText = targetQuickLookPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    for (const ref of targetQuickLookPrompt.orchestrates) {
      expect(allText, `body should mention ${ref}`).toContain(ref);
    }
  });

  it('accepts arr as a numeric string (Claude Desktop wire shape)', () => {
    const r = targetQuickLookPrompt.argsSchema.safeParse({
      ...VALID_ARGS,
      arr: '25000000',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.arr).toBe(25_000_000);
  });

  it('accepts arr as an actual number (forward-compat)', () => {
    const r = targetQuickLookPrompt.argsSchema.safeParse(VALID_ARGS);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.arr).toBe(VALID_ARGS.arr);
  });

  it('normalizes case variants on the canonical stage enum (case-tolerance contract)', () => {
    const r = targetQuickLookPrompt.argsSchema.safeParse({
      ...VALID_ARGS,
      stage: 'Series-B', // canonical (after enumFromWire normalization): 'series-b'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.stage).toBe('series-b');
  });

  it('accepts every canonical funding-stage value (BL-031.87 contract)', () => {
    for (const canonical of ['seed', 'series-a', 'series-b', 'series-c', 'pe', 'enterprise']) {
      const r = targetQuickLookPrompt.argsSchema.safeParse({ ...VALID_ARGS, stage: canonical });
      expect(r.success, `canonical stage '${canonical}' should parse`).toBe(true);
    }
  });

  it('rejects portfolio-style growth-stage values (BL-031.87 contract enforces canonical layer)', () => {
    // Pre-BL-031.87 the prompt accepted portfolio-enum values like
    // 'Scaling Growth'. Post-BL-031.87, the canonical layer is the
    // contract — portfolio enum values must be rejected so callers
    // adopt the canonical taxonomy.
    expect(
      targetQuickLookPrompt.argsSchema.safeParse({ ...VALID_ARGS, stage: 'Scaling Growth' }).success
    ).toBe(false);
  });

  it("instructs the model on the 'not sure' (-1) ICG fallback", () => {
    const parsed = targetQuickLookPrompt.argsSchema.parse(VALID_ARGS);
    const allText = targetQuickLookPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('-1');
    expect(allText).toMatch(/not\s*sure/i);
    expect(allText.toLowerCase()).toContain('never skip');
  });

  it('enumerates every ICG question ID by domain (regression guard for V2 finding #3)', () => {
    // The model must use schema-canonical compound IDs (q<domain>_<index>)
    // — the engine silently ignores unknown keys, so flat IDs (q1, q2, ...)
    // produce a misleading no-answer baseline. Mirrors the 20 IDs declared
    // in src/data/infrastructure-cost-governance/domains.ts.
    const parsed = targetQuickLookPrompt.argsSchema.parse(VALID_ARGS);
    const allText = targetQuickLookPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    const expected = [
      'q1_1',
      'q1_2',
      'q1_3',
      'q2_1',
      'q2_2',
      'q2_3',
      'q2_4',
      'q3_1',
      'q3_2',
      'q3_3',
      'q4_1',
      'q4_2',
      'q4_3',
      'q5_1',
      'q5_2',
      'q5_3',
      'q6_1',
      'q6_2',
      'q6_3',
      'q6_4',
    ];
    expect(expected.length).toBe(20);
    for (const id of expected) {
      expect(allText, `body should mention ICG question ID ${id}`).toContain(id);
    }
    expect(allText).toContain('20 questions');
  });

  // ─── Evidence-conditional conformance ─────────────────────────────────
  //
  // Three defects this prompt shipped, each provable against the artifact that
  // DECIDES rather than the one that describes:
  //
  //   - Step 1a derived from "supplied inputs + anything the user has shared
  //     earlier in the conversation" while Step 2 hardcoded a `Section --`
  //     citation and Step 3 said to SYNTHESIZE raw inputs from stage norms.
  //     Under the derived-tier discipline `Section --` grades as
  //     `partner-supplied`, so a real Section-00 ARR figure and a stage-norm
  //     guess arrived at IDENTICAL provenance grade.
  //   - `compute_techpar.mode` is a required enum with no default and Step 2
  //     named none — the exact condition that produced a 1.9x `rdOpEx`
  //     divergence and an inverted zone verdict on another caller.
  //   - `estimate_tech_debt_cost` was called without its required `_audit`, so
  //     the call as written FAILED validation.
  describe('evidence-conditional conformance', () => {
    const body = (): string =>
      targetQuickLookPrompt
        .build(targetQuickLookPrompt.argsSchema.parse(VALID_ARGS))
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');

    it('carries the shared evidence-precedence clause and declares the flag', () => {
      expect(targetQuickLookPrompt.consumesTargetEvidence).toBe(true);
      expect(body()).toContain('Canonical GST target evidence takes precedence over synthesis.');
    });

    it('states BOTH TechPar mode branches, and states why each is the right one', () => {
      const text = body();
      expect(text).toContain('`mode: "quick"`');
      expect(text).toContain('`mode: "deepdive"`');
      // The reasons, not just the tokens: `deepdive` over three zeros is the
      // failure mode the no-evidence branch avoids.
      expect(text).toMatch(/summing three zeros|sum(ming)? three zeros/i);
      expect(text).toMatch(/Section 02 component/i);
    });

    it('imports TECHPAR_MODE_RULE rather than paraphrasing its substance', () => {
      // The rule constant carries the anti-mapping ("do NOT source it from the
      // Section 04 remediation figure") that a paraphrase would drop — and a
      // request-text match structurally cannot encode a negative.
      expect(body()).toContain('Section 04 technical-debt remediation figure');
    });

    it('carries the adaptation note for both imported rules — this prompt has no (J) and no dossier', () => {
      const text = body();
      expect(text).toMatch(/Adaptation note for 2b/);
      expect(text).toMatch(/Adaptation note for 3c/);
      expect(text).toMatch(/neither a \(J\) gap list nor a dossier/i);
      expect(text).toContain('Assumptions / unknowns');
    });

    it('names every required TechPar field Step 2 used to omit', () => {
      // Verified by execution in
      // `tests/integration/irl-extract-record-consumers.test.ts`: a call
      // missing any of these is a validation rejection, not a defaulted field.
      const text = body();
      for (const field of [
        'mode',
        'exitMultiple',
        'engFTE',
        'engCost',
        'prodCost',
        'toolingCost',
        'infraHostingAnnual',
        'infraPersonnel',
        'rdOpEx',
        'rdCapEx',
      ]) {
        expect(text, `Step 2 does not name required field ${field}`).toContain(field);
      }
    });

    it('reuses buildPartnerSuppliedTechParAudit rather than restating the shape inline', () => {
      // Rendered from the helper, so the block and the helper cannot disagree.
      // The sentinel prefix is what schema suites pin, and the helper preserves
      // it — so `deriveTier()` grading is unaffected by the swap.
      const text = body();
      expect(text).toContain('Section -- — partner-supplied form input');
      expect(text).toContain('"monetaryBasis"');
      expect(text).toContain('"annualizationSource": "irl-annualized-stated"');
      expect(text).toContain('buildPartnerSuppliedTechParAudit');
    });

    it('Step 3 supplies the required _audit and every tech-debt source enum value', () => {
      const text = body();
      expect(text).toContain('mttrSource');
      expect(text).toContain('incidentsSource');
      for (const value of ['irl-stated', 'irl-open', 'irl-absent', 'irl-scope-mismatch']) {
        expect(text, `tech-debt source enum missing: ${value}`).toContain(value);
      }
      // The no-evidence branch must pass null, not a norm — and the reason is
      // stated, since the enum has no honest value for "synthesized".
      expect(text).toContain('`mttrHours: null`');
      expect(text).toContain('extractionOnly');
      expect(text).toMatch(/no value meaning "synthesized from stage norms"/i);
    });

    it('forbids the synthesized zero the BL-045 guard rejects', () => {
      expect(body()).toMatch(/Never emit a synthesized zero under `irl-stated`/);
    });

    it('no longer tells the model to synthesize tech-debt raw inputs unconditionally', () => {
      // The original Step 3 said "Synthesize raw inputs (…) from productType +
      // stage norms" with no branch and no `_audit` at all.
      expect(body()).not.toMatch(/Synthesize raw inputs \(teamSize/);
    });

    it('declares list_regulation_facets in orchestrates, not only in the body', () => {
      // The registry invariant checks orchestrates→body, not the reverse, so a
      // body-only mention is silent.
      expect(targetQuickLookPrompt.orchestrates).toContain('list_regulation_facets');
      expect(body()).toContain('list_regulation_facets');
    });
  });
});
