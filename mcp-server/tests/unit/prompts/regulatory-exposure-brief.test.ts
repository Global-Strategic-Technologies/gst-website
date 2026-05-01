import { describe, it, expect } from 'vitest';
import { regulatoryExposureBriefPrompt } from '../../../src/prompts/regulatory-exposure-brief';

const VALID_ARGS = {
  targetJurisdictions: ['eu', 'us-ca'],
  dataCategories: ['data-privacy', 'ai-governance'],
  productType: 'b2b-saas',
};

describe('gst_regulatory_exposure_brief', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(regulatoryExposureBriefPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema parses a representative payload', () => {
    expect(regulatoryExposureBriefPrompt.argsSchema.safeParse(VALID_ARGS).success).toBe(true);
  });

  it('argsSchema rejects empty jurisdictions array', () => {
    expect(
      regulatoryExposureBriefPrompt.argsSchema.safeParse({
        ...VALID_ARGS,
        targetJurisdictions: [],
      }).success
    ).toBe(false);
  });

  it('argsSchema rejects empty dataCategories array', () => {
    expect(
      regulatoryExposureBriefPrompt.argsSchema.safeParse({
        ...VALID_ARGS,
        dataCategories: [],
      }).success
    ).toBe(false);
  });

  it('build() returns at least one message', () => {
    const parsed = regulatoryExposureBriefPrompt.argsSchema.parse(VALID_ARGS);
    expect(regulatoryExposureBriefPrompt.build(parsed).messages.length).toBeGreaterThanOrEqual(1);
  });

  it('message body mentions every orchestrates entry literally', () => {
    const parsed = regulatoryExposureBriefPrompt.argsSchema.parse(VALID_ARGS);
    const allText = regulatoryExposureBriefPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    for (const ref of regulatoryExposureBriefPrompt.orchestrates) {
      expect(allText).toContain(ref);
    }
  });

  it('embeds the supplied jurisdictions in the body', () => {
    const parsed = regulatoryExposureBriefPrompt.argsSchema.parse(VALID_ARGS);
    const allText = regulatoryExposureBriefPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('eu');
    expect(allText).toContain('us-ca');
  });
});
