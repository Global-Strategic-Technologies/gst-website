import { describe, it, expect } from 'vitest';
import { architectureLayerReviewPrompt } from '../../../src/prompts/architecture-layer-review';

const VALID_ARGS = {
  targetSummary:
    'A B2B SaaS observability platform; 60 employees; $15M ARR; multi-cloud (AWS primary, GCP secondary).',
};

describe('gst_architecture_layer_review', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(architectureLayerReviewPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema parses a representative payload', () => {
    expect(architectureLayerReviewPrompt.argsSchema.safeParse(VALID_ARGS).success).toBe(true);
  });

  it('argsSchema rejects a too-short summary', () => {
    expect(
      architectureLayerReviewPrompt.argsSchema.safeParse({ targetSummary: 'too short' }).success
    ).toBe(false);
  });

  it('build() returns at least one message', () => {
    const parsed = architectureLayerReviewPrompt.argsSchema.parse(VALID_ARGS);
    expect(architectureLayerReviewPrompt.build(parsed).messages.length).toBeGreaterThanOrEqual(1);
  });

  it('message body mentions every orchestrates entry literally', () => {
    const parsed = architectureLayerReviewPrompt.argsSchema.parse(VALID_ARGS);
    const allText = architectureLayerReviewPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    for (const ref of architectureLayerReviewPrompt.orchestrates) {
      expect(allText).toContain(ref);
    }
  });

  it('embeds the canonical Library article as a second message', () => {
    const parsed = architectureLayerReviewPrompt.argsSchema.parse(VALID_ARGS);
    const result = architectureLayerReviewPrompt.build(parsed);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    const second = result.messages[1].content;
    expect(second.type).toBe('resource');
    if (second.type === 'resource' && 'text' in second.resource) {
      expect(second.resource.uri).toBe('gst://library/business-architectures');
      expect(second.resource.text).toBeTruthy();
    }
  });
});
