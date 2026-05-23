/**
 * Unit test for the gst_diligence_kickoff prompt.
 *
 * Asserts the four invariants every prompt-module test enforces:
 *   (a) name has the gst_ prefix,
 *   (b) argsSchema parses a representative payload + rejects missing fields,
 *   (c) build() returns at least one message,
 *   (d) the message body literally mentions every orchestrates entry.
 */

import { describe, it, expect } from 'vitest';
import { diligenceKickoffPrompt } from '../../../src/prompts/diligence-kickoff';

const VALID_ARGS = {
  targetName: 'Acme Corp',
  transactionType: 'full-acquisition',
  productType: 'b2b-saas',
  techArchetype: 'modern-cloud-native',
  headcount: '51-200',
  revenueRange: '5-25m',
  growthStage: 'scaling',
  companyAge: '5-10yr',
  geographies: ['us'] as const,
  businessModel: 'productized-platform',
  scaleIntensity: 'moderate',
  transformationState: 'mid-migration',
  dataSensitivity: 'high',
  operatingModel: 'centralized-eng',
};

describe('gst_diligence_kickoff', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(diligenceKickoffPrompt.name).toMatch(/^gst_/);
  });

  it('exposes targetName as the first argsSchema field (form-order contract)', () => {
    expect(Object.keys(diligenceKickoffPrompt.argsSchema.shape)[0]).toBe('targetName');
  });

  it('argsSchema parses a fully-populated payload', () => {
    const result = diligenceKickoffPrompt.argsSchema.safeParse(VALID_ARGS);
    expect(result.success).toBe(true);
  });

  it('argsSchema rejects payloads missing required fields', () => {
    const { targetName: _omitted, ...withoutTarget } = VALID_ARGS;
    const result = diligenceKickoffPrompt.argsSchema.safeParse(withoutTarget);
    expect(result.success).toBe(false);
  });

  it('argsSchema rejects an empty targetName', () => {
    const result = diligenceKickoffPrompt.argsSchema.safeParse({
      ...VALID_ARGS,
      targetName: '',
    });
    expect(result.success).toBe(false);
  });

  it('build() returns at least one message', () => {
    const parsed = diligenceKickoffPrompt.argsSchema.parse(VALID_ARGS);
    const result = diligenceKickoffPrompt.build(parsed);
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('message body mentions every orchestrates entry literally', () => {
    const parsed = diligenceKickoffPrompt.argsSchema.parse(VALID_ARGS);
    const result = diligenceKickoffPrompt.build(parsed);
    const allText = result.messages
      .map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    for (const ref of diligenceKickoffPrompt.orchestrates) {
      expect(allText).toContain(ref);
    }
  });

  it('embeds the canonical VDR Library article as a second message', () => {
    const parsed = diligenceKickoffPrompt.argsSchema.parse(VALID_ARGS);
    const result = diligenceKickoffPrompt.build(parsed);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    const second = result.messages[1].content;
    expect(second.type).toBe('resource');
    if (second.type === 'resource' && 'text' in second.resource) {
      expect(second.resource.uri).toBe('gst://library/vdr-structure');
      expect(second.resource.text).toBeTruthy();
    }
  });

  it('opens with the authorial-intent line', () => {
    const parsed = diligenceKickoffPrompt.argsSchema.parse(VALID_ARGS);
    const first = diligenceKickoffPrompt.build(parsed).messages[0].content;
    if (first.type === 'text') {
      expect(first.text).toMatch(/^Workflow invocation:/);
    } else {
      throw new Error('expected first message to be text content');
    }
  });

  it('embeds the targetName argument in the body', () => {
    const parsed = diligenceKickoffPrompt.argsSchema.parse(VALID_ARGS);
    const result = diligenceKickoffPrompt.build(parsed);
    const allText = result.messages
      .map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('Acme Corp');
  });

  describe("BL-031.95 Phase 2.D — 'unknown' defaulting on the 13 wizard fields", () => {
    it("argsSchema accepts a payload with only targetName supplied (all 13 wizard fields default to 'unknown')", () => {
      const result = diligenceKickoffPrompt.argsSchema.safeParse({ targetName: 'Acme Corp' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      // Every dimension defaulted to 'unknown' / ['unknown'].
      expect(result.data.transactionType).toBe('unknown');
      expect(result.data.productType).toBe('unknown');
      expect(result.data.techArchetype).toBe('unknown');
      expect(result.data.headcount).toBe('unknown');
      expect(result.data.revenueRange).toBe('unknown');
      expect(result.data.growthStage).toBe('unknown');
      expect(result.data.companyAge).toBe('unknown');
      expect(result.data.geographies).toEqual(['unknown']);
      expect(result.data.businessModel).toBe('unknown');
      expect(result.data.scaleIntensity).toBe('unknown');
      expect(result.data.transformationState).toBe('unknown');
      expect(result.data.dataSensitivity).toBe('unknown');
      expect(result.data.operatingModel).toBe('unknown');
    });

    it("partial payload — supplied fields keep their values; omitted fields default to 'unknown'", () => {
      const result = diligenceKickoffPrompt.argsSchema.safeParse({
        targetName: 'Acme Corp',
        productType: 'b2b-saas',
        geographies: ['us', 'eu'],
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.productType).toBe('b2b-saas');
      expect(result.data.geographies).toEqual(['us', 'eu']);
      // Unsupplied fields still default to 'unknown'.
      expect(result.data.transactionType).toBe('unknown');
      expect(result.data.headcount).toBe('unknown');
    });

    it("empty-string wire values (Claude Desktop unfilled form fields) default to 'unknown'", () => {
      const result = diligenceKickoffPrompt.argsSchema.safeParse({
        targetName: 'Acme Corp',
        transactionType: '',
        productType: '',
        techArchetype: '',
        headcount: '',
        revenueRange: '',
        growthStage: '',
        companyAge: '',
        geographies: '',
        businessModel: '',
        scaleIntensity: '',
        transformationState: '',
        dataSensitivity: '',
        operatingModel: '',
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.transactionType).toBe('unknown');
      expect(result.data.geographies).toEqual(['unknown']);
    });

    it('build() succeeds with a target-name-only payload and embeds unknown values verbatim', () => {
      const parsed = diligenceKickoffPrompt.argsSchema.parse({ targetName: 'Acme Corp' });
      const result = diligenceKickoffPrompt.build(parsed);
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      const allText = result.messages
        .map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');
      // Body explicitly references each dimension's resolved value, so
      // 'unknown' literally appears in the rendered prompt.
      expect(allText).toContain('transactionType=unknown');
      expect(allText).toContain('productType=unknown');
    });
  });
});
