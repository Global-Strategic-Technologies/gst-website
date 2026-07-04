import { describe, it, expect } from 'vitest';
import { informationRequestListPrompt } from '../../../src/prompts/information-request-list';

// v0.0.6: the prompt embeds the decoupled IRL generator source (inline label
// gst://irl/source), NOT the gst://library/information-request-list article.
const IRL_SOURCE_EMBED_URI = 'gst://irl/source';
const XLSX_TOOL_NAME = 'generate_information_request_list_xlsx';

// Mirror the MCP SDK: it validates + coerces incoming args against argsSchema
// (turning wire strings like `includeSections: '00,01'` into `['00','01']`)
// before invoking build(). Parsing here keeps the test faithful to production.
function bodyText(
  prompt: typeof informationRequestListPrompt,
  args: Record<string, unknown>
): string {
  const parsed = prompt.argsSchema.parse(args);
  return prompt
    .build(parsed)
    .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');
}

describe('gst_information_request_list', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(informationRequestListPrompt.name).toMatch(/^gst_/);
  });

  it('declares the required GstPrompt fields with concrete values', () => {
    // v0.0.2 = BL-044 (additive file-attachment behavior).
    // v0.0.3 = voice-cue copy fix (drop "underwriting"/"before the LOI" buy-side
    // anchor + "post-close" value-creation anchor — accuracy + label alignment).
    // v0.0.4 = Step 4 update (don't promise attachment in Claude Desktop;
    // redirect to Hub page after the staging round-trip surfaced the
    // arbitrary-mimeType resource-block limitation).
    // v0.0.5 = configurability parity with the Hub generator (companyName /
    // projectName title, includeSections pick-list, customRequests,
    // showCanonicalReference) — forwarded as the exact XLSX tool payload.
    // v0.0.6 = IRL decoupling: embed + section catalog moved off the library
    // article Resource onto the dedicated generator source (gst://irl/source).
    expect(informationRequestListPrompt.version).toBe('0.0.6');
    expect(informationRequestListPrompt.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(informationRequestListPrompt.orchestrates).toEqual([
      IRL_SOURCE_EMBED_URI,
      XLSX_TOOL_NAME,
    ]);
  });

  describe('argsSchema', () => {
    it('accepts an empty payload (interactive mode)', () => {
      expect(informationRequestListPrompt.argsSchema.safeParse({}).success).toBe(true);
    });

    it('accepts targetName alone', () => {
      expect(
        informationRequestListPrompt.argsSchema.safeParse({ targetName: 'MedSig Health' }).success
      ).toBe(true);
    });

    it('accepts targetName + transactionContext', () => {
      expect(
        informationRequestListPrompt.argsSchema.safeParse({
          targetName: 'MedSig Health',
          transactionContext: 'buy-side',
        }).success
      ).toBe(true);
    });

    it('accepts all three args', () => {
      expect(
        informationRequestListPrompt.argsSchema.safeParse({
          targetName: 'MedSig Health',
          transactionContext: 'sell-side',
          productSummary: 'Pure-play SaaS for European hospital RCM workflows.',
        }).success
      ).toBe(true);
    });

    it('rejects an invalid transactionContext enum value', () => {
      const result = informationRequestListPrompt.argsSchema.safeParse({
        transactionContext: 'weird-value',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['transactionContext']);
      }
    });

    it('rejects an empty targetName (min length 1)', () => {
      const result = informationRequestListPrompt.argsSchema.safeParse({ targetName: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['targetName']);
      }
    });

    it('rejects a productSummary below the 10-char minimum', () => {
      const result = informationRequestListPrompt.argsSchema.safeParse({ productSummary: 'too' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['productSummary']);
      }
    });

    it('accepts companyName + projectName', () => {
      expect(
        informationRequestListPrompt.argsSchema.safeParse({
          companyName: 'Praxis Capital',
          projectName: 'Project Titan',
        }).success
      ).toBe(true);
    });

    it('coerces a comma-separated includeSections wire string into a string array', () => {
      // Claude Desktop ships every prompt arg as a raw string; arrayFromWire
      // splits the comma form into the array the tool payload needs.
      const result = informationRequestListPrompt.argsSchema.safeParse({
        includeSections: '00,01,03',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeSections).toEqual(['00', '01', '03']);
      }
    });

    it('coerces a "true" showCanonicalReference wire string into a boolean', () => {
      const result = informationRequestListPrompt.argsSchema.safeParse({
        showCanonicalReference: 'true',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.showCanonicalReference).toBe(true);
      }
    });

    it('documents the full section catalog in the includeSections describe', () => {
      // The Claude Desktop prompt form shows this describe; enumerating the
      // sections there tells the user (and the model) which numbers exist.
      const description =
        informationRequestListPrompt.argsSchema.shape.includeSections.description ?? '';
      expect(description).toContain('02 Software Architecture');
      expect(description).toContain('09 Governance & Compliance');
    });

    it('treats empty wire strings for includeSections / showCanonicalReference as unsupplied', () => {
      // Unfilled Desktop form fields arrive as "" — the wire adapters normalize
      // them to undefined so an empty field never trips validation.
      const result = informationRequestListPrompt.argsSchema.safeParse({
        includeSections: '',
        showCanonicalReference: '',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeSections).toBeUndefined();
        expect(result.data.showCanonicalReference).toBeUndefined();
      }
    });
  });

  describe('build() — message structure', () => {
    it('returns at least one message in both interactive and one-shot modes', () => {
      expect(informationRequestListPrompt.build({}).messages.length).toBeGreaterThanOrEqual(1);
      expect(
        informationRequestListPrompt.build({ targetName: 'Acme' }).messages.length
      ).toBeGreaterThanOrEqual(1);
    });

    it('embeds the IRL generator source as the second message in both modes', () => {
      for (const args of [{}, { targetName: 'Acme' }]) {
        const result = informationRequestListPrompt.build(args);
        expect(result.messages.length).toBe(2);
        const second = result.messages[1].content;
        expect(second.type).toBe('resource');
        if (second.type === 'resource' && 'text' in second.resource) {
          // Decoupled: the embed is the generator source, NOT the library article.
          expect(second.resource.uri).toBe(IRL_SOURCE_EMBED_URI);
          expect(typeof second.resource.text).toBe('string');
          expect(second.resource.text.length).toBeGreaterThan(500);
        }
      }
    });

    it('mentions the generator-source embed URI literally in every mode (orchestrates invariant)', () => {
      for (const args of [{}, { targetName: 'Acme' }]) {
        const text = bodyText(informationRequestListPrompt, args);
        expect(text).toContain(IRL_SOURCE_EMBED_URI);
      }
    });

    it('mentions the XLSX tool literally in one-shot mode only (per BL-044 acceptance)', () => {
      // Bare invocation MUST NOT mention the tool — text-only behavior is
      // unchanged at v0.0.2 (BL-044 acceptance: "Bare invocation
      // (interactive mode) unchanged behaviorally"). Any args triggers the
      // tool-call directive.
      const oneShot = bodyText(informationRequestListPrompt, { targetName: 'Acme' });
      const interactive = bodyText(informationRequestListPrompt, {});
      expect(oneShot).toContain(XLSX_TOOL_NAME);
      expect(interactive).not.toContain(XLSX_TOOL_NAME);
    });
  });

  describe('build() — interactive mode (no args)', () => {
    it('asks the user for target context before emitting', () => {
      const text = bodyText(informationRequestListPrompt, {});
      // The interactive question lists all three engagement types as the visible
      // signal that we're in interactive mode (not one-shot).
      expect(text).toMatch(/sell-side.*buy-side.*value-creation/i);
    });
  });

  describe('build() — one-shot mode (args supplied)', () => {
    it('embeds the supplied targetName verbatim', () => {
      const text = bodyText(informationRequestListPrompt, { targetName: 'MedSig-Marker-XYZ' });
      expect(text).toContain('MedSig-Marker-XYZ');
    });

    it('includes a sell-side voice cue when transactionContext is sell-side', () => {
      const text = bodyText(informationRequestListPrompt, { transactionContext: 'sell-side' });
      expect(text.toLowerCase()).toContain('sell-side');
      expect(text.toLowerCase()).toContain('story to tell');
    });

    it('includes a buy-side voice cue framing GST as supporting (not underwriting) + acknowledging both pre-LOI and LOI-stage engagements', () => {
      const text = bodyText(informationRequestListPrompt, { transactionContext: 'buy-side' });
      const lower = text.toLowerCase();
      expect(lower).toContain('buy-side');
      // v0.0.3 anchors: GST supports the buyer's evaluation (it does not
      // "underwrite") and the engagement may be pre-LOI OR LOI-stage (the
      // old "before the LOI" framing falsely constrained timing).
      expect(lower).toContain('supporting');
      expect(lower).toContain('pre-loi or loi-stage');
      expect(lower).not.toContain('underwriting');
      expect(lower).not.toContain('before the loi');
    });

    it('embeds the supplied productSummary so the model can compress repeat questions', () => {
      const summary = 'Pure-play SaaS, no on-prem deployment, EU healthcare only.';
      const text = bodyText(informationRequestListPrompt, { productSummary: summary });
      expect(text).toContain(summary);
    });

    it('switches to one-shot mode when ANY arg is supplied, not just all three', () => {
      const text = bodyText(informationRequestListPrompt, {
        transactionContext: 'value-creation',
      });
      // One-shot bodies have the "Step 1" / "Step 2" instruction pattern;
      // interactive bodies have the user-prompt block above.
      expect(text).toContain('Step 1.');
      expect(text).toContain('Step 2.');
    });

    it('one-shot body instructs the model to call the XLSX tool AND direct the partner to the Hub page', () => {
      const text = bodyText(informationRequestListPrompt, { targetName: 'Acme' });
      expect(text).toContain(XLSX_TOOL_NAME);
      // v0.0.4 anchors: model must NOT promise an attachment (Claude
      // Desktop renderer can't surface it); MUST point at the Hub page
      // where the same file is downloadable client-side. If either side
      // of this assertion drifts, the prompt has lost the redirect
      // discipline that the post-staging-round-trip fix established.
      expect(text).toMatch(/hub\/tools\/information-request-list-generator/);
      expect(text.toLowerCase()).toMatch(/do not promise an attachment/);
    });

    it('switches to one-shot mode when only a new config arg (companyName) is supplied', () => {
      const text = bodyText(informationRequestListPrompt, { companyName: 'Praxis Capital' });
      expect(text).toContain('Step 1.');
      expect(text).toContain(XLSX_TOOL_NAME);
    });

    it('composes the artifact title from companyName + projectName', () => {
      const text = bodyText(informationRequestListPrompt, {
        companyName: 'Praxis Capital',
        projectName: 'Project Titan',
      });
      expect(text).toContain('Praxis Capital Project Titan Information Request List');
    });

    it('forwards the full configuration as the exact XLSX tool payload', () => {
      // The one-shot body embeds the precise tool arguments so the model passes
      // them verbatim and the generated .xlsx matches the artifact. Parse the
      // fenced JSON block and assert the structured shape (not just substrings).
      const text = bodyText(informationRequestListPrompt, {
        targetName: 'MedSig Health',
        companyName: 'Praxis Capital',
        projectName: 'Project Titan',
        transactionContext: 'buy-side',
        includeSections: '00,01',
        customRequests: '01: Describe your top 3 competitors by ARR',
        showCanonicalReference: 'true',
      });
      const jsonBlock = text.match(/```json\n([\s\S]*?)\n```/);
      expect(jsonBlock).toBeTruthy();
      const payload = JSON.parse(jsonBlock![1]);
      expect(payload).toEqual({
        targetName: 'MedSig Health',
        transactionContext: 'buy-side',
        companyName: 'Praxis Capital',
        projectName: 'Project Titan',
        includeSections: ['00', '01'],
        customRequests: [{ section: '01', text: 'Describe your top 3 competitors by ARR' }],
        showCanonicalReference: true,
      });
    });

    it('instructs the model to reproduce only the requested sections', () => {
      const text = bodyText(informationRequestListPrompt, { includeSections: '00,03,09' });
      expect(text).toMatch(/ONLY these sections.*00, 03, 09/);
    });

    it('appends parsed custom requests under their section in the in-chat artifact', () => {
      const text = bodyText(informationRequestListPrompt, {
        customRequests: '01: Ask about competitors\n03: Ask about DR posture',
      });
      expect(text).toContain('Section 01: Ask about competitors');
      expect(text).toContain('Section 03: Ask about DR posture');
    });

    it('omits config the caller did not supply from the tool payload', () => {
      const text = bodyText(informationRequestListPrompt, { targetName: 'Acme' });
      const jsonBlock = text.match(/```json\n([\s\S]*?)\n```/);
      const payload = JSON.parse(jsonBlock![1]);
      expect(payload).toEqual({ targetName: 'Acme' });
      expect(payload.includeSections).toBeUndefined();
      expect(payload.showCanonicalReference).toBeUndefined();
    });
  });

  describe('build() — interactive mode unchanged at v0.0.2 (BL-044 acceptance)', () => {
    it('bare invocation body does NOT mention the XLSX tool', () => {
      // Per BL-044 acceptance criteria: "Bare invocation (interactive mode)
      // unchanged behaviorally — still emits text-only." The XLSX tool only
      // fires when the model has args to call it with.
      const text = bodyText(informationRequestListPrompt, {});
      expect(text).not.toContain(XLSX_TOOL_NAME);
    });
  });
});
