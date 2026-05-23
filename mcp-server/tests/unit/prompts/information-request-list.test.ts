import { describe, it, expect } from 'vitest';
import { informationRequestListPrompt } from '../../../src/prompts/information-request-list';

const RESOURCE_URI = 'gst://library/information-request-list';

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
    expect(informationRequestListPrompt.version).toBe('0.0.1');
    expect(informationRequestListPrompt.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(informationRequestListPrompt.orchestrates).toEqual([RESOURCE_URI]);
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

    it('mentions every orchestrates entry literally in the body', () => {
      for (const args of [{}, { targetName: 'Acme' }]) {
        const text = bodyText(informationRequestListPrompt, args);
        for (const ref of informationRequestListPrompt.orchestrates) {
          expect(text).toContain(ref);
        }
      }
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

    it('includes a buy-side voice cue when transactionContext is buy-side', () => {
      const text = bodyText(informationRequestListPrompt, { transactionContext: 'buy-side' });
      expect(text.toLowerCase()).toContain('buy-side');
      expect(text.toLowerCase()).toContain('underwriting');
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
  });
});
