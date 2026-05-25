import { describe, it, expect } from 'vitest';
import { informationRequestListPrompt } from '../../../src/prompts/information-request-list';

const RESOURCE_URI = 'gst://library/information-request-list';
const XLSX_TOOL_NAME = 'generate_information_request_list_xlsx';

function bodyText(
  prompt: typeof informationRequestListPrompt,
  args: Parameters<typeof prompt.build>[0]
): string {
  return prompt
    .build(args)
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
    expect(informationRequestListPrompt.version).toBe('0.0.3');
    expect(informationRequestListPrompt.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(informationRequestListPrompt.orchestrates).toEqual([RESOURCE_URI, XLSX_TOOL_NAME]);
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
  });

  describe('build() — message structure', () => {
    it('returns at least one message in both interactive and one-shot modes', () => {
      expect(informationRequestListPrompt.build({}).messages.length).toBeGreaterThanOrEqual(1);
      expect(
        informationRequestListPrompt.build({ targetName: 'Acme' }).messages.length
      ).toBeGreaterThanOrEqual(1);
    });

    it('embeds the canonical Library Resource as the second message in both modes', () => {
      for (const args of [{}, { targetName: 'Acme' }]) {
        const result = informationRequestListPrompt.build(args);
        expect(result.messages.length).toBe(2);
        const second = result.messages[1].content;
        expect(second.type).toBe('resource');
        if (second.type === 'resource' && 'text' in second.resource) {
          expect(second.resource.uri).toBe(RESOURCE_URI);
          expect(typeof second.resource.text).toBe('string');
          expect(second.resource.text.length).toBeGreaterThan(500);
        }
      }
    });

    it('mentions the Resource URI literally in every mode (orchestrates invariant)', () => {
      for (const args of [{}, { targetName: 'Acme' }]) {
        const text = bodyText(informationRequestListPrompt, args);
        expect(text).toContain(RESOURCE_URI);
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

    it('one-shot body instructs the model to call the XLSX tool (BL-044 behavior addition)', () => {
      const text = bodyText(informationRequestListPrompt, { targetName: 'Acme' });
      expect(text).toContain(XLSX_TOOL_NAME);
      // The call instruction must reference the tool's return shape so the
      // model knows what to attach. If this assertion drifts, the prompt
      // body has lost the file-attachment directive.
      expect(text).toMatch(/filename.*base64.*mimeType/i);
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
